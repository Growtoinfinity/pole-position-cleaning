import { useFormStore } from '@/stores/formStore'
import BrandLogo from '@/components/ui/BrandLogo'

export default function QuoteHeader() {
  const step = useFormStore((state) => state.step)

  // The pitch only needs making once. Every pixel of header repeats on all eleven
  // steps, so after the first question it collapses to the logo alone.
  const isFirstStep = step === 'contact'

  return (
    <header className="w-full border-b border-line bg-background">
      <div
        className={
          'wwe-page-column flex flex-col items-center ' +
          (isFirstStep ? 'py-4 md:py-5' : 'py-2.5 md:py-3')
        }
      >
        {/*
          The mark is a stacked lockup (~1.4:1), not a banner, so it is sized by
          height at roughly 2.5x what a wide lockup would take to give the
          wordmark the same reading width. The collapsed size still has to keep
          "We Wash Everything" legible, which is why it does not go below h-14.
        */}
        <BrandLogo className={isFirstStep ? 'h-24 md:h-28' : 'h-14 md:h-16'} />

        {isFirstStep && (
          <h1
            className="mt-3 text-center font-bold text-ink"
            style={{ fontSize: 'clamp(1.25rem, 4vw, 1.625rem)' }}
          >
            Get An Instant Online Quote
          </h1>
        )}
      </div>
    </header>
  )
}
