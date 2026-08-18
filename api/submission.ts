import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  GHL_LOCATION_ID,
  SUBMISSIONS_TABLE,
  type SubmissionRow,
} from './_lib/supabaseServer'
import { forwardWebhook } from './_lib/webhooks'
import { upsertGhlContact } from './_lib/ghlContacts'
import { type CalcInput, type CalcResult } from '../src/lib/costing-calc'
import { resolveContactIdForToken, resolveQuote } from './_lib/quoteSource'
import { createUnifiedPayload, type ContactFormData } from '../src/lib/unified-payload'
import { deriveFormType, mergeFormType, stepReachedFor, isStep } from '../src/lib/form-steps'

export type SubmissionAction = 'start' | 'step' | 'quote' | 'complete' | 'get'

export const SUBMISSION_ACTIONS: SubmissionAction[] = [
  'start',
  'step',
  'quote',
  'complete',
  'get',
]

export function isSubmissionAction(value: string): value is SubmissionAction {
  return (SUBMISSION_ACTIONS as string[]).includes(value)
}

type Result = { status: number; data: unknown }

/** Untrusted JSON off the wire. */
type Json = Record<string, unknown>

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

const HOUSE_KINDS = new Set(['terraced', 'semi_detached', 'detached', 'townhouse'])

function nowIso(): string {
  return new Date().toISOString()
}

/** Shallow jsonb merge — incoming fields win, untouched keys survive. */
function mergeFormData(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existing ?? {}) }
  for (const [key, value] of Object.entries(incoming ?? {})) {
    if (value === undefined) continue
    next[key] = value
  }
  return next
}

async function loadRow(token: string): Promise<SubmissionRow | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as SubmissionRow | null) ?? null
}

/**
 * Applies a step to the row: jsonb-merges `form_data`, advances `step_reached`
 * monotonically, and commits `form_type` once the branch is known.
 *
 * `step` is the step the user has just *arrived at* — the same value stored as
 * `form_data.currentStep` — so `step_reached` tracks how far they actually got.
 */
async function applyStep(args: {
  token: string
  step?: string | null
  fields?: Record<string, unknown> | null
  extra?: Record<string, unknown>
}): Promise<SubmissionRow | null> {
  const supabase = getSupabaseAdmin()
  const row = await loadRow(args.token)
  if (!row) return null

  const formData = mergeFormData(row.form_data, args.fields)

  const previousReached = row.step_reached ?? 1
  const stepReached = args.step
    ? Math.max(previousReached, stepReachedFor(args.step, previousReached))
    : previousReached

  const formType = mergeFormType(row.form_type, deriveFormType(args.step, formData))

  const email = asString(asRecord(formData.contactData).email) ?? row.email ?? null

  const update: Record<string, unknown> = {
    form_data: formData,
    step_reached: stepReached,
    updated_at: nowIso(),
    ...(formType ? { form_type: formType } : {}),
    ...(email ? { email } : {}),
    ...(args.extra ?? {}),
  }

  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .update(update)
    .eq('token', args.token)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as SubmissionRow | null) ?? null
}

/** Rebuilds a trustworthy `CalcInput` from whatever the client sent. */
export function sanitizeCalcInput(input: unknown): CalcInput | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Json

  const kind = raw.kind
  if (typeof kind !== 'string' || !HOUSE_KINDS.has(kind)) return null

  const bedrooms = Math.max(1, Math.min(5, Math.round(Number(raw.bedrooms) || 0)))

  const rawFrequency = raw.selectedFrequency
  const selectedFrequency: CalcInput['selectedFrequency'] =
    rawFrequency === 'one-off' || rawFrequency === 6 || rawFrequency === 8 || rawFrequency === 12
      ? rawFrequency
      : 8

  const hasConservatory = raw.hasConservatory === true || raw.hasConservatory === 'yes'

  let conservatoryRoofPricing: CalcInput['conservatoryRoofPricing'] = null
  const roof = asRecord(raw.conservatoryRoofPricing)
  if (hasConservatory) {
    if (roof.status === 'count' && Number.isFinite(Number(roof.panelCount))) {
      conservatoryRoofPricing = {
        status: 'count',
        panelCount: Math.max(1, Math.round(Number(roof.panelCount))),
      }
    } else if (roof.status === 'unknown') {
      conservatoryRoofPricing = { status: 'unknown' }
    }
  }

  const a = asRecord(raw.addons)
  return {
    kind: kind as CalcInput['kind'],
    bedrooms,
    hasExtension: raw.hasExtension === true || raw.hasExtension === 'yes',
    hasConservatory,
    conservatoryRoofPricing,
    selectedFrequency,
    addons: {
      gutterClear: a.gutterClear === true,
      fasciaClean: a.fasciaClean === true,
      conservatoryRoofCleanExternal: a.conservatoryRoofCleanExternal === true,
      conservatoryRoofCleanInternal: a.conservatoryRoofCleanInternal === true,
      adHocInternalClean: a.adHocInternalClean === true,
    },
  }
}

