/**
 * What to render in each price slot of the quote step.
 *
 * `QuoteStep` and `QuoteStepMobile` are near-identical implementations of the same
 * table; this is the single place that decides whether a slot shows a number, a
 * skeleton, "price on request" or nothing at all, so the two cannot drift apart.
 *
 * There is no local price book to fall back on when the API cannot answer. A slot with
 * no price reads as words and cannot be selected — see the note at the top of
 * `costing-calc.ts`. A pricing outage costs us live prices, not leads.
 */
import { useMemo } from 'react'
import type { Frequency } from '@/lib/costing-calc'
import {
  cellOf,
  SERVICE_KEY_BY_LABEL,
  serviceKeyForFrequency,
  type PriceTable,
  type ServiceKey,
} from '@/lib/pricing'
import type { PriceStatus } from '@/stores/costingStore'

export type PriceDisplay =
  /** The fetch is in flight. Render a skeleton, never a half-priced table. */
  | { kind: 'loading' }
  /** A real price. `text` is already formatted with the currency symbol. */
  | { kind: 'price'; text: string; value: number }
  /** The API declined to price this row. Never a number, never selectable. */
  | { kind: 'on_request'; text: string }
  /**
   * The service does not apply to this property — so the row is REMOVED, not offered on
   * request: inviting an enquiry for something that cannot be sold to this customer
   * wastes their time and ours. The API says this with `reason: "not_applicable"`.
   *
   * Both of its producers land here, and deliberately so (§8, §9b). One is structural —
   * gutters, fascia and both conservatory roofs on any flat, four of the eight rows, and
   * no answer will ever price them. The other is a fact about this turn's answers — both
   * roof rows whenever the conservatory answer is not yes, which is the majority of
   * requests. Both hide the row NOW, which is all a rendered slot has to decide; the
   * difference is only whether a later re-quote may bring the row back, and the table is
   * re-fetched whenever the property answers change. Nothing here persists the verdict.
   */
  | { kind: 'not_applicable' }

/**
 * True when the customer is allowed to add this row to their booking.
 *
 * A real price and nothing else. The old `on_visit` slot existed for one thing — a
 * customer who could not count their conservatory roof panels — and this catalogue
 * prices roof cleaning from a house x bedroom table with no panel count anywhere in it
 * (§4), so there is nothing left to promise on the visit.
 */
export function isSelectable(display: PriceDisplay): boolean {
  return display.kind === 'price'
}

/** True when the row should not be rendered at all. */
export function isHidden(display: PriceDisplay): boolean {
  return display.kind === 'not_applicable'
}

/** The bare number for a slot, or null. Callers must not render null as £0. */
export function valueOf(display: PriceDisplay): number | null {
  return display.kind === 'price' ? display.value : null
}

const LOADING: PriceDisplay = { kind: 'loading' }
const ON_REQUEST: PriceDisplay = { kind: 'on_request', text: 'Price on request' }
const NOT_APPLICABLE: PriceDisplay = { kind: 'not_applicable' }

function priced(value: number): PriceDisplay {
  return { kind: 'price', text: `£${value}`, value }
}

export function usePriceDisplay(args: {
  priceStatus: PriceStatus
  priceTable: PriceTable | null
}) {
  const { priceStatus, priceTable } = args

  return useMemo(() => {
    const forServiceKey = (key: ServiceKey): PriceDisplay => {
      if (priceStatus === 'loading') return LOADING

      if (priceTable) {
        const cell = cellOf(priceTable, key)
        switch (cell.state) {
          case 'priced':
            // Displayed exactly as returned — never rounded, adjusted or recomputed.
            // The two one-off cleans come back as the same number as each other, and both
            // conservatory roof cleans do too; that is what the tables say (§4).
            return priced(cell.price)
          case 'not_applicable':
            // "This does not exist for them" is a different answer from "we cannot put
            // a number on it today", and collapsing the two hides a sellable service or
            // offers one that is not. `permanent` is not read here — see the type.
            return NOT_APPLICABLE
          default:
            // not_priceable / oversized / unavailable all read the same to a customer:
            // we are not going to put a number on this today. `oversized` in particular
            // must never reach a figure — the API returns a real-looking price with it,
            // and it is simply the top band's, not this property's (§9).
            return ON_REQUEST
        }
      }

      // No table means no price. There is no local book to fall back on, by design:
      // see the note at the top of costing-calc.ts.
      return ON_REQUEST
    }

    const forLabel = (label: string): PriceDisplay => {
      const key = SERVICE_KEY_BY_LABEL[label]
      return key ? forServiceKey(key) : ON_REQUEST
    }

    const forFrequency = (frequency: Frequency): PriceDisplay =>
      forServiceKey(serviceKeyForFrequency(frequency))

    return { forServiceKey, forLabel, forFrequency }
  }, [priceStatus, priceTable])
}
