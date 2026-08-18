/**
 * Where a price comes from.
 *
 * The pricing API is the source of truth when it is configured and reachable; the local
 * price book (`src/lib/costing.ts`) is the fallback that keeps leads flowing when it is
 * not. Both routes go through here so the website, the CRM and the stored quote can
 * never disagree about which engine produced a number.
 */
import { fetchQuoteTable, isPricingApiConfigured } from './pricingApi'
import { calculateCost, type CalcInput, type CalcResult } from '../../src/lib/costing-calc'
import type { PriceTable } from '../../src/lib/pricing'
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
 * Produces the authoritative quote for a property.
 *
 * Falls back to the local price book — never to an error — whenever the API cannot
 * answer: no key, the bot switched off, a timeout. Prices going down must not mean
 * leads going down.
 */
export async function resolveQuote(args: { input: CalcInput }): Promise<ResolvedQuote> {
  const local = (reason: string): ResolvedQuote => ({
    quote: calculateCost(args.input),
    source: 'local',
    table: null,
    reason,
  })

  if (!isPricingApiConfigured()) return local('not_configured')

  try {
    const table = withParityHold(
      await fetchQuoteTable({ input: args.input }),
      process.env.PRICING_PARITY_APPROVED,
    )

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
