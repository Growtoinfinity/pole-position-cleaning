/**
 * Server-side proxy for the v3 bot pricing API.
 *
 * The browser cannot call the pricing API: it sends no CORS headers, and the credential
 * can write to customer records, so a key reachable from browser JavaScript is a key
 * every visitor can lift out of dev tools. This route is the only thing that holds it.
 *
 *   browser (form UI) ──► /api/pricing ──► v3 bot pricing API
 *                         (holds the key)   (holds the price book)
 *
 * Two actions:
 *   `table`  — cache-first, display only. What the quote step renders.
 *   `commit` — live and uncached, for the rows the customer actually selected.
 *
 * See `docs/pricing-api-integration.md`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  fetchQuoteTable,
  isContactIdShaped,
  isPricingApiConfigured,
} from './_lib/pricingApi'
import { resolveContactIdForToken } from './_lib/quoteSource'
import { sanitizeCalcInput } from './submission'
import { isServiceKey, selectServiceKeys, type ServiceKey } from '../src/lib/pricing'
import { withParityHold } from '../src/lib/price-table'

export type PricingAction = 'table' | 'commit'

type Result = { status: number; data: unknown }
type Json = Record<string, unknown>

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
}

export function isPricingAction(value: string): value is PricingAction {
  return value === 'table' || value === 'commit'
}

/**
 * Resolves the GHL contact id a price will be attributed to.
 *
 * Prefers the submission row over anything the browser claims: the token is the thing
 * the customer actually holds, and `contact_id` on that row was written by our own
 * upsert. A body-supplied id is accepted only as a fallback for the window before
 * Supabase is configured, and only if it is id-shaped.
 */
async function resolveContactId(body: Json): Promise<string | null> {
  const token = typeof body.token === 'string' && body.token ? body.token : null

  const stored = await resolveContactIdForToken(token)
  if (stored) return stored

  return isContactIdShaped(body.contactId) ? body.contactId : null
}

/** `commit` prices only the rows the customer chose; `table` prices what the property needs. */
function requestedServiceKeys(body: Json, fallback: ServiceKey[]): ServiceKey[] {
  const raw = body.serviceKeys
  if (!Array.isArray(raw)) return fallback
  const keys = raw.filter(isServiceKey)
  return keys.length ? keys : fallback
}

export async function handlePricingRequest(args: {
  action: string
  method: string
  body?: Json
}): Promise<Result> {
  if (!isPricingAction(args.action)) {
    return { status: 400, data: { error: 'action must be one of: table, commit' } }
  }

  if (args.method.toUpperCase() !== 'POST') {
    return { status: 405, data: { error: 'Method not allowed' } }
  }

  const body = args.body ?? {}

  // Validated before the configuration check on purpose: a malformed `calcInput` is an
  // integration bug, and it should be visible in development before a key exists rather
  // than hiding behind "not configured" until the day the key is set.
  const input = sanitizeCalcInput(body.calcInput)
  if (!input) {
    return { status: 400, data: { error: 'Invalid or incomplete calcInput' } }
  }

  // Not an error: the caller falls back to the local price book and the lead still
  // completes. Prices going down must never mean leads going down.
  if (!isPricingApiConfigured()) {
    return {
      status: 200,
      data: { ok: false, reason: 'not_configured', table: null },
    }
  }

  const contactId = await resolveContactId(body)
  if (!contactId) {
    // A price cannot be obtained without a real GHL contact id. Say so plainly rather
    // than returning an empty table the client has to guess about.
    return {
      status: 200,
      data: { ok: false, reason: 'no_contact_id', table: null },
    }
  }

  const serviceKeys = requestedServiceKeys(body, selectServiceKeys(input))

  try {
    const table = await fetchQuoteTable({
      serviceKeys,
      input,
      contactId,
      useCache: args.action === 'table',
    })

    // Holds back any row whose API price is known to differ from the live site's and
    // has not been signed off — see `PARITY_UNRESOLVED`.
    const held = withParityHold(table, process.env.PRICING_PARITY_APPROVED)

    return { status: 200, data: { ok: true, table: held } }
  } catch (error) {
    console.error('[pricing] table fetch failed:', error)
    return { status: 200, data: { ok: false, reason: 'fetch_failed', table: null } }
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
  const { status, data } = await handlePricingRequest({
    action: firstQueryValue(req.query.action as string | string[] | undefined) ?? '',
    method: req.method ?? 'GET',
    body: parseBody(req),
  })

  return res.status(status).json(data)
}
