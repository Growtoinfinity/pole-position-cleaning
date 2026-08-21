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
  const step = useFormStore((state) => state.step)
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
    loadPriceTable,
  } = useCostingStore()

  // Keeps `?token=` in the address bar so a refresh resumes where the user left off
  useContinueUrl()

  // Each step is a new page as far as the customer is concerned. Without this the
  // browser keeps the previous scroll offset, so pressing Continue from the bottom
  // of a long step drops them into the middle of the next one with the question
  // already off-screen above.
  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [step])

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

        // Resume lands straight on the quote step without passing through property
        // details, which is where the one pricing fetch normally happens. Without this
        // the resumed table renders from the local book while a fresh run renders from
        // the API — the same property quoted two different ways.
        if (formState.propertyDetails) {
          loadPriceTable().catch((error) =>
            console.error('Error loading price table on resume:', error))
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
    loadPriceTable,
  ])

  // Don't render until initialization is complete to prevent flash of initial state
  if (!isInitialized) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-white">
        <span
          className="h-8 w-8 animate-spin rounded-full border-[3px] border-skeleton border-t-brand-600"
          aria-hidden
        />
        <p className="text-sm font-medium text-ink-muted">Loading your quote…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
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
