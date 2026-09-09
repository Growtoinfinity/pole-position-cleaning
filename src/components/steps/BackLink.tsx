import { ChevronLeft } from 'lucide-react'
import { useFormStore } from '@/stores/formStore'

/**
 * The back control, as a link above the question rather than a button inside the
 * progress bar.
 *
 * This is the pattern GOV.UK, Stripe and most checkout flows use, and it is the right
 * one here for two reasons. Going back is navigation, not an action, so it should not
 * look like the Continue button it sits near — a second bordered button competing with
 * the primary CTA is the thing that made the old version feel wrong. And it belongs to
 * the content, not to the progress indicator: the tracker reports where you are, it does
 * not take input.
 *
 * The whole control is padded to a 44px tap target and pulled back with -ml-2 so the
 * label still lines up with the heading underneath it.
 */
export default function BackLink() {
  const step = useFormStore((state) => state.step)
  const goBack = useFormStore((state) => state.goBack)

  // Nowhere to go from the first step, and nothing to undo once the booking is in
  const isFirstStep = step === 'contact'
  const isComplete =
    step === 'thankYou' || step === 'residentialThanks' || step === 'commercialThanks'

  if (isFirstStep || isComplete) return null

  // Back has to sit in the SAME column as the question it goes back from, or it floats
  // out on its own: the question screens are a centred max-w-3xl column inside the wider
  // page column, so a page-width Back lands ~150px left of its own heading. The quote
  // step is the one screen that genuinely uses the full width.
  const isWideStep = step === 'residentialQuote' || step === 'residentialFrequency'

  return (
    <div className={isWideStep ? undefined : 'wwe-step-column'}>
    <button
      type="button"
      onClick={goBack}
      className="group -ml-2 mb-4 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm font-medium text-ink-muted transition-colors hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
    >
      <ChevronLeft
        className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5"
        aria-hidden
      />
      <span className="underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-current">
        Back
      </span>
    </button>
    </div>
  )
}
