import { ArrowLeft, Check } from 'lucide-react'
import Button from '@/components/ui/button'
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
  onBack,
  complete = false,
}: {
  current: StepKey
  onBack?: () => void
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
  const showBack = Boolean(onBack) && currentIndex > 0

  return (
    <div className="gm-stepbar-in w-full border-b border-line bg-surface">
      {/*
        One row, not two. Back used to sit on its own line, which reserved 44px of
        empty space on every step that cannot go back — including the first one the
        customer sees. It is absolutely positioned on desktop so the tracker stays
        optically centred, and inline on mobile where there is no room to spare.
      */}
      <div className="gm-page-column relative py-3">
        {showBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="absolute left-4 top-1/2 hidden -translate-y-1/2 px-2 md:left-7 md:inline-flex"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </Button>
        )}

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
                      isDone && 'border-brand-600 bg-brand-600 text-white',
                      isCurrent && 'border-brand-600 bg-white text-brand-700 ring-4 ring-brand-600/15',
                      !isDone && !isCurrent && 'border-line-strong bg-white text-ink-muted',
                    )}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : idx + 1}
                  </span>
                  <span
                    className={cn(
                      'whitespace-nowrap text-xs font-semibold transition-colors',
                      isDone && 'text-brand-700',
                      isCurrent && 'text-brand-800',
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
                      isDone ? 'bg-brand-600' : 'bg-line',
                    )}
                  />
                )}
              </li>
            )
          })}
        </ol>

        {/* ---- Mobile: Back, the step in words, and a progress bar ---- */}
        <div className="md:hidden">
          <div className="flex items-center gap-1.5">
            {/*
              Back gets a real 44px tap target, pulled back in with negative margins
              so it overhangs the bar's padding instead of making the row taller.
            */}
            {showBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                aria-label="Back"
                className="-my-1.5 -ml-3 h-11 w-11 shrink-0 px-0"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </Button>
            )}
            <span className="truncate text-sm font-semibold text-brand-800">
              {currentStep.label}
            </span>
            <span className="ml-auto shrink-0 text-xs font-medium text-ink-muted">
              Step {currentIndex + 1} of {steps.length}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white ring-1 ring-inset ring-line-strong"
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
              className="block h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(progressPercent, 6)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
