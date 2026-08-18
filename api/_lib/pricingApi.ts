/**
 * Client for the v3 bot pricing API.
 *
 * Server-side only. The credential is a bearer key that can write to customer records,
 * so any key reachable from browser JavaScript is a key every visitor can lift out of
 * dev tools — this module must never be imported from anything under `src/`. The API
 * sends no CORS headers, which is deliberate and permanent for the same reason.
 *
 * See `docs/pricing-api-integration.md` for the open questions this is written against.
 */
import { GHL_LOCATION_ID } from './supabaseServer'
import {
  cacheKeyFor,
  inputsFor,
  isOutOfBand,
  ROOF_KEYS,
  type PriceCell,
  type PriceTable,
  type PricingInputs,
  type ServiceKey,
} from '../../src/lib/pricing'
import type { CalcInput } from '../../src/lib/costing-calc'

const BASE_URL =
  process.env.PRICING_API_URL || 'https://v3-bot-production-5b9f.up.railway.app'

/** `/api/pricing/quote` (unversioned) is a permanent alias; prefer the versioned form. */
const QUOTE_PATH = '/api/v1/pricing/quote'

const LOCATION_ID = GHL_LOCATION_ID

/** Per-request budget. A batch of seven at concurrency 3 stays well inside a lambda. */
const REQUEST_TIMEOUT_MS = 4000
const MAX_RETRIES = 2
const MAX_RETRY_WAIT_MS = 2000
const CONCURRENCY = 3

/**
 * Read the key lazily, never at module load. `vite.config.ts` imports the `api/`
 * modules at config time, so a top-level read would capture the value before
 * `loadEnv` has populated `process.env` — and would bake it into the build graph.
 */
function apiKey(): string {
  return process.env.PRICING_API_KEY || ''
}

