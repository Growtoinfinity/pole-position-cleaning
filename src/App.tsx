import { memo, useEffect, useState } from 'react'
import QuoteHeader from '@/components/QuoteHeader'
import MainContent from '@/components/MainContent'
import StepNavigation from '@/components/steps/StepNavigation'
import StepRenderer from '@/components/steps/StepRenderer'
import Footer from '@/components/Footer'
import { useFormStore } from '@/stores/formStore'
import { useCostingStore } from '@/stores/costingStore'
import { useContinueUrl } from '@/hooks/useContinueUrl'
import { fetchSubmission } from '@/lib/submission'
import { getTokenFromUrl } from '@/lib/token-url'

// Memoized App component to prevent unnecessary re-renders
const App = memo(function App() {
  const [isInitialized, setIsInitialized] = useState(false)
  // Captured on first render, before any effect can touch the address bar
  const [resumeToken] = useState(getTokenFromUrl)
  const hydrateFromSubmission = useFormStore((state) => state.hydrateFromSubmission)
  const {
    setPropertyKind,
    setBedrooms,
    setHasExtension,
    setHasConservatory,
    setConservatoryRoofPricing,
    setFrequency,
    setAddons,
  } = useCostingStore()

  // Keeps `?token=` in the address bar so a refresh resumes where the user left off
  useContinueUrl()

  // Resume from `?token=` — the one and only resume path
  useEffect(() => {
    if (isInitialized) return

    if (!resumeToken) {
      setIsInitialized(true)
      return
    }

    let cancelled = false

    fetchSubmission(resumeToken)
      .then((row) => {
        if (cancelled || !row) return

        hydrateFromSubmission(row)

        // Mirror the restored property details into the costing store so prices
        // recalculate correctly from the resumed state
        const formState = useFormStore.getState()

        if (formState.residentialType) {
          if (formState.residentialType === 'bungalow' && formState.bungalowKind) {
            setPropertyKind(formState.bungalowKind)
          } else if (formState.residentialType === 'townhouse') {
            setPropertyKind('townhouse')
          } else if (
            formState.residentialType === 'semi_detached' ||
            formState.residentialType === 'terraced' ||
            formState.residentialType === 'detached'
          ) {
            setPropertyKind(formState.residentialType)
          }
        }

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

        if (formState.residentialFrequency) {
          setFrequency(formState.residentialFrequency.frequency)
          setAddons(formState.residentialFrequency.addons)
        }
      })
      .catch((error) => {
        console.warn('Failed to resume from token:', error)
      })
      .finally(() => {
        if (!cancelled) setIsInitialized(true)
      })

    return () => {
      cancelled = true
    }
  }, [
    isInitialized,
    resumeToken,
    hydrateFromSubmission,
    setPropertyKind,
    setBedrooms,
    setHasExtension,
    setHasConservatory,
    setConservatoryRoofPricing,
    setFrequency,
    setAddons,
  ])

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
