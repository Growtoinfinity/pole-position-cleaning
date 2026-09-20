import { memo, useEffect, useState } from 'react'
import QuoteHeader from '@/components/QuoteHeader'
import MainContent from '@/components/MainContent'
import StepNavigation from '@/components/steps/StepNavigation'
import StepRenderer, { houseKindFor } from '@/components/steps/StepRenderer'
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
    setHasLoftConversion,
    setHasVelux,
    setHasOutdoorAccess,
    setPlan,
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
        const kind = houseKindFor(
          formState.residentialType,
          formState.bungalowKind,
          formState.townhouseKind,
        )
        if (kind) setPropertyKind(kind)

        if (formState.propertyDetails) {
          const details = formState.propertyDetails

          // Mirrored unconditionally, flats included. There is no per-kind split any more:
          // `requiredInputs` is global on this client, so a resumed flat that restores
          // only its bedroom count is refused on every row with `missing_inputs` and the
          // customer comes back to a quote screen that can no longer price their home.
          // The fallbacks stay because the values are optional at the type level.
          setBedrooms(details.bedrooms ?? 0)
          setHasExtension(details.hasExtension ?? 'no')
          setHasConservatory(details.hasConservatory ?? 'no')
          setHasLoftConversion(details.hasLoftConversion ?? 'no')
          setHasVelux(details.hasVelux ?? 'no')
          // Only restored when it was actually answered — a resumed property whose access
          // question was never reached must not come back silently half-priced.
          if (details.hasOutdoorAccess) setHasOutdoorAccess(details.hasOutdoorAccess)
        }

        if (formState.residentialFrequency) {
          setPlan(formState.residentialFrequency.plan)
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
    setHasLoftConversion,
    setHasVelux,
    setHasOutdoorAccess,
    setPlan,
    setAddons,
    loadPriceTable,
  ])

  // Don't render until initialization is complete to prevent flash of initial state
  if (!isInitialized) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background">
        <span
          className="h-8 w-8 animate-spin rounded-full border-[3px] border-skeleton border-t-brand-600"
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
        {/* Back is not here any more — it lives in the sticky step bar, so it
            stays on screen instead of scrolling away above a long question. */}
        <StepRenderer />
        <Footer />
      </MainContent>
    </div>
  )
})

export default App
