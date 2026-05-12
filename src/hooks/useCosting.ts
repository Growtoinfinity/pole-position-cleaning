import { useCostingStore } from '@/stores/costingStore'
import { useMemo } from 'react'

// This hook provides compatibility with the old CostingContext API
// It wraps the Zustand store to provide the same interface.
// Return value is memoized so consumers can safely list it in effect deps.
export function useCosting() {
  const propertyKind = useCostingStore((s) => s.propertyKind)
  const bedrooms = useCostingStore((s) => s.bedrooms)
  const hasExtension = useCostingStore((s) => s.hasExtension)
  const hasConservatory = useCostingStore((s) => s.hasConservatory)
  const frequency = useCostingStore((s) => s.frequency)
  const addons = useCostingStore((s) => s.addons)
  const calculationResult = useCostingStore((s) => s.calculationResult)
  const setPropertyKind = useCostingStore((s) => s.setPropertyKind)
  const setBedrooms = useCostingStore((s) => s.setBedrooms)
  const setHasExtension = useCostingStore((s) => s.setHasExtension)
  const setHasConservatory = useCostingStore((s) => s.setHasConservatory)
  const setConservatoryRoofPricing = useCostingStore((s) => s.setConservatoryRoofPricing)
  const setFrequency = useCostingStore((s) => s.setFrequency)
  const setAddons = useCostingStore((s) => s.setAddons)
  const calculateResult = useCostingStore((s) => s.calculateResult)
  const getEstimatedBasePrice = useCostingStore((s) => s.getEstimatedBasePrice)

  return useMemo(
    () => ({
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
      setConservatoryRoofPricing,
      setFrequency,
      setAddons,
      calculateResult,
      getEstimatedBasePrice,
    }),
    [
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
      setConservatoryRoofPricing,
      setFrequency,
      setAddons,
      calculateResult,
      getEstimatedBasePrice,
    ],
  )
}
