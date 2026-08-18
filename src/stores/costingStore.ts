import {
  calculateCost,
  type CalcInput,
  type CalcResult,
  type ConservatoryRoofPricingInput,
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
 * `idle`   — nothing fetched yet (the quote step has not been reached)
 * `loading`— a fetch is in flight; the table must not be rendered half-priced
 * `api`    — showing the v3 bot's prices
 * `local`  — the API could not answer; showing the local book as a fallback
 */
export type PriceStatus = 'idle' | 'loading' | 'api' | 'local'

type Addons = {
  gutterClear: boolean
  fasciaClean: boolean
  conservatoryRoofCleanExternal: boolean
  conservatoryRoofCleanInternal: boolean
  adHocInternalClean: boolean
}

interface CostingState {
  // Property details
  propertyKind: HouseKind | null
  bedrooms: number
  hasExtension: boolean
  hasConservatory: boolean
  /** Roof-clean add-ons — null with conservatory means “on visit” (£10/panel in copy), not a fixed table */
  conservatoryRoofPricing: ConservatoryRoofPricingInput | null

  // Quote details
  frequency: 6 | 8 | 12 | 'one-off' | null
  addons: Addons

  // Calculation results
  calculationResult: CalcResult | null

  /** Prices for this property, fetched once. Null means the local book is in charge. */
  priceTable: PriceTable | null
  priceStatus: PriceStatus
  /** Why we fell back, when we did — surfaced for logging, not for the customer. */
  priceReason: string | null
  /** `inputsKeyFor()` of the property the table was fetched for, so we refetch only on a real change. */
  pricedInputsKey: string | null

  // Actions
  setPropertyKind: (kind: HouseKind | null) => void
  setBedrooms: (bedrooms: number) => void
  setHasExtension: (hasExtension: YesNo) => void
  setHasConservatory: (hasConservatory: YesNo) => void
  setConservatoryRoofPricing: (pricing: ConservatoryRoofPricingInput | null) => void
  setFrequency: (frequency: 6 | 8 | 12 | 'one-off' | null) => void
  setAddons: (addons: Partial<Addons>) => void
  
  // Helper functions
  calculateResult: (frequency: 6 | 8 | 12 | 'one-off', addons: Addons) => CalcResult
  getEstimatedBasePrice: () => number | null
  updateCalculationResult: () => void
  /** Fetches every price for the current property. Call once, before the quote step. */
  loadPriceTable: () => Promise<void>
  /** The property as the pricing API sees it, or null when the details are incomplete. */
  currentCalcInput: (
    frequency?: 6 | 8 | 12 | 'one-off',
    addons?: Addons,
  ) => CalcInput | null
  reset: () => void
}

export const useCostingStore = create<CostingState>((set, get) => ({
  // Initial state
  propertyKind: null,
  bedrooms: 0,
  hasExtension: false,
  hasConservatory: false,
  conservatoryRoofPricing: null,
  frequency: null,
  addons: {
    gutterClear: false,
    fasciaClean: false,
    conservatoryRoofCleanExternal: false,
    conservatoryRoofCleanInternal: false,
    adHocInternalClean: false,
  },
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
  
  setHasConservatory: (value) => {
    set({
      hasConservatory: value === 'yes',
      conservatoryRoofPricing: value === 'yes' ? get().conservatoryRoofPricing : null,
    })
    get().updateCalculationResult()
  },

  setConservatoryRoofPricing: (pricing) => {
    set({ conservatoryRoofPricing: pricing })
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
      propertyKind,
      bedrooms,
      hasExtension,
      hasConservatory,
      conservatoryRoofPricing,
      frequency,
      addons,
    } = get()

    if (!propertyKind || bedrooms <= 0) return null

    return {
      kind: propertyKind,
      bedrooms,
      hasExtension,
      hasConservatory,
      conservatoryRoofPricing: hasConservatory ? conservatoryRoofPricing : null,
      selectedFrequency: freq ?? frequency ?? 8,
      addons: addonOptions ?? addons,
    }
  },

  /**
   * Fetches every price for the current property, once.
   *
   * Keyed on the inputs that actually move a price, so navigating back to the quote step
   * with the same answers costs nothing, while genuinely changing a bedroom count
   * refetches. A failure is not surfaced to the customer — `priceStatus` drops to
   * `local` and the local book renders instead.
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
      priceStatus: table ? 'api' : 'local',
      priceReason: reason,
      pricedInputsKey: key,
    })

    if (!table) {
      console.warn(`[pricing] falling back to the local price book (${reason})`)
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
   * Reads the fetched price table when there is one, and only falls back to the local
   * book when the API could not answer. Synchronous by design: the table is fetched once
   * before the quote step, so clicking a frequency or an add-on re-slices numbers that
   * are already in memory rather than costing a round trip.
   */
  calculateResult: (freq, addonOptions) => {
    const input = get().currentCalcInput(freq, addonOptions)
    if (!input) {
      // No usable costing state. Return a well-formed empty result rather than `{}` —
      // callers index straight into `schedule` and `extras`.
      return {
        schedule: [],
        extras: [],
        selectedFrequency: freq,
        selectedLabel: freq === 'one-off' ? 'One-off' : `${freq}-weekly`,
        basePrice: 0,
        total: 0,
      }
    }

    const { priceTable } = get()
    if (priceTable) return buildCalcResult(priceTable, input)

    return calculateCost(input)
  },
  
  // Get estimated base price for the property (using 8-weekly as default)
  getEstimatedBasePrice: () => {
    if (!get().currentCalcInput()) return null

    // Goes through `calculateResult` so it reads the same source as everything else —
    // an "estimate" derived from a different engine than the quote is worse than none.
    const result = get().calculateResult(8, {
      gutterClear: false,
      fasciaClean: false,
      conservatoryRoofCleanExternal: false,
      conservatoryRoofCleanInternal: false,
      adHocInternalClean: false,
    })

    return result.basePrice
  },

  // Reset store to initial state
  reset: () => {
    set({
      propertyKind: null,
      bedrooms: 0,
      hasExtension: false,
      hasConservatory: false,
      conservatoryRoofPricing: null,
      frequency: null,
      addons: {
        gutterClear: false,
        fasciaClean: false,
        conservatoryRoofCleanExternal: false,
        conservatoryRoofCleanInternal: false,
        adHocInternalClean: false,
      },
      calculationResult: null,
      priceTable: null,
      priceStatus: 'idle',
      priceReason: null,
      pricedInputsKey: null,
    })
  }
}))