import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  GHL_LOCATION_ID,
  SUBMISSIONS_TABLE,
  type SubmissionRow,
} from './_lib/supabaseServer.js'
import { syncGhlContact, type GhlSyncResult } from './_lib/ghlContacts.js'
import {
  confirmCommercialQuoteRequest,
  confirmLargeUnusualQuoteRequest,
  confirmResidentialBooking,
} from './_lib/ghlOutcomes.js'
import { type CalcInput, type CalcResult } from '../src/lib/costing-calc.js'
import { resolveQuote, type PricingSource } from './_lib/quoteSource.js'
import type { PriceTable } from '../src/lib/pricing.js'
import { deriveFormType, mergeFormType, stepReachedFor, isStep } from '../src/lib/form-steps.js'

export type SubmissionAction = 'start' | 'step' | 'quote' | 'complete' | 'get'

export const SUBMISSION_ACTIONS: SubmissionAction[] = ['start', 'step', 'quote', 'complete', 'get']

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
    // They came back. `abandonment_notified` deliberately stays set — one chase per
    // submission, however many times someone wanders off and returns.
    ...(row.status === 'abandoned' ? { status: 'in_progress' } : {}),
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

/** The price table stored with the quote, if this row has reached S3. */
function storedPriceTable(row: SubmissionRow | null): PriceTable | null {
  const table = (row?.form_data as Record<string, unknown> | null)?.priceTable
  return table && typeof table === 'object' ? (table as PriceTable) : null
}

/** Stores the contact id the first time GHL hands us one. */
async function rememberContactId(token: string, contactId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from(SUBMISSIONS_TABLE)
      .update({ contact_id: contactId, updated_at: nowIso() })
      .eq('token', token)
    if (error) console.warn('[submission] failed to store contact_id:', error.message)
  } catch (error) {
    console.warn('[submission] failed to store contact_id:', error)
  }
}

/**
 * Pushes the submission to GHL and records the resulting contact id. Never throws — a CRM
 * problem is logged and the request still succeeds, so the customer's form never stalls.
 */
async function pushToCrm(args: {
  row: SubmissionRow | null
  snapshot: Record<string, unknown>
  token?: string | null
  quote?: CalcResult | null
  completedAt?: string | null
  pricingSource?: PricingSource | null
  /** Per-row prices from the API. When present these are written verbatim, never recomputed. */
  priceTable?: PriceTable | null
}): Promise<GhlSyncResult> {
  const result = await syncGhlContact({
    contactId: args.row?.contact_id ?? null,
    snapshot: args.snapshot,
    webformToken: args.token ?? args.row?.token ?? null,
    quote: args.quote ?? null,
    completedAt: args.completedAt ?? null,
    priceTable: args.priceTable ?? null,
  })

  if (args.pricingSource === 'local') {
    console.warn('[submission] contact fields written from the local price book')
  }

  if (result.error) {
    console.warn(`[submission] GHL sync ${result.outcome}: ${result.error}`)
  }

  const token = args.token ?? args.row?.token
  if (result.contactId && token && !args.row?.contact_id && isSupabaseConfigured()) {
    await rememberContactId(token, result.contactId)
  }

  return result
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
 * contact record, and store the contact id it returns.
 */
/**
 * How close together two `start` calls for the same email have to be before the second is
 * treated as a duplicate of the first rather than a new submission.
 */
const BURST_WINDOW_MS = 30_000

async function handleStart(body: Json): Promise<Result> {
  const supabase = getSupabaseAdmin()

  const fields = asRecord(body.fields)
  const contact = asRecord(body.contact)
  const email = asString(body.email) ?? asString(contact.email)

  const formData = mergeFormData({}, fields)
  const formType = deriveFormType('contact', formData)

  // Collapse a burst into one row. The browser already shares a single in-flight request,
  // but that guard lives in the page and a script can simply not run it — measured before
  // this existed, ten simultaneous posts produced ten rows. A repeat within the window is
  // a double-click or a flood, never two genuine sessions, so the first row's token is
  // handed back instead of forking a new one. Scoped to step 1 and still `in_progress`,
  // so a customer legitimately starting a second quote later is unaffected.
  if (email) {
    const since = new Date(Date.now() - BURST_WINDOW_MS).toISOString()
    const { data: recent } = await supabase
      .from(SUBMISSIONS_TABLE)
      .select('*')
      .eq('email', email)
      .eq('status', 'in_progress')
      .eq('step_reached', 1)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(1)

    const first = (recent as SubmissionRow[] | null)?.[0]
    if (first) {
      const crmExisting = await pushToCrm({ row: first, snapshot: formData, token: first.token })
      return {
        status: 200,
        data: { token: first.token, contactId: crmExisting.contactId, contactOutcome: crmExisting.outcome, deduped: true },
      }
    }
  }

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

  // The read above cannot win a genuine race — ten simultaneous posts all select before
  // any of them insert, which measured 5 rows rather than 1. The unique partial index on
  // (email) where status = 'in_progress' and step_reached = 1 is what actually decides it:
  // exactly one insert commits and the rest come back 23505. Losing that race is not an
  // error, it just means someone else created the submission a millisecond earlier, so we
  // adopt their row.
  let row: SubmissionRow
  if (error) {
    if (error.code !== '23505' || !email) throw new Error(error.message)

    const { data: winner } = await supabase
      .from(SUBMISSIONS_TABLE)
      .select('*')
      .eq('email', email)
      .eq('status', 'in_progress')
      .eq('step_reached', 1)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!winner) throw new Error(error.message)
    row = winner as SubmissionRow
  } else {
    row = data as SubmissionRow
  }

  const crm = await pushToCrm({
    row,
    snapshot: formData,
    token: row.token,
  })

  return {
    status: 200,
    data: {
      token: row.token,
      contactId: crm.contactId,
      contactOutcome: crm.outcome,
    },
  }
}

