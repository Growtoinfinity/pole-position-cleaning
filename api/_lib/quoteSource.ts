/**
 * Where a price comes from.
 *
 * The pricing API is the source of truth when it is configured and reachable; the local
 * price book (`src/lib/costing.ts`) is the fallback that keeps leads flowing when it is
 * not. Both routes go through here so the website, the CRM and the stored quote can
 * never disagree about which engine produced a number.
 */
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  SUBMISSIONS_TABLE,
} from './supabaseServer'
import { fetchQuoteTable, isContactIdShaped, isPricingApiConfigured } from './pricingApi'
import { calculateCost, type CalcInput, type CalcResult } from '../../src/lib/costing-calc'
import { selectServiceKeys, type PriceTable } from '../../src/lib/pricing'
import { buildCalcResult, withParityHold } from '../../src/lib/price-table'

/** Which engine produced the quote, stamped onto the payload so drift is diagnosable. */
export type PricingSource = 'api' | 'local'

export type ResolvedQuote = {
  quote: CalcResult
  source: PricingSource
  /** Present only when the API answered — the per-row states the UI needs. */
  table: PriceTable | null
  /** Why we fell back, when we did. */
  reason: string | null
}

/**
 * Reads the contact id the submission row already holds.
 *
 * The token is what the customer actually carries, and `contact_id` on that row was
 * written by our own GHL upsert at S1 — so it is trusted over anything the browser says.
 */
export async function resolveContactIdForToken(
  token: string | null,
): Promise<string | null> {
  if (!token || !isSupabaseConfigured()) return null

  try {
    const { data, error } = await getSupabaseAdmin()
      .from(SUBMISSIONS_TABLE)
      .select('contact_id')
      .eq('token', token)
      .maybeSingle()

    if (error) throw new Error(error.message)
    const stored = (data as { contact_id?: string | null } | null)?.contact_id
    return isContactIdShaped(stored) ? stored : null
  } catch (error) {
    console.warn('[pricing] could not read contact_id for token:', error)
    return null
  }
}

/**
 * Produces the authoritative quote for a property.
 *
 * Falls back to the local price book — never to an error — whenever the API cannot
 * answer: no key, the bot switched off, a timeout. Prices going down must not mean
 * leads going down.
 */
export async function resolveQuote(args: {
  input: CalcInput
  /**
   * Optional. The API prices from the property alone; the id only attributes the price
   * to a contact and lets the bot read it back at the booking guard.
   */
  contactId?: string | null
}): Promise<ResolvedQuote> {
  const local = (reason: string): ResolvedQuote => ({
    quote: calculateCost(args.input),
    source: 'local',
    table: null,
    reason,
  })

  if (!isPricingApiConfigured()) return local('not_configured')

  try {
    const table = withParityHold(
      await fetchQuoteTable({
        serviceKeys: selectServiceKeys(args.input),
        input: args.input,
        contactId: args.contactId ?? null,
        // The rows the customer committed to must be live and attributable, not served
        // from a memo keyed on the property.
        useCache: false,
      }),
      process.env.PRICING_PARITY_APPROVED,
    )

    if (table.killSwitch) return local('client_inactive')

    // An oversized property is a custom quote, not a price. Nothing to persist and
    // nothing to show — the caller routes to the custom-quote path.
    if (table.oversized) {
      return { quote: buildCalcResult(table, args.input), source: 'api', table, reason: 'oversized' }
    }

    return { quote: buildCalcResult(table, args.input), source: 'api', table, reason: null }
  } catch (error) {
    console.error('[pricing] resolveQuote failed, falling back to local book:', error)
    return local('fetch_failed')
  }
}
