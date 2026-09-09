import { memo, useEffect, useState } from 'react'
import QuoteHeader from '@/components/QuoteHeader'
import MainContent from '@/components/MainContent'
import StepNavigation from '@/components/steps/StepNavigation'
import StepRenderer, { houseKindFor } from '@/components/steps/StepRenderer'
import Footer from '@/components/Footer'
import BackLink from '@/components/steps/BackLink'
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
    setFloor,
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

        // One mapping, shared with StepRenderer — a second copy here is how a flat
        // came back from a resume with no priced kind at all.
        const kind = houseKindFor(formState.residentialType, formState.bungalowKind)
        if (kind) setPropertyKind(kind)

        if (formState.propertyDetails) {
          const details = formState.propertyDetails

          // The same split StepRenderer makes on submit: a flat is priced by its floor
          // and is asked nothing else, so mirroring bedrooms or the uplift answers for
          // one would put answers into the pricing call that were never asked for.
          if (kind === 'flat') {
            setFloor(details.floor ?? null)
          } else {
            // The house questions are all required, so these fallbacks are unreachable —
            // they exist because the values are optional at the type level, in a shape
            // shared with the flat's floor.
            setBedrooms(details.bedrooms ?? 0)
            setHasExtension(details.hasExtension ?? 'no')
            setHasConservatory(details.hasConservatory ?? 'no')
            setConservatoryRoofPricing(
              details.hasConservatory === 'yes' ? (details.conservatoryRoof ?? null) : null,
            )
          }
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
    setFloor,
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
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background">
        <span
          className="h-8 w-8 animate-spin rounded-full border-[3px] border-skeleton border-t-brand-400"
          aria-hidden
        />
        <p className="text-sm font-medium text-ink-muted">Loading your quote…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <QuoteHeader />
      <StepNavigation />
      <MainContent>
        <BackLink />
        <StepRenderer />
        <Footer />
      </MainContent>
    </div>
  )
})

export default App