/** S2 / S4 — merge fields, advance `step_reached`, push to GHL, trigger the step's workflow. */
async function handleStep(body: Json): Promise<Result> {
  const token = asString(body.token)
  if (!token) return { status: 400, data: { error: 'token is required' } }

  const row = await applyStep({
    token,
    step: asString(body.step),
    fields: asRecord(body.fields),
  })
  if (!row) return { status: 404, data: { error: 'Unknown token' } }

  const crm = await pushToCrm({
    row,
    snapshot: (row.form_data ?? {}) as Record<string, unknown>,
    token,
    quote: (row.quote as CalcResult | null) ?? null,
    priceTable: storedPriceTable(row),
  })

  return {
    status: 200,
    data: {
      ok: true,
      step_reached: row.step_reached,
      form_type: row.form_type,
      contactId: crm.contactId,
    },
  }
}

/**
 * S3 — the quote is resolved here, not in the browser. The resulting `CalcResult` is
 * written to `quote` and is the same value pushed onto the contact, so the CRM price and
 * the stored price cannot drift apart.
 *
 * Prices come from the v3 bot pricing API when it is configured and can answer, and from
 * the local price book otherwise — `pricingSource` on the response says which, so a
 * divergence is diagnosable rather than invisible.
 */
async function handleQuote(body: Json): Promise<Result> {
  const token = asString(body.token)

  const calcInput = sanitizeCalcInput(body.calcInput)
  if (!calcInput) return { status: 400, data: { error: 'Invalid or incomplete calcInput' } }

  const resolved = await resolveQuote({ input: calcInput })
  const quote: CalcResult = resolved.quote

  if (resolved.source === 'local' && resolved.reason) {
    console.warn(`[submission:quote] priced from the local book (${resolved.reason})`)
  }

  // Persist first, but a Supabase problem must not cost us the CRM push
  let row: SubmissionRow | null = null
  let persisted = false
  if (token && isSupabaseConfigured()) {
    try {
      row = await applyStep({
        token,
        step: isStep(body.step) ? body.step : 'residentialFrequency',
        fields: {
          ...asRecord(body.fields),
          residentialQuoteResult: quote,
          // Kept so `step` and `complete` write the same API numbers rather than
          // recomputing add-on prices from the local book and overwriting them.
          priceTable: resolved.table,
        },
        extra: { quote },
      })
      persisted = Boolean(row)
    } catch (error) {
      console.error('[submission:quote] failed to persist quote:', error)
    }
  }

  const snapshot = (row?.form_data ?? { ...asRecord(body.fields), residentialQuoteResult: quote }) as Record<string, unknown>
  const crm = await pushToCrm({
    row,
    snapshot,
    token,
    quote,
    // Which engine produced these numbers, so a price that looks wrong in the CRM can be
    // traced to an engine rather than argued about.
    pricingSource: resolved.source,
    priceTable: resolved.table,
  })

  return {
    status: 200,
    data: {
      quote,
      persisted,
      contactId: crm.contactId,
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
  const token = asString(body.token)
  if (!token) return { status: 400, data: { error: 'token is required' } }

  const completedAt = nowIso()
  const pipelineStage = asString(body.pipelineStage)

  // Read the row before the update so we can tell a first completion from a repeat.
  // The outcome below fires a GHL workflow, and `triggerWorkflow` is a bare POST with no
  // dedupe of its own — so without this, ten clicks on Book Now would send the customer
  // ten confirmation messages. The tag and the opportunity are already idempotent
  // (`addTag` is a no-op when present, `upsertOpportunity` finds the existing one); the
  // workflow is the side effect that has to be gated.
  const before = await loadRow(token)
  const alreadyCompleted = before?.status === 'completed'

  const row = await applyStep({
    token,
    step: isStep(body.step) ? body.step : 'thankYou',
    fields: asRecord(body.fields),
    extra: {
      status: 'completed',
      completed_at: completedAt,
      ...(pipelineStage ? { pipeline_stage: pipelineStage } : {}),
    },
  })
  if (!row) return { status: 404, data: { error: 'Unknown token' } }

  const crm = await pushToCrm({
    row,
    snapshot: (row.form_data ?? {}) as Record<string, unknown>,
    token,
    quote: (row.quote as CalcResult | null) ?? null,
    priceTable: storedPriceTable(row),
    completedAt,
  })

  // Which outcome this is, if any. `pipelineStage` rather than `form_type` alone does the
  // deciding: a declined flat is still `form_type: 'standard'`, and only the stage
  // distinguishes a real booking from a dead end. Large/unusual reaches neither branch.
  const formData = (row.form_data ?? {}) as Json
  const contact = asRecord(formData.contactData)
  let outcome: Awaited<ReturnType<typeof confirmResidentialBooking>> | null = null

  if (alreadyCompleted) {
    // Already ran once. Fields above are upserts and safe to repeat; the outcome is not.
    console.warn(`[submission:complete] token already completed — skipping CRM outcome`)
  } else if (crm.contactId && row.form_type === 'standard' && pipelineStage === 'booked') {
    outcome = await confirmResidentialBooking({
      contactId: crm.contactId,
      contactName: asString(contact.fullName),
      firstCleanPrice: crm.firstCleanPrice ?? null,
    })
  } else if (
    crm.contactId &&
    row.form_type === 'commercial' &&
    pipelineStage === 'commercial_enquiry'
  ) {
    outcome = await confirmCommercialQuoteRequest({
      contactId: crm.contactId,
      contactName: asString(contact.fullName),
      businessName: asString(asRecord(formData.businessDetails).businessName),
    })
  } else if (
    crm.contactId &&
    row.form_type === 'large_unusual' &&
    pipelineStage === 'large_unusual_enquiry'
  ) {
    outcome = await confirmLargeUnusualQuoteRequest({
      contactId: crm.contactId,
      contactName: asString(contact.fullName),
    })
  }

  if (outcome) {
    for (const error of outcome.errors) console.warn(`[submission:complete] ${error}`)
  }

  return {
    status: 200,
    data: {
      ok: true,
      status: row.status,
      completed_at: row.completed_at,
      contactId: crm.contactId,
      ...(alreadyCompleted ? { duplicate: true } : {}),
      ...(outcome ? { outcome } : {}),
    },
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

  // `quote` still calculates and reaches GHL without Supabase — everything else needs it
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
