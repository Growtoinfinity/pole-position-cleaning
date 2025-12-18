import Button from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

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
  onBack
}: {
  current: StepKey
  onBack?: () => void
}) {
  const currentIndex = steps.findIndex((s) => s.key === current)

  return (
    <div className="w-full py-4 mb-6 border-b border-white/20 overflow-x-hidden">
      <div className="max-w-[1280px] mx-auto px-6 flex items-center">
        {/* Back button with text - disabled on first step */}

        {/* Steps */}
        <ol className="flex items-center justify-center flex-1 min-w-0">
          {steps.map((step, idx) => {
            const isDone = idx < currentIndex
            const isCurrent = idx === currentIndex
            const isLast = idx === steps.length - 1
            // Only highlight connector if the step is done (before current)
            const isActiveConnector = idx < currentIndex

            return (
              <li
                key={step.key}
                className="flex items-center min-w-0"
              >
                {/* Step Number and Label */}
                <div className="flex items-center gap-1 md:gap-2 min-w-0">
                  <div
                    className={
                      'flex aspect-square h-6 w-6 items-center justify-center rounded-full border text-xs font-bold leading-none transition-colors flex-shrink-0 ' +
                      (isDone
                        ? 'border-[#BF8639] bg-[#BF8639] text-[#013252]'
                        : isCurrent
                          ? 'border-[#BF8639] text-[#BF8639]'
                          : 'border-white/40 text-white/60')
                    }
                    style={{ width: '24px', height: '24px' }} // Force exact dimensions
                  >
                    {isDone ? '✓' : idx + 1}
                  </div>
                  <span
                    className={
                      'hidden md:inline text-xs font-medium transition-colors whitespace-nowrap ' +
                      (isDone || isCurrent ? 'text-[#BF8639]' : 'text-white/60')
                    }
                  >
                    {step.label}
                  </span>
                </div>

                {/* Connector Line - highlight if previous step */}
                {!isLast && (
                  <div
                    className={`mx-2 md:mx-3 h-px w-6 md:w-16 transition-colors flex-shrink-0 ${isActiveConnector ? 'bg-[#BF8639]' : 'bg-white/20'
                      }`}
                  />
                )}
              </li>
            )
          })}
        </ol>
      </div>
      <div className="flex items-center justify-center mt-4 mb-2">
        {onBack && (
          <Button
            variant="brand"
            size="sm"
            onClick={onBack}
            aria-label="Previous step"
            className="flex items-center gap-1"
            disabled={currentIndex === 0}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs">Previous step</span>
          </Button>
        )}
      </div>

    </div>
  )
}