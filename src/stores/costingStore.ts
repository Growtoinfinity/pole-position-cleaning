import {
  emptyResult,
  supportsUplifts,
  type CalcInput,
  type CalcResult,
  type Frequency,
  type HouseKind,
} from '@/lib/costing-calc'
import { buildCalcResult } from '@/lib/price-table'
import { fetchPriceTable } from '@/lib/pricing-client'
import { inputsKeyFor, type PriceTable } from '@/lib/pricing'
import type { YesNo } from '@/types'
import { create } from 'zustand'

/**
 * Where the prices on screen came from.
 *
 * `idle`        — nothing fetched yet (the quote step has not been reached)
 * `loading`     — a fetch is in flight; the table must not be rendered half-priced
 * `api`         — showing the pricing API's prices
 * `unavailable` — the API could not answer. There is no second price book to fall back
 *                 on, so those rows read "price on request" rather than a number.
 */
export type PriceStatus = 'idle' | 'loading' | 'api' | 'unavailable'

/**
 * The add-ons a customer can tick on the quote step.
 *
 * Both conservatory roof cleans are sellable here, and they always carry the same price:
 * the internal one is a `same_as_service` of the external, and not one of that table's
 * cells takes an uplift (§4, §5 of `docs/pricing-api-wewasheverything.md`).
 */
export type Addons = {
  gutterClear: boolean
  fasciaClean: boolean
  conservatoryRoofCleanExternal: boolean
  conservatoryRoofCleanInternal: boolean
}

const NO_ADDONS: Addons = {
  gutterClear: false,
  fasciaClean: false,
  conservatoryRoofCleanExternal: false,
  conservatoryRoofCleanInternal: false,
}

interface CostingState {
  // Property details
  propertyKind: HouseKind | null
  /** Every property, flats included — a flat bands on bedrooms exactly as a house does. */
  bedrooms: number
  hasExtension: boolean
  hasConservatory: boolean
  /**
   * Pricing inputs, not just survey answers. A loft conversion adds £2 to each window
   * row, £6 to fascia and £5 to gutter; each Velux adds £1 to the window rows. `loft` is
   * required by the API — without it every row answers `missing_inputs`.
   */
  hasLoftConversion: boolean
  veluxCount: number

  // Quote details
  frequency: Frequency | null
  addons: Addons

  // Calculation results
  calculationResult: CalcResult | null

  /** Prices for this property, fetched once. Null means there are no prices to show. */
  priceTable: PriceTable | null
  priceStatus: PriceStatus
  /** Why the table is missing, when it is — surfaced for logging, not for the customer. */
  priceReason: string | null
  /** `inputsKeyFor()` of the property the table was fetched for, so we refetch only on a real change. */
  pricedInputsKey: string | null

  // Actions
  setPropertyKind: (kind: HouseKind | null) => void
  setBedrooms: (bedrooms: number) => void
  setHasExtension: (hasExtension: YesNo) => void
  setHasConservatory: (hasConservatory: YesNo) => void
  setHasLoftConversion: (hasLoftConversion: YesNo) => void
  setVeluxCount: (veluxCount: number) => void
  setFrequency: (frequency: Frequency | null) => void
  setAddons: (addons: Partial<Addons>) => void

  // Helper functions
  calculateResult: (frequency: Frequency, addons: Addons) => CalcResult
  getEstimatedBasePrice: () => number | null
  updateCalculationResult: () => void
  /** Fetches every price for the current property. Call once, before the quote step. */
  loadPriceTable: () => Promise<void>
  /** The property as the pricing API sees it, or null when the details are incomplete. */
  currentCalcInput: (frequency?: Frequency, addons?: Addons) => CalcInput | null
  reset: () => void
}

