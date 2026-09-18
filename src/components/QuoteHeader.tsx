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
          'pp-page-column flex flex-col items-center ' +
          (isFirstStep ? 'py-4 md:py-5' : 'py-2.5 md:py-3')
        }
      >
        {/*
          Sized by WIDTH, not height, and the SAME width on every step. The mark
          is a stacked oval lockup (500x295, ~1.7:1) whose wordmark runs the full
          width of the artwork, so width is what decides whether it can be read —
          height-sizing a lockup this shape starves it. 170px puts the mark at
          100px tall — small enough not to dominate the page, and still roughly
          80% wider than the h-14 the mark started at.
        */}
        <BrandLogo className="w-[170px]" />

        {isFirstStep && (
          <h1
            className="mt-3 text-center font-bold text-ink-strong"
            style={{ fontSize: 'clamp(1.25rem, 4vw, 1.625rem)' }}
          >
            Get An Instant Online Quote
          </h1>
        )}
      </div>
    </header>
  )
}
