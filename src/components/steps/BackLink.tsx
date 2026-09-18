import { ArrowLeft } from 'lucide-react'
import type { Step } from '@/lib/form-steps'
import { backTargetFor, useFormStore } from '@/stores/formStore'

/**
 * What each step is called when it is the place Back is taking you TO.
 *
 * Deliberately the tracker's own vocabulary ("Property Type", "Property
 * Details") rather than the internal step ids, so the button and the progress
 * bar above it describe the journey the same way. The sub-pickers share their
 * parent's name because that is the screen the customer remembers seeing.
 */
const DESTINATION_LABEL: Record<Step, string> = {
  contact: 'Your Details',
  residentialType: 'Property Type',
  bungalowType: 'Property Type',
  bungalowTypeMobile: 'Property Type',
  townhouseType: 'Property Type',
  townhouseTypeMobile: 'Property Type',
  propertyDetails: 'Property Details',
  residentialLargePropertyDetails: 'Property Details',
  residentialLargeAddress: 'Your Address',
  residentialFrequency: 'Your Quote',
  residentialQuote: 'Your Quote',
  residentialBook: 'Booking',
  commercialDetails: 'Business Details',
  // Terminal screens are never a Back destination — present so the map stays
  // exhaustive and a new step cannot be added without choosing a label.
  residentialThanks: 'Thank You',
  commercialThanks: 'Thank You',
  thankYou: 'Thank You',
}

/**
 * The back control, centred under the step tracker in the sticky bar.
 *
 * Three things it has to be, learned the hard way:
 *
 * VISIBLE. It was a muted text link with no boundary, which on a white page
 * read as body copy rather than as a control. It is now a solid pill — blue
 * fill, white label, yellow arrow, the logo's own two colours.
 *
 * REACHABLE. It was at the TOP of the question while every Continue sits at the
 * BOTTOM, so correcting an earlier answer meant scrolling a long step all the
 * way back up. The bar is sticky, so it is on screen at every scroll position.
 *
 * HONEST. It names where it goes, and it only renders when there is somewhere
 * to go — both read from `backTargetFor`, the same function `goBack()` acts on.
 * A control this prominent that silently does nothing is worse than no control.
 *
 * It still does not compete with Continue: it lives in the page chrome, it is a
 * pill rather than a rectangle, and the one primary action on every screen is
 * the brand-yellow button at the bottom of the form.
 */
export default function BackLink() {
  const step = useFormStore((state) => state.step)
  const residentialType = useFormStore((state) => state.residentialType)
  const goBack = useFormStore((state) => state.goBack)

  // Nothing to undo once the booking or enquiry is in, even though the store
  // still has a mapping for some of them.
  const isComplete =
    step === 'thankYou' || step === 'residentialThanks' || step === 'commercialThanks'

  const target = backTargetFor({ step, residentialType })
  if (isComplete || !target) return null

  return (
    /* h-9 (36px) rather than the 44px a standalone tap target wants: at full
       height a 200px-wide pill dominated the bar. It stays a comfortable target
       because it is wide — ~200x36 is far above the 24x24 WCAG 2.5.8 asks — and
       the bar's own padding keeps clear space around it. */
    <button
      type="button"
      onClick={goBack}
      className="group inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-brand-700 bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:border-brand-800 hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
    >
      {/* Yellow on brand-700 is 6.72:1 — the arrow is the brand accent doing a
          job, not decoration. */}
      <ArrowLeft
        className="h-4 w-4 shrink-0 text-primary-400 transition-transform duration-150 group-hover:-translate-x-0.5"
        aria-hidden
      />
      <span>Back to {DESTINATION_LABEL[target.step]}</span>
    </button>
  )
}
