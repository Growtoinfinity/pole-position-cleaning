/**
 * Where a price comes from.
 *
 * The pricing API is the source of truth and the only source — there is no local price
 * book to fall back on. When it cannot answer, the quote comes back with no prices in it.
 * Both routes go through here so the website, the CRM and the stored quote can never
 * disagree about which engine produced a number.
 */
import { fetchQuoteTable, isPricingApiConfigured } from './pricingApi.js'
import { emptyResult, type CalcInput, type CalcResult } from '../../src/lib/costing-calc.js'
import type { PriceTable } from '../../src/lib/pricing.js'
import { buildCalcResult, withParityHold } from '../../src/lib/price-table.js'

/**
 * Which engine produced the quote, stamped onto the payload so drift is diagnosable.
 * `local` no longer means "priced here" — it means the API did not price it and the
 * quote carries no numbers at all.
 */
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
 * Answers with a priceless quote — never with an error — whenever the API cannot price
 * it: no key, the bot switched off, a timeout. The lead is still captured and still
 * reaches GHL, so losing the price never means losing the customer; what they see is
 * "price on request" rather than a number nobody can stand behind. There is no second
 * price book to guess from, which is the point: a stale-but-plausible price is worse
 * than none.
 */
export async function resolveQuote(args: { input: CalcInput }): Promise<ResolvedQuote> {
  const local = (reason: string): ResolvedQuote => ({
    quote: emptyResult(args.input.selectedPlan),
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
    console.error('[pricing] resolveQuote failed, quoting no prices:', error)
    return local('fetch_failed')
  }
}
