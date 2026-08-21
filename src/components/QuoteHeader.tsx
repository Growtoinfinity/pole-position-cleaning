import { useFormStore } from '@/stores/formStore'
import BrandLogo from '@/components/ui/BrandLogo'

export default function QuoteHeader() {
  const step = useFormStore((state) => state.step)

  // The pitch only needs making once. Every pixel of header repeats on all eleven
  // steps, so after the first question it collapses to the logo alone.
  const isFirstStep = step === 'contact'

  return (
    <header className="w-full border-b border-line bg-white">
      <div
        className={
          'gm-page-column flex flex-col items-center ' +
          (isFirstStep ? 'py-4 md:py-5' : 'py-2.5 md:py-3')
        }
      >
        <BrandLogo className={isFirstStep ? 'h-10 md:h-12' : 'h-8 md:h-9'} />

        {isFirstStep && (
          <h1
            className="mt-3 text-center font-bold text-brand-800"
            style={{ fontSize: 'clamp(1.25rem, 4vw, 1.625rem)' }}
          >
            Get An Instant Online Quote
          </h1>
        )}
      </div>
    </header>
  )
}
