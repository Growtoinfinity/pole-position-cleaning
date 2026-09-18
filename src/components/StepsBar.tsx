import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import BackLink from '@/components/steps/BackLink'

type StepKey = 'contact' | 'propertyType' | 'details' | 'quote' | 'book'

const steps: { key: StepKey; label: string }[] = [
  { key: 'contact', label: 'Your Details' },
  { key: 'propertyType', label: 'Property Type' },
  { key: 'details', label: 'Property Details' },
  { key: 'quote', label: 'Quote' },
  { key: 'book', label: 'Book' },
]

/**
 * Sticky, because it carries the Back control. A back button that scrolls away
 * is a back button you have to hunt for: every Continue on this form sits at the
 * bottom of a long screen, so the moment you realise you mistyped something you
 * are as far from the old inline Back as it is possible to be.
 *
 * `bg-card` is opaque on purpose — the content scrolls underneath this bar, and
 * a translucent one would let question text show through the tracker.
 */
export default function StepsBar({
  current,
  complete = false,
}: {
  current: StepKey
  /** Set on the terminal screens so the last step reads as done, not in progress */
  complete?: boolean
}) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((s) => s.key === current),
  )
  const currentStep = steps[currentIndex]
  // The desktop tracker and the mobile bar have to agree: once the booking is in,
  // every circle ticks and the bar reads 100%.
  const progressPercent = complete ? 100 : (currentIndex / (steps.length - 1)) * 100

  return (
    <div className="pp-stepbar-in sticky top-0 z-30 w-full border-b border-line bg-card shadow-card">
      <div className="pp-page-column py-5">
        {/* ---- Desktop: the full labelled tracker ---- */}
        <ol className="hidden items-center justify-center md:flex md:overflow-x-auto">
          {steps.map((step, idx) => {
            const isDone = complete || idx < currentIndex
            const isCurrent = !complete && idx === currentIndex
            const isLast = idx === steps.length - 1

            return (
              <li key={step.key} className="flex min-w-0 items-center">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold leading-none transition-colors',
                      // Done is the brand yellow with a blue rim and a black tick.
                      // The rim is doing real work: the yellow disc's own edge
                      // against the white bar is 1.07:1.
                      isDone && 'border-brand-700 bg-primary-400 text-on-brand',
                      isCurrent && 'border-brand-700 bg-card text-brand-800 ring-4 ring-brand-500/25',
                      !isDone && !isCurrent && 'border-line-strong bg-card text-ink-muted',
                    )}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : idx + 1}
                  </span>
                  <span
                    className={cn(
                      'whitespace-nowrap text-xs font-semibold transition-colors',
                      isDone && 'text-brand-800',
                      isCurrent && 'text-ink-strong',
                      !isDone && !isCurrent && 'text-ink-muted',
                    )}
                  >
                    {step.label}
                  </span>
                </div>

                {!isLast && (
                  <span
                    aria-hidden
                    className={cn(
                      'mx-1.5 h-0.5 w-4 shrink-0 rounded-full transition-colors lg:mx-3 lg:w-16',
                      // brand-600, not the yellow: this connector is a 2px line on
                      // white, and yellow at 1.07:1 would simply not be there.
                      isDone ? 'bg-brand-600' : 'bg-line',
                    )}
                  />
                )}
              </li>
            )
          })}
        </ol>

        {/* ---- Mobile: the step in words, plus a progress bar ---- */}
        <div className="min-w-0 md:hidden">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-ink-strong">
              {currentStep.label}
            </span>
            <span className="ml-auto shrink-0 text-xs font-medium text-ink-muted">
              Step {currentIndex + 1} of {steps.length}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-line-strong"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={complete ? steps.length : currentIndex + 1}
            aria-label={
              complete
                ? 'All steps complete'
                : `Step ${currentIndex + 1} of ${steps.length}: ${currentStep.label}`
            }
          >
            {/* brand-600 rather than the brand yellow — a 6px yellow bar inside a
                pale track is invisible at 1.07:1 against the page it sits on. */}
            <span
              className="block h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(progressPercent, 6)}%` }}
            />
          </div>
        </div>

        {/* Back sits under the tracker, centred, so it reads as "the way back
            along this journey" rather than as a control competing with the
            progress it belongs to. It renders nothing on the first step and on
            the terminal screens, and the wrapper collapses with it — no empty
            row, no shifted tracker. */}
        <div className="mt-5 flex justify-center empty:hidden">
          <BackLink />
        </div>
      </div>
    </div>
  )
}
