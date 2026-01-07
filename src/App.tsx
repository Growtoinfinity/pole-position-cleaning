import { memo, useEffect, useState } from 'react'
import QuoteHeader from '@/components/QuoteHeader'
import MainContent from '@/components/MainContent'
import StepNavigation from '@/components/steps/StepNavigation'
import StepRenderer from '@/components/steps/StepRenderer'
import { useFormStore } from '@/stores/formStore'
import { useCostingStore } from '@/stores/costingStore'
import { useContinueUrl } from '@/hooks/useContinueUrl'

// Memoized App component to prevent unnecessary re-renders
const App = memo(function App() {
  const [isInitialized, setIsInitialized] = useState(false)
  const restoreFromUrl = useFormStore((state) => state.restoreFromUrl)
  const setStep = useFormStore((state) => state.setStep)
  const setResidentialQuoteResult = useFormStore((state) => state.setResidentialQuoteResult)
  const { setPropertyKind, setBedrooms, setHasExtension, setHasConservatory, calculateResult } = useCostingStore()
  
  // Initialize the continue URL hook to track state changes
  useContinueUrl()

  // Restore form state from URL on initial load
  useEffect(() => {
    if (isInitialized) return

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
      }
      
      // Recalculate quote result if we have frequency data
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
  }, [isInitialized, restoreFromUrl, setStep, setResidentialQuoteResult, setPropertyKind, setBedrooms, setHasExtension, setHasConservatory, calculateResult])

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
        </MainContent>
      </div>
  )
})

export default App