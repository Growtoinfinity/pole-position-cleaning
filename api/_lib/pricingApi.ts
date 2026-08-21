/**
 * Client for the v3 bot pricing API.
 *
 * Server-side only. The API sends no CORS headers — deliberately and permanently — so
 * this module must never be imported from anything under `src/`; a key reachable from
 * browser JavaScript is a key every visitor can lift out of dev tools.
 *
 * Uses the batch route: one request prices the whole table. The single-service route
 * (`/quote`, singular) requires a contactId and writes the price onto that contact —
 * that is the voice bot's route. We own our own writes, so we do not want it.
 *
 * See `docs/pricing-api-integration.md`.
 */
import { ghlLocationId, isGhlLocationConfigured } from './supabaseServer.js'
import {
  allInputsOf,
  isOutOfBand,
  SERVICE_KEYS,
  isServiceKey,
  type PriceCell,
  type PriceTable,
  type ServiceKey,
} from '../../src/lib/pricing.js'
import type { CalcInput } from '../../src/lib/costing-calc.js'

const BASE_URL =
  process.env.PRICING_API_URL || 'https://v3-bot-production-5b9f.up.railway.app'

/** `/api/pricing/quotes` (unversioned) is a permanent alias; prefer the versioned form. */
const QUOTES_PATH = '/api/v1/pricing/quotes'

/** Lazy: see ghlLocationId(). A const here captured '' at vite config time. */
const locationId = () => ghlLocationId()

const REQUEST_TIMEOUT_MS = 4000
const MAX_RETRIES = 2
const MAX_RETRY_WAIT_MS = 2000

/**
 * Read the key lazily, never at module load. `vite.config.ts` imports the `api/`
 * modules at config time, so a top-level read would capture the value before
 * `loadEnv` has populated `process.env` — and would bake it into the build graph.
 */
function apiKey(): string {
  return process.env.PRICING_API_KEY || ''
}

export function isPricingApiConfigured(): boolean {
  // Both halves matter. A key without a location sends `locationId: ""`, which the API
  // answers with `missing_selector`, and a location without a key is unauthenticated —
  // either way the honest answer is "not configured", not a failed round trip.
  return Boolean(apiKey()) && isGhlLocationConfigured()
}

/**
 * A bad key is not a transient failure — retrying it just burns budget and logs noise.
 * One 401 parks the whole client for five minutes so a misconfigured deploy degrades to
 * the fallback instead of hammering the upstream on every page view.
 */
const CIRCUIT_BREAK_MS = 5 * 60 * 1000
let circuitOpenUntil = 0

function circuitIsOpen(): boolean {
  return Date.now() < circuitOpenUntil
}

function openCircuit(reason: string): void {
  circuitOpenUntil = Date.now() + CIRCUIT_BREAK_MS
  console.error(
    `[pricing] circuit open for ${CIRCUIT_BREAK_MS / 1000}s: ${reason} — alert a human`,
  )
}

/** A GHL contact id: `A-Z a-z 0-9 _ -`, 8–64 chars. Anything else is an integration bug. */
export function isContactIdShaped(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value)
}

// ─────────────────────────── the response ───────────────────────────

type QuoteRow = {
  ok?: boolean
  price?: number | null
  currency?: string
  serviceKey?: string
  serviceLabel?: string
  ghlField?: string
  oversized?: boolean
  reason?: string
  missing?: string[]
}

