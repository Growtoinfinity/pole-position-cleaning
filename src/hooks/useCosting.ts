import type { HouseKind } from '@/lib/costing-calc'
import { useCostingStore } from '@/stores/costingStore'
import type { YesNo } from '@/types'

// This hook provides compatibility with the old CostingContext API
// It wraps the Zustand store to provide the same interface
export function useCosting() {
  const {
    propertyKind,
    bedrooms,
    hasExtension,
    hasConservatory,
    frequency,
    addons,
    calculationResult,
    setPropertyKind,
    setBedrooms,
    setHasExtension,
    setHasConservatory,
    setFrequency,
    setAddons,
    calculateResult,
    getEstimatedBasePrice,
  } = useCostingStore()
  
  return {
    propertyKind,
    bedrooms,
    hasExtension,
    hasConservatory,
    frequency,
    addons,
    calculationResult,
    setPropertyKind: (kind: HouseKind | null) => setPropertyKind(kind),
    setBedrooms: (bedrooms: number) => setBedrooms(bedrooms),
    setHasExtension: (value: YesNo) => setHasExtension(value),
    setHasConservatory: (value: YesNo) => setHasConservatory(value),
    setFrequency,
    setAddons,
    calculateResult,
    getEstimatedBasePrice,
  }
}
