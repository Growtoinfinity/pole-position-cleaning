import { memo, useEffect, useState } from 'react'
import QuoteHeader from '@/components/QuoteHeader'
import MainContent from '@/components/MainContent'
import StepNavigation from '@/components/steps/StepNavigation'
import StepRenderer from '@/components/steps/StepRenderer'
import Footer from '@/components/Footer'
import { useFormStore } from '@/stores/formStore'
import { useCostingStore } from '@/stores/costingStore'
import { useContinueUrl } from '@/hooks/useContinueUrl'

// Memoized App component to prevent unnecessary re-renders
const App = memo(function App() {
  const [isInitialized, setIsInitialized] = useState(false)
  const restoreFromUrl = useFormStore((state) => state.restoreFromUrl)
  const restoreFromLeadUrl = useFormStore((state) => state.restoreFromLeadUrl)
  const setStep = useFormStore((state) => state.setStep)
  const setResidentialQuoteResult = useFormStore((state) => state.setResidentialQuoteResult)
  const { setPropertyKind, setBedrooms, setHasExtension, setHasConservatory, setConservatoryRoofPricing, calculateResult } = useCostingStore()
  
  // Initialize the continue URL hook to track state changes
  useContinueUrl()

  // Restore form state from URL on initial load
  useEffect(() => {
    if (isInitialized) return

    // First, try to restore from lead URL (human-readable params like ?name=John&house_type=detached)
    const leadResult = restoreFromLeadUrl()
    
    if (leadResult.restored) {
      console.log('Restored from lead URL, target step:', leadResult.targetStep)
      
      // Restore costing store state if we have property data
      const formState = useFormStore.getState()
      
      // Restore property kind in costing store
      if (formState.residentialType) {
        if (formState.residentialType === 'bungalow' && formState.bungalowKind) {
          const propertyKind = formState.bungalowKind === 'semi_detached' ? 'semi_detached' 
            : formState.bungalowKind === 'terraced' ? 'terraced' : 'detached'
          setPropertyKind(propertyKind as any)
        } else if (formState.residentialType === 'townhouse') {
          setPropertyKind('townhouse')
        } else if (formState.residentialType === 'semi_detached') {
          setPropertyKind('semi_detached')
        } else if (formState.residentialType === 'terraced') {
          setPropertyKind('terraced')
        } else if (formState.residentialType === 'detached') {
          setPropertyKind('detached')
        }
      }
      
      // Restore property details in costing store
      if (formState.propertyDetails && formState.propertyDetails.bedrooms > 0) {
        setBedrooms(formState.propertyDetails.bedrooms)
        setHasExtension(formState.propertyDetails.hasExtension)
        setHasConservatory(formState.propertyDetails.hasConservatory)
        setConservatoryRoofPricing(
          formState.propertyDetails.hasConservatory === 'yes'
            ? (formState.propertyDetails.conservatoryRoof ?? null)
            : null,
        )
      }
    }

    // Fall back to compressed URL format (for backward compatibility)
    const restored = restoreFromUrl()
    
    if (restored) {
      // If we restored state, we need to also restore costing store
      const formState = useFormStore.getState()
      
      // Restore property kind in costing store
      if (formState.residentialType) {
        if (formState.residentialType === 'bungalow' && formState.bungalowKind) {
          const propertyKind = formState.bungalowKind === 'semi_detached' ? 'semi_detached' 
            : formState.bungalowKind === 'terraced' ? 'terraced' : 'detached'
          setPropertyKind(propertyKind as any)
        } else if (formState.residentialType === 'townhouse') {
          setPropertyKind('townhouse')
        } else if (formState.residentialType === 'semi_detached') {
          setPropertyKind('semi_detached')
        } else if (formState.residentialType === 'terraced') {
          setPropertyKind('terraced')
        } else if (formState.residentialType === 'detached') {
          setPropertyKind('detached')
        }
      }
      
      // Restore property details in costing store
      if (formState.propertyDetails) {
        setBedrooms(formState.propertyDetails.bedrooms)
        setHasExtension(formState.propertyDetails.hasExtension)
        setHasConservatory(formState.propertyDetails.hasConservatory)
        setConservatoryRoofPricing(
          formState.propertyDetails.hasConservatory === 'yes'
            ? (formState.propertyDetails.conservatoryRoof ?? null)
            : null,
        )
      }
      // This ensures prices are correct after restoration
      if (formState.residentialFrequency) {
        const frequency = formState.residentialFrequency.frequency || 8
        const result = calculateResult(frequency, formState.residentialFrequency.addons)
        setResidentialQuoteResult(result)
      }
      
      // Always start from step 1 (contact) so user can review their information
      setStep('contact')
    }
    
    setIsInitialized(true)
  }, [isInitialized, restoreFromUrl, restoreFromLeadUrl, setStep, setResidentialQuoteResult, setPropertyKind, setBedrooms, setHasExtension, setHasConservatory, setConservatoryRoofPricing, calculateResult])

  // Don't render until initialization is complete to prevent flash of initial state
  if (!isInitialized) {
    return (
      <div
        className="min-h-screen pb-6 w-full bg-[#013252] text-white flex flex-col overflow-x-hidden items-center justify-center"
        style={{ fontFamily: "'Open Sans', sans-serif" }}
      >
        <div className="animate-pulse text-[#BF8639] text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen pb-6 w-full bg-[#013252] text-white flex flex-col overflow-x-hidden"
      style={{ fontFamily: "'Open Sans', sans-serif" }}
    >
      <QuoteHeader />
      <StepNavigation />
      <MainContent>
        <StepRenderer />
        <Footer />
      </MainContent>
    </div>
  )
})

export default App