type QuotesResponse = {
  clientId?: string
  quotes?: QuoteRow[]
  error?: string
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after')
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const at = Date.parse(header)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Turns one row into a cell.
 *
 * The order of these checks is the whole point, and it is not the obvious one:
 *
 * - `oversized` is checked FIRST, because the price tables clamp above their top band.
 *   A 10-bedroom property comes back `ok:true` with a real-looking number that is simply
 *   the 5-bedroom rate. Displaying it would be wrong.
 * - `oversized` and `ok` are not independent: an unclassifiable property arrives
 *   `ok:false` AND `oversized:true` with an EMPTY `missing` array. Code that tests `ok`
 *   first sees "nothing missing, no price" and has nothing sensible to render.
 * - `not_applicable` is not a gap to fill: the service does not apply to this property,
 *   so the row is hidden rather than shown as awaiting an answer.
 */
/**
 * Turns the API's "I still need the panel count" into "we'll price it on the visit".
 *
 * The customer answered the panel question with "I'm not sure — confirmed on visit", so
 * we deliberately send no `conservatory_roof_panels` and the API correctly replies
 * `missing_inputs`. Left as-is that classifies as `not_priceable`, which the UI renders
 * as an unselectable "Price on request" — so choosing the honest answer silently made
 * the service unbookable, which is the opposite of what it means.
 *
 * `missing_inputs` still means "ask" for every other row; this only promotes the one
 * input the customer has already been asked and has already answered. No number is
 * invented — `on_visit` carries no price.
 */
function confirmedOnVisit(cell: PriceCell, input: CalcInput): PriceCell {
  if (cell.state !== 'not_priceable') return cell
  if (input.conservatoryRoofPricing?.status !== 'unknown') return cell
  return cell.missing.includes('conservatory_roof_panels') ? { state: 'on_visit' } : cell
}

export function classifyRow(row: QuoteRow): PriceCell {
  if (row.oversized === true) return { state: 'oversized' }

  if (row.ok === false) {
    if (row.reason === 'not_applicable') return { state: 'not_applicable' }
    return {
      state: 'not_priceable',
      reason: typeof row.reason === 'string' ? row.reason : 'unknown',
      missing: Array.isArray(row.missing) ? row.missing : [],
    }
  }

  if (row.ok === true && typeof row.price === 'number' && Number.isFinite(row.price)) {
    // Never round, adjust or recompute. One engine produces every number.
    return {
      state: 'priced',
      price: row.price,
      ...(typeof row.ghlField === 'string' && row.ghlField ? { ghlField: row.ghlField } : {}),
    }
  }

  return { state: 'unavailable', reason: 'unreadable_response' }
}

function emptyTable(reason: string, keys: ServiceKey[]): PriceTable {
  const cells: Partial<Record<ServiceKey, PriceCell>> = {}
  for (const key of keys) cells[key] = { state: 'unavailable', reason }
  return { cells, oversized: false, source: 'api', fetchedAt: new Date().toISOString() }
}

// ─────────────────────────── the call ───────────────────────────

/**
 * Prices the whole table in one request.
 *
 * `serviceKeys` is deliberately omitted from the payload: the API prices its whole
 * catalog by default and reports per-row why anything is unpriceable, which is strictly
 * more information than asking for a subset and inferring the rest.
 *
 * One call per table — not one per row — is what makes the 60/min budget comfortable
 * (~60 table renders a minute rather than ~7).
 */
export async function fetchQuoteTable(args: { input: CalcInput }): Promise<PriceTable> {
  const { input } = args

  const table: PriceTable = {
    cells: {},
    oversized: false,
    source: 'api',
    fetchedAt: new Date().toISOString(),
  }

  // Decided by the form, before any call: over five bedrooms is a custom quote, as is a
  // flat with no floor on it. Asking anyway would return a clamped 5-bedroom price that
  // looks entirely real.
  if (isOutOfBand(input)) {
    table.oversized = true
    for (const key of SERVICE_KEYS) table.cells[key] = { state: 'oversized' }
    return table
  }

  if (!isPricingApiConfigured()) return emptyTable('not_configured', SERVICE_KEYS)
  if (circuitIsOpen()) return emptyTable('circuit_open', SERVICE_KEYS)

  const payload = {
    locationId: locationId(),
    inputs: allInputsOf(input),
  }

  let waited = 0

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response: Response
    try {
      response = await fetch(`${BASE_URL}${QUOTES_PATH}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network'
      console.warn(`[pricing] table ${reason}`)
      return emptyTable(reason, SERVICE_KEYS)
    }

    if (response.status === 200) {
      const body = (await response.json().catch(() => ({}))) as QuotesResponse
      const rows = Array.isArray(body.quotes) ? body.quotes : []

      if (!rows.length) return emptyTable('unreadable_response', SERVICE_KEYS)

      for (const row of rows) {
        if (!isServiceKey(row.serviceKey)) continue
        const cell = confirmedOnVisit(classifyRow(row), input)
        table.cells[row.serviceKey] = cell
        // An oversized verdict is a property-level fact — but the roof row is priced on
        // panel count alone and knows nothing about the house, so it cannot speak for it.
        if (cell.state === 'oversized' && !ROOF_KEY_SET.has(row.serviceKey)) {
          table.oversized = true
        }
      }

      // Anything the API did not mention is simply absent, not free
      for (const key of SERVICE_KEYS) {
        if (!table.cells[key]) table.cells[key] = { state: 'unavailable', reason: 'not_returned' }
      }

      return table
    }

    // 401 is not transient — park the circuit rather than retrying a bad key
    if (response.status === 401) {
      openCircuit('401 unauthorized')
      return emptyTable('unauthorized', SERVICE_KEYS)
    }

    // Retry only on 429 and 503, honouring Retry-After. Everything else is a real
    // answer that will not change on retry.
    if (response.status === 429 || response.status === 503) {
      const wait = Math.min(retryAfterMs(response) ?? 500 * (attempt + 1), MAX_RETRY_WAIT_MS - waited)
      if (attempt === MAX_RETRIES || wait <= 0) {
        return emptyTable(response.status === 429 ? 'rate_limited' : 'lookup_failed', SERVICE_KEYS)
      }
      waited += wait
      await sleep(wait)
      continue
    }

    const body = (await response.json().catch(() => ({}))) as QuotesResponse
    console.warn(`[pricing] table returned ${response.status}: ${body.error ?? 'unknown'}`)
    return emptyTable(`http_${response.status}`, SERVICE_KEYS)
  }

  return emptyTable('retries_exhausted', SERVICE_KEYS)
}

const ROOF_KEY_SET = new Set<string>(['conservatory_roof_external'])
