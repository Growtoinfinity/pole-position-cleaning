import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type StepKey = 'contact' | 'propertyType' | 'details' | 'quote' | 'book'

const steps: { key: StepKey; label: string }[] = [
  { key: 'contact', label: 'Your Details' },
  { key: 'propertyType', label: 'Property Type' },
  { key: 'details', label: 'Property Details' },
  { key: 'quote', label: 'Quote' },
  { key: 'book', label: 'Book' },
]

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
    <div className="wwe-stepbar-in w-full border-b border-line bg-surface">
      <div className="wwe-page-column py-3">
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
                      isDone && 'border-brand-400 bg-brand-400 text-on-brand',
                      isCurrent && 'border-brand-400 bg-card text-brand-300 ring-4 ring-brand-400/25',
                      !isDone && !isCurrent && 'border-line-strong bg-card text-ink-muted',
                    )}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : idx + 1}
                  </span>
                  <span
                    className={cn(
                      'whitespace-nowrap text-xs font-semibold transition-colors',
                      isDone && 'text-brand-300',
                      isCurrent && 'text-ink',
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
                      isDone ? 'bg-brand-400' : 'bg-line',
                    )}
                  />
                )}
              </li>
            )
          })}
        </ol>

        {/* ---- Mobile: the step in words, plus a progress bar ---- */}
        <div className="md:hidden">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-ink">
              {currentStep.label}
            </span>
            <span className="ml-auto shrink-0 text-xs font-medium text-ink-muted">
              Step {currentIndex + 1} of {steps.length}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-line-strong"
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
            <span
              className="block h-full rounded-full bg-brand-400 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(progressPercent, 6)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