export function isPricingApiConfigured(): boolean {
  return Boolean(apiKey())
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

// ─────────────────────────── one call ───────────────────────────

type QuoteResponse = {
  ok?: boolean
  price?: number | null
  currency?: string
  serviceKey?: string
  serviceLabel?: string
  ghlField?: string
  written?: boolean
  oversized?: boolean
  reason?: string
  missing?: string[]
  error?: string
}

export type QuoteOutcome = {
  cell: PriceCell
  /** `409 client_inactive` — Kings' bot is off, so every row is going to fail. */
  killSwitch: boolean
  /** The API says this property is a custom quote, whatever `price` says. */
  oversized: boolean
  /** True when the price persisted to the contact record. Informational only. */
  written: boolean
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
 * Turns one HTTP 200 body into a cell.
 *
 * The order of these checks is the whole point, and it is not the obvious one:
 *
 * - `oversized` is checked FIRST, because the price tables clamp above their top band.
 *   A 10-bedroom property comes back `ok:true` with a real-looking number that is simply
 *   the 5-bedroom rate. Displaying it would be wrong.
 * - `oversized` and `ok` are not independent: an unclassifiable property arrives
 *   `ok:false` AND `oversized:true` with an EMPTY `missing` array. Code that tests `ok`
 *   first sees "nothing missing, no price" and has nothing sensible to render.
 */
function classify(body: QuoteResponse): PriceCell {
  if (body.oversized === true) return { state: 'oversized' }

  if (body.ok === false) {
    return {
      state: 'not_priceable',
      reason: typeof body.reason === 'string' ? body.reason : 'unknown',
      missing: Array.isArray(body.missing) ? body.missing : [],
    }
  }

  if (body.ok === true && typeof body.price === 'number' && Number.isFinite(body.price)) {
    // Never round, adjust or recompute. One engine produces every number.
    return { state: 'priced', price: body.price }
  }

  return { state: 'unavailable', reason: 'unreadable_response' }
}

const UNAVAILABLE = (reason: string): QuoteOutcome => ({
  cell: { state: 'unavailable', reason },
  killSwitch: false,
  oversized: false,
  written: false,
})

/**
 * Prices exactly one service.
 *
 * Retries only on 429 and 503, honouring `Retry-After`. Everything else is a real answer
 * that will not change on retry — including 401, which parks the circuit instead.
 */
export async function fetchQuote(args: {
  serviceKey: ServiceKey
  inputs: PricingInputs
  contactId: string
}): Promise<QuoteOutcome> {
  if (!isPricingApiConfigured()) return UNAVAILABLE('not_configured')
  if (circuitIsOpen()) return UNAVAILABLE('circuit_open')
  if (!isContactIdShaped(args.contactId)) return UNAVAILABLE('invalid_contact_id')

  const payload = {
    locationId: LOCATION_ID,
    contactId: args.contactId,
    serviceKey: args.serviceKey,
    // Optional, but always sent: omitting it makes the server read the details off the
    // GHL contact instead, which adds a round trip and can take up to a minute if GHL
    // is degraded. Sending inputs is the fast path.
    inputs: args.inputs,
  }

  let waited = 0

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response: Response
    try {
      response = await fetch(`${BASE_URL}${QUOTE_PATH}`, {
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
      console.warn(`[pricing] ${args.serviceKey} ${reason}`)
      return UNAVAILABLE(reason)
    }

    if (response.status === 200) {
      const body = (await response.json().catch(() => ({}))) as QuoteResponse
      const cell = classify(body)
      return {
        cell,
        killSwitch: false,
        oversized: body.oversized === true,
        written: body.written === true,
      }
    }

    // Kings' bot is switched off — the website's prices go down with the chat bot.
    if (response.status === 409) {
      return { cell: { state: 'unavailable', reason: 'client_inactive' }, killSwitch: true, oversized: false, written: false }
    }

    if (response.status === 401) {
      openCircuit('401 unauthorized — bad or missing PRICING_API_KEY')
      return UNAVAILABLE('unauthorized')
    }

    if (response.status === 429 || response.status === 503) {
      const remaining = MAX_RETRY_WAIT_MS - waited
      const delay = Math.min(retryAfterMs(response) ?? 250 * (attempt + 1), remaining)
      if (attempt === MAX_RETRIES || delay <= 0) {
        return UNAVAILABLE(response.status === 429 ? 'rate_limited' : 'lookup_failed')
      }
      waited += delay
      await sleep(delay)
      continue
    }

    // 400 / 404 / 500 — a real answer. Retrying will not change it.
    const body = (await response.json().catch(() => ({}))) as QuoteResponse
    const reason = typeof body.error === 'string' ? body.error : `http_${response.status}`
    console.warn(`[pricing] ${args.serviceKey} ${response.status} ${reason}`)
    return UNAVAILABLE(reason)
  }

  return UNAVAILABLE('retries_exhausted')
}

// ─────────────────────────── the table ───────────────────────────

/**
 * Short-lived memo of individual rows, keyed on the inputs that move the price rather
 * than on the contact. Survives a warm lambda; a cold start simply refetches.
 *
 * Whether this is allowed at all — and whether a cached row still satisfies the bot's
 * booking guard, which may need a live write against that contact — is Q8. Until that
 * comes back the TTL stays short and `commit`-time calls (the rows the customer actually
 * chose) bypass this entirely.
 */
const CACHE_TTL_MS = 60 * 1000
const cache = new Map<string, { at: number; outcome: QuoteOutcome }>()

/** In-flight de-duplication, so a burst of identical tables makes one upstream call each. */
const inFlight = new Map<string, Promise<QuoteOutcome>>()

function cached(key: string): QuoteOutcome | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.outcome
}

async function fetchRow(
  serviceKey: ServiceKey,
  input: CalcInput,
  contactId: string,
  useCache: boolean,
): Promise<QuoteOutcome> {
  const inputs = inputsFor(serviceKey, input)

  // A roof row with no panel count is the form's own answer, not the API's: the customer
  // said they could not count them, so there is nothing to ask for. The API rejects 0
  // on purpose.
  if (inputs === null) {
    return { cell: { state: 'on_visit' }, killSwitch: false, oversized: false, written: false }
  }

  if (!useCache) return fetchQuote({ serviceKey, inputs, contactId })

  const key = cacheKeyFor(serviceKey, input)
  const hit = cached(key)
  if (hit) return hit

  const pending = inFlight.get(key)
  if (pending) return pending

  const promise = fetchQuote({ serviceKey, inputs, contactId })
    .then((outcome) => {
      // Only durable answers are worth remembering. A timeout or a rate limit must not
      // pin a whole minute of "unavailable" onto every visitor behind this proxy.
      if (outcome.cell.state !== 'unavailable') {
        cache.set(key, { at: Date.now(), outcome })
      }
      return outcome
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, promise)
  return promise
}

/** Runs `task` over `items` at a fixed concurrency, preserving order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= items.length) return
      results[index] = await task(items[index])
    }
  })

  await Promise.all(workers)
  return results
}

/**
 * Prices a whole table.
 *
 * One request prices one service, so this is one call per row — the reason the rate
 * limit is the binding constraint on this integration, and the reason Q7 asks for a
 * batch route. If that route is granted, only the body of this function changes:
 * nothing above it knows how many HTTP calls a table costs.
 */
export async function fetchQuoteTable(args: {
  serviceKeys: ServiceKey[]
  input: CalcInput
  contactId: string
  /** `false` at commit time, when the customer's chosen rows must be live and written. */
  useCache?: boolean
}): Promise<PriceTable> {
  const { serviceKeys, input, contactId } = args
  const useCache = args.useCache !== false

  const table: PriceTable = {
    cells: {},
    oversized: false,
    killSwitch: false,
    source: 'api',
    fetchedAt: new Date().toISOString(),
  }

  // Decided by the form, before any call: over five bedrooms is a custom quote. Asking
  // anyway would return a clamped 5-bedroom price that looks entirely real.
  if (isOutOfBand(input)) {
    table.oversized = true
    for (const key of serviceKeys) table.cells[key] = { state: 'oversized' }
    return table
  }

  const outcomes = await mapLimit(serviceKeys, CONCURRENCY, (key) =>
    fetchRow(key, input, contactId, useCache),
  )

  serviceKeys.forEach((key, index) => {
    const outcome = outcomes[index]
    table.cells[key] = outcome.cell
    if (outcome.killSwitch) table.killSwitch = true

    // An oversized verdict is a property-level fact, not a row-level one — but the two
    // roof rows are priced on panel count alone and know nothing about the house, so
    // they cannot speak for it.
    if (outcome.oversized && !ROOF_KEYS.includes(key)) table.oversized = true
  })

  return table
}