// ─────────────────────────── actions ───────────────────────────

/**
 * S1 — create the submission row, then create (or, if it already exists, update) the GHL
 * contact through the private integration token and record the contact id it returns.
 */
async function handleStart(body: Json): Promise<Result> {
  const supabase = getSupabaseAdmin()

  const contact = (body.contact ?? {}) as Partial<ContactFormData>
  const email = typeof body.email === 'string' ? body.email : (contact.email ?? null)
  const fields = asRecord(body.fields)

  const formData = mergeFormData({}, fields)
  const formType = deriveFormType('contact', formData)

  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .insert({
      location_id: GHL_LOCATION_ID,
      email,
      step_reached: 1,
      status: 'in_progress',
      form_data: formData,
      ...(formType ? { form_type: formType } : {}),
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  const row = data as SubmissionRow

  // Contact create/update — best effort, and never blocks the token coming back
  const ghl = await upsertGhlContact({
    fullName: contact.fullName ?? null,
    email,
    phone: contact.phone ?? null,
    webformToken: row.token,
  })

  if (ghl.error) {
    console.warn(`[submission:start] GHL contact ${ghl.outcome}: ${ghl.error}`)
  }

  if (ghl.contactId) {
    const { error: linkError } = await supabase
      .from(SUBMISSIONS_TABLE)
      .update({ contact_id: ghl.contactId, updated_at: nowIso() })
      .eq('token', row.token)
    if (linkError) {
      console.warn('[submission:start] failed to store contact_id:', linkError.message)
    }
  }

  return {
    status: 200,
    data: { token: row.token, contactId: ghl.contactId, contactOutcome: ghl.outcome },
  }
}

/** S2 / S4 — merge fields into `form_data` and advance `step_reached`. */
async function handleStep(body: Json): Promise<Result> {
  const token = body.token
  if (typeof token !== 'string' || !token) {
    return { status: 400, data: { error: 'token is required' } }
  }

  const step = asString(body.step)
  const row = await applyStep({ token, step, fields: asRecord(body.fields) })

  if (!row) return { status: 404, data: { error: 'Unknown token' } }

  return {
    status: 200,
    data: { ok: true, step_reached: row.step_reached, form_type: row.form_type },
  }
}

/**
 * S3 — the quote is resolved here, not in the browser. The resulting `CalcResult` is
 * written to `quote` and is also what gets pushed to the residentialFrequency GHL webhook,
 * so the price in the CRM always matches the price stored in Supabase.
 *
 * Prices come from the v3 bot pricing API when it is configured and can answer, and from
 * the local price book otherwise — `pricingSource` on the response says which, so a
 * divergence is diagnosable rather than invisible.
 */
async function handleQuote(body: Json): Promise<Result> {
  const token = typeof body.token === 'string' && body.token ? body.token : null

  const calcInput = sanitizeCalcInput(body.calcInput)
  if (!calcInput) {
    return { status: 400, data: { error: 'Invalid or incomplete calcInput' } }
  }

  const contactId =
    (await resolveContactIdForToken(token)) ??
    (typeof body.contactId === 'string' ? body.contactId : null)

  const resolved = await resolveQuote({ input: calcInput, contactId })
  const quote: CalcResult = resolved.quote

  if (resolved.source === 'local' && resolved.reason) {
    console.warn(`[submission:quote] priced from the local book (${resolved.reason})`)
  }

  // Persist first — but a Supabase problem must not cost us the GHL delivery
  let persisted = false
  if (token && isSupabaseConfigured()) {
    try {
      await applyStep({
        token,
        step: isStep(body.step) ? body.step : 'residentialFrequency',
        fields: { ...asRecord(body.fields), residentialQuoteResult: quote },
        extra: { quote },
      })
      persisted = true
    } catch (error) {
      console.error('[submission:quote] failed to persist quote:', error)
    }
  }

  // Rebuild the webhook payload with the server-calculated result substituted in, so
  // every price field on it is server-derived rather than whatever the browser displayed.
  let ghlForwarded = false
  try {
    const formData = { ...asRecord(body.formData), residentialQuoteResult: quote }
    const payload = createUnifiedPayload(
      formData,
      (body.contactData ?? null) as ContactFormData | null,
      {
        continueUrl: typeof body.continueUrl === 'string' ? body.continueUrl : '',
        webformToken: token,
      },
    )
    payload.step = 'residentialFrequency'
    // Which engine produced the numbers on this payload, so a price that looks wrong in
    // the CRM can be traced to an engine rather than argued about.
    payload.pricingSource = resolved.source

    const { status } = await forwardWebhook('residentialFrequency', payload)
    ghlForwarded = status >= 200 && status < 300
    if (!ghlForwarded) {
      console.warn('[submission:quote] residentialFrequency webhook returned', status)
    }
  } catch (error) {
    console.error('[submission:quote] residentialFrequency webhook failed:', error)
  }

  return {
    status: 200,
    data: {
      quote,
      persisted,
      ghlForwarded,
      pricingSource: resolved.source,
      // Per-row states, so the browser can render "price on request" / custom quote
      // rather than inventing a number for a row the API declined to price.
      table: resolved.table,
      oversized: resolved.table?.oversized === true,
    },
  }
}

/** S5 — close the submission out. */
async function handleComplete(body: Json): Promise<Result> {
  const token = body.token
  if (typeof token !== 'string' || !token) {
    return { status: 400, data: { error: 'token is required' } }
  }

  const row = await applyStep({
    token,
    step: isStep(body.step) ? body.step : 'thankYou',
    fields: asRecord(body.fields),
    extra: {
      status: 'completed',
      completed_at: nowIso(),
      ...(typeof body.pipelineStage === 'string' && body.pipelineStage
        ? { pipeline_stage: body.pipelineStage }
        : {}),
    },
  })

  if (!row) return { status: 404, data: { error: 'Unknown token' } }

  return {
    status: 200,
    data: { ok: true, status: row.status, completed_at: row.completed_at },
  }
}

/** Resume — everything the client needs to rebuild the form at the right step. */
async function handleGet(token: string): Promise<Result> {
  const row = await loadRow(token)
  if (!row) return { status: 404, data: { error: 'Unknown token' } }

  // location_id / contact_id are deliberately withheld — this endpoint is token-authenticated only
  return {
    status: 200,
    data: {
      token: row.token,
      email: row.email,
      step_reached: row.step_reached,
      status: row.status,
      form_type: row.form_type,
      form_data: row.form_data ?? {},
      quote: row.quote ?? null,
      pipeline_stage: row.pipeline_stage,
    },
  }
}

// ─────────────────────────── shared entry point ───────────────────────────

/**
 * Framework-agnostic core, shared by the Vercel handler below and the Vite dev
 * middleware in `vite.config.ts` so `npm run dev` and production behave identically.
 */
export async function handleSubmissionRequest(args: {
  action: string
  method: string
  token?: string | null
  body?: Json
}): Promise<Result> {
  const { action, method } = args

  if (!isSubmissionAction(action)) {
    return {
      status: 400,
      data: { error: `action must be one of: ${SUBMISSION_ACTIONS.join(', ')}` },
    }
  }

  const expectedMethod = action === 'get' ? 'GET' : 'POST'
  if (method.toUpperCase() !== expectedMethod) {
    return { status: 405, data: { error: 'Method not allowed' } }
  }

  // `quote` still calculates and forwards to GHL without Supabase — everything else needs it
  if (!isSupabaseConfigured() && action !== 'quote') {
    console.warn(`[submission] Supabase is not configured; skipping "${action}"`)
    return { status: 503, data: { error: 'Submission store is not configured' } }
  }

  const body = args.body ?? {}

  try {
    switch (action) {
      case 'start':
        return await handleStart(body)
      case 'step':
        return await handleStep(body)
      case 'quote':
        return await handleQuote(body)
      case 'complete':
        return await handleComplete(body)
      case 'get': {
        if (!args.token) return { status: 400, data: { error: 'token is required' } }
        return await handleGet(args.token)
      }
    }
  } catch (error) {
    console.error(`[submission:${action}] failed:`, error)
    return {
      status: 500,
      data: { error: error instanceof Error ? error.message : 'Submission request failed' },
    }
  }
}

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0]
  return undefined
}

function parseBody(req: VercelRequest): Json {
  if (typeof req.body === 'string') {
    try {
      return req.body ? JSON.parse(req.body) : {}
    } catch {
      return {}
    }
  }
  return asRecord(req.body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { status, data } = await handleSubmissionRequest({
    action: firstQueryValue(req.query.action as string | string[] | undefined) ?? '',
    method: req.method ?? 'GET',
    token: firstQueryValue(req.query.token as string | string[] | undefined),
    body: parseBody(req),
  })

  return res.status(status).json(data)
}