export const useCostingStore = create<CostingState>((set, get) => ({
  // Initial state
  propertyKind: null,
  bedrooms: 0,
  hasExtension: false,
  hasConservatory: false,
  hasLoftConversion: false,
  veluxCount: 0,
  frequency: null,
  addons: { ...NO_ADDONS },
  calculationResult: null,
  priceTable: null,
  priceStatus: 'idle',
  priceReason: null,
  pricedInputsKey: null,

  // Actions
  setPropertyKind: (kind) => {
    set({ propertyKind: kind })
    get().updateCalculationResult()
  },

  setBedrooms: (bedrooms) => {
    set({ bedrooms })
    get().updateCalculationResult()
  },

  setHasExtension: (value) => {
    set({ hasExtension: value === 'yes' })
    get().updateCalculationResult()
  },

  /**
   * The conservatory answer does double duty: it is one of the two uplifts the engine
   * actually charges, and it is also what gates both roof-clean services. Answering "no"
   * makes the API return them `not_applicable` — for this turn only, not permanently, so
   * changing the answer back brings both rows straight back (§9b).
   */
  setHasConservatory: (value) => {
    set({ hasConservatory: value === 'yes' })
    get().updateCalculationResult()
  },

  setHasLoftConversion: (value) => {
    set({ hasLoftConversion: value === 'yes' })
    get().updateCalculationResult()
  },

  setVeluxCount: (veluxCount) => {
    set({ veluxCount: Math.max(0, Math.trunc(veluxCount)) })
    get().updateCalculationResult()
  },

  setFrequency: (frequency) => {
    set({ frequency })
    get().updateCalculationResult()
  },

  setAddons: (newAddons) => {
    set((state) => ({
      addons: { ...state.addons, ...newAddons }
    }))
    get().updateCalculationResult()
  },

  /** The property as the pricing API sees it, or null when the details are incomplete. */
  currentCalcInput: (freq, addonOptions) => {
    const {
      propertyKind, bedrooms, hasExtension, hasConservatory,
      hasLoftConversion, veluxCount, frequency, addons,
    } = get()

    if (!propertyKind) return null

    // 6-weekly is the shorter, more frequent cycle and the one the sheet leads with.
    // It is only a placeholder for a table fetch: the customer's real choice arrives as
    // `freq` once the frequency step is answered.
    const selectedFrequency = freq ?? frequency ?? 6
    const selectedAddons = addonOptions ?? addons

    // Every property bands on bedrooms now, a flat included — the client's own rule, and
    // the reason a flat is no longer asked which floor it is on (§7).
    if (bedrooms <= 0) return null

    // A flat is still asked neither uplift question: the five `Flat` cells carry no `add`
    // object, so nothing could attach to them, and sending an extension or conservatory
    // answer a flat was never given the chance to give would be inventing one.
    if (!supportsUplifts(propertyKind)) {
      return {
        kind: propertyKind,
        bedrooms,
        selectedFrequency,
        addons: selectedAddons,
      }
    }

    return {
      kind: propertyKind,
      bedrooms,
      hasExtension,
      hasConservatory,
      hasLoftConversion,
      veluxCount,
      selectedFrequency,
      addons: selectedAddons,
    }
  },

  /**
   * Fetches every price for the current property, once.
   *
   * Keyed on the inputs that actually move a price, so navigating back to the quote step
   * with the same answers costs nothing, while genuinely changing a bedroom count or a
   * floor refetches. A failure leaves `priceTable` null and `priceStatus` at
   * `unavailable`: the rows read "price on request", because there is no second book to
   * read a number out of — and it is left uncached, so the next visit tries again.
   */
  loadPriceTable: async () => {
    const input = get().currentCalcInput()
    if (!input) return

    const key = inputsKeyFor(input)
    if (get().pricedInputsKey === key && get().priceStatus !== 'loading') return

    set({ priceStatus: 'loading', priceReason: null })

    const { table, reason } = await fetchPriceTable(input)

    set({
      priceTable: table,
      priceStatus: table ? 'api' : 'unavailable',
      priceReason: reason,
      // Only a table earns the cache key. A fetch that came back with nothing was an
      // outage, not an answer about this property — remembering it would make the guard
      // above skip the retry for the rest of the session, so a customer who goes back and
      // re-picks the same answers would be served the same priceless screen a second time
      // without another request ever being made.
      pricedInputsKey: table ? key : null,
    })

    if (!table) {
      console.warn(`[pricing] no price table for this property (${reason})`)
    }

    get().updateCalculationResult()
  },

  // Helper function to update calculation result
  updateCalculationResult: () => {
    const { frequency, addons } = get()
    if (!frequency) return

    const result = get().calculateResult(frequency, addons)
    if (result.schedule) set({ calculationResult: result })
  },

  /**
   * The quote for a given frequency + add-on selection.
   *
   * Reads the fetched price table and nothing else. Synchronous by design: the table is
   * fetched once before the quote step, so clicking a frequency or an add-on re-slices
   * numbers that are already in memory rather than costing a round trip.
   *
   * With no table — or with the property details still incomplete — the answer is a
   * quote with no prices in it. Never a guessed number: see the note at the top of
   * costing-calc.ts.
   */
  calculateResult: (freq, addonOptions) => {
    const input = get().currentCalcInput(freq, addonOptions)
    const { priceTable } = get()

    if (!input || !priceTable) return emptyResult(freq)

    return buildCalcResult(priceTable, input)
  },

  // Get estimated base price for the property (using the 6-weekly row as default)
  getEstimatedBasePrice: () => {
    if (!get().currentCalcInput()) return null

    // Goes through `calculateResult` so it reads the same source as everything else —
    // an "estimate" derived from a different engine than the quote is worse than none.
    const result = get().calculateResult(6, { ...NO_ADDONS })

    return result.basePrice
  },

  // Reset store to initial state
  reset: () => {
    set({
      propertyKind: null,
      bedrooms: 0,
      hasExtension: false,
      hasConservatory: false,
      hasLoftConversion: false,
      veluxCount: 0,
      frequency: null,
      addons: { ...NO_ADDONS },
      calculationResult: null,
      priceTable: null,
      priceStatus: 'idle',
      priceReason: null,
      pricedInputsKey: null,
    })
  }
}))
