/**
 * What to render in each price slot of the quote step.
 *
 * `QuoteStep` and `QuoteStepMobile` are near-identical implementations of the same
 * table; this is the single place that decides whether a slot shows a number, a
 * skeleton, "price on visit" or "price on request", so the two cannot drift apart.
 *
 * When there is no price table — the API is unconfigured, or it could not answer — this
 * falls back to the locally-calculated result, exactly as the form behaved before the
 * migration. A pricing outage costs us live prices, not leads.
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
  /** The customer could not count their roof panels — quoted on the visit. */
  | { kind: 'on_visit'; text: string }
  /** The API declined to price this row. Never a number, never selectable. */
  | { kind: 'on_request'; text: string }
  /**
   * The service does not apply to this property at all — a flat cannot have gutters
   * cleared, whatever it answers. The row is REMOVED, not offered on request: inviting
   * an enquiry for something that will never be sold wastes the customer's time and
   * ours. The API says this with `reason: "not_applicable"`.
   */
  | { kind: 'not_applicable' }

/** True when the customer is allowed to add this row to their booking. */
export function isSelectable(display: PriceDisplay): boolean {
  return display.kind === 'price' || display.kind === 'on_visit'
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
const ON_VISIT: PriceDisplay = { kind: 'on_visit', text: 'Price on visit' }
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
            return priced(cell.price)
          case 'on_visit':
            return ON_VISIT
          case 'not_applicable':
            // "This does not exist for them" is a different answer from "we cannot put
            // a number on it today", and collapsing the two hides a sellable service or
            // offers one that is not.
            return NOT_APPLICABLE
          default:
            // not_priceable / oversized / unavailable all read the same to a customer:
            // we are not going to put a number on this today.
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

