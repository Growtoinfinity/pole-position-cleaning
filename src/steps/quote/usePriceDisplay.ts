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
import type { CalcResult } from '@/lib/costing-calc'
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

/** True when the customer is allowed to add this row to their booking. */
export function isSelectable(display: PriceDisplay): boolean {
  return display.kind === 'price' || display.kind === 'on_visit'
}

/** The bare number for a slot, or null. Callers must not render null as £0. */
export function valueOf(display: PriceDisplay): number | null {
  return display.kind === 'price' ? display.value : null
}

const LOADING: PriceDisplay = { kind: 'loading' }
const ON_VISIT: PriceDisplay = { kind: 'on_visit', text: 'Price on visit' }
const ON_REQUEST: PriceDisplay = { kind: 'on_request', text: 'Price on request' }

function priced(value: number): PriceDisplay {
  return { kind: 'price', text: `£${value}`, value }
}

export function usePriceDisplay(args: {
  priceStatus: PriceStatus
  priceTable: PriceTable | null
  /** The locally-calculated fallback, used only when there is no table. */
  fallback: CalcResult
}) {
  const { priceStatus, priceTable, fallback } = args

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
          default:
            // not_priceable / oversized / unavailable all read the same to a customer:
            // we are not going to put a number on this today.
            return ON_REQUEST
        }
      }

      // No table — the local book is in charge.
      const label = LABEL_BY_KEY[key]
      const scheduled = fallback.schedule?.find((row) => row.label === label)
      if (scheduled) return priced(scheduled.price)

      const extra = fallback.extras?.find((row) => row.label === label)
      if (extra?.pricedOnVisit) return ON_VISIT
      if (extra) return priced(extra.price)

      return ON_REQUEST
    }

    const forLabel = (label: string): PriceDisplay => {
      const key = SERVICE_KEY_BY_LABEL[label]
      return key ? forServiceKey(key) : ON_REQUEST
    }

    const forFrequency = (frequency: 6 | 8 | 12 | 'one-off'): PriceDisplay =>
      forServiceKey(serviceKeyForFrequency(frequency))

    return { forServiceKey, forLabel, forFrequency }
  }, [priceStatus, priceTable, fallback])
}

/**
 * Local-fallback lookup only. The frequency rows live in `schedule` under these labels,
 * the add-ons in `extras` — mirroring what `calculateCost` produces.
 */
const LABEL_BY_KEY: Record<ServiceKey, string> = {
  ext_window_6weekly: '6-weekly',
  ext_window_8weekly: '8-weekly',
  ext_window_12weekly: '12-weekly',
  ext_window_oneoff: 'One-off',
  int_window_oneoff: 'Ad Hoc Internal Window Clean',
  full_gutter_clearance: 'Ad Hoc Gutter Clearance',
  fascia_soffit_gutter: 'Ad Hoc Fascia Soffit & Gutter Clean',
  conservatory_roof_external: 'Ad Hoc Conservatory Roof Clean - External',
  conservatory_roof_internal: 'Ad Hoc Conservatory Roof Clean - Internal',
}
