import { calculateCost, type CalcResult, type HouseKind } from '@/lib/costing-calc'
import type { YesNo } from '@/types'
import { create } from 'zustand'

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

  // Quote details
  frequency: 6 | 8 | 12 | 'one-off' | null
  addons: Addons

  // Calculation results
  calculationResult: CalcResult | null

  // Actions
  setPropertyKind: (kind: HouseKind | null) => void
  setBedrooms: (bedrooms: number) => void
  setHasExtension: (hasExtension: YesNo) => void
  setHasConservatory: (hasConservatory: YesNo) => void
  setFrequency: (frequency: 6 | 8 | 12 | 'one-off' | null) => void
  setAddons: (addons: Partial<Addons>) => void
  
  // Helper functions
  calculateResult: (frequency: 6 | 8 | 12 | 'one-off', addons: Addons) => CalcResult
  getEstimatedBasePrice: () => number | null
  updateCalculationResult: () => void
  reset: () => void
}

export const useCostingStore = create<CostingState>((set, get) => ({
  // Initial state
  propertyKind: null,
  bedrooms: 0,
  hasExtension: false,
  hasConservatory: false,
  frequency: null,
  addons: {
    gutterClear: false,
    fasciaClean: false,
    conservatoryRoofCleanExternal: false,
    conservatoryRoofCleanInternal: false,
    adHocInternalClean: false,
  },
  calculationResult: null,

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
    set({ hasConservatory: value === 'yes' })
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

  // Helper function to update calculation result
  updateCalculationResult: () => {
    const { propertyKind, bedrooms, hasExtension, hasConservatory, frequency, addons } = get()
    
    if (propertyKind && bedrooms > 0 && frequency) {
      const result = calculateCost({
        kind: propertyKind,
        bedrooms,
        hasExtension,
        hasConservatory,
        selectedFrequency: frequency,
        addons,
      })
      set({ calculationResult: result })
    }
  },
  
  // Calculate result based on frequency and addons
  calculateResult: (freq, addonOptions) => {
    const { propertyKind, bedrooms, hasExtension, hasConservatory } = get()
    
    if (!propertyKind || bedrooms <= 0) {
      return {} as CalcResult
    }

    return calculateCost({
      kind: propertyKind,
      bedrooms,
      hasExtension,
      hasConservatory,
      selectedFrequency: freq,
      addons: addonOptions,
    })
  },
  
  // Get estimated base price for the property (using 8-weekly as default)
  getEstimatedBasePrice: () => {
    const { propertyKind, bedrooms, hasExtension, hasConservatory } = get()
    
    if (!propertyKind || bedrooms <= 0) {
      return null
    }

    const result = calculateCost({
      kind: propertyKind,
      bedrooms,
      hasExtension,
      hasConservatory,
      selectedFrequency: 8,
      addons: {
        gutterClear: false,
        fasciaClean: false,
        conservatoryRoofCleanExternal: false,
        conservatoryRoofCleanInternal: false,
        adHocInternalClean: false,
      },
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
      frequency: null,
      addons: {
        gutterClear: false,
        fasciaClean: false,
        conservatoryRoofCleanExternal: false,
        conservatoryRoofCleanInternal: false,
        adHocInternalClean: false,
      },
      calculationResult: null,
    })
  }
}))