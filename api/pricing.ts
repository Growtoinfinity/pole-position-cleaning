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
 * `table` and `commit` are now the same call and both remain accepted. They used to
 * differ on caching, back when pricing was one request per row and the commit path
 * needed live, attributable numbers. The batch route reads no contact and writes
 * nothing, so there is no longer a distinction to draw.
 *
 * See `docs/pricing-api-integration.md`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchQuoteTable, isPricingApiConfigured } from './_lib/pricingApi.js'
import { sanitizeCalcInput } from './submission.js'
import { withParityHold } from '../src/lib/price-table.js'

export type PricingAction = 'table' | 'commit'

type Result = { status: number; data: unknown }
type Json = Record<string, unknown>

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
}

export function isPricingAction(value: string): value is PricingAction {
  return value === 'table' || value === 'commit'
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

  try {
    // The calculator reads no contact and writes nothing — the property is the whole input
    const table = await fetchQuoteTable({ input })

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
