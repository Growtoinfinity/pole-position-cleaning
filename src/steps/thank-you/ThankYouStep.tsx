import { useEffect } from 'react'
import { Check } from 'lucide-react'
import Button from '@/components/ui/button'
import { BRAND } from '@/lib/brand'
import { pushLeadFormCompleteEvent } from '@/lib/analytics'

export default function ThankYouStep({
  onStartNewQuote,
  firstCleanPrice,
  email,
  phone
}: {
  onStartNewQuote: () => void
  firstCleanPrice: number
  email?: string
  phone?: string
}) {
  useEffect(() => {
    pushLeadFormCompleteEvent(firstCleanPrice, email, phone)
  }, [firstCleanPrice, email, phone])

  return (
    <div className="w-full">
      <div className="pp-card mx-auto grid max-w-2xl gap-8 p-6 text-center md:p-8">
        <div className="grid gap-5">
          {/* A solid brand disc with a white tick. brand-700 is 7.18:1 against the
              white card, so the disc draws its own boundary, and white ink on it is
              that same 7.18 — white is only ever legal on brand-700 or darker. */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-700">
            <Check className="h-10 w-10 text-white" strokeWidth={2.5} aria-hidden />
          </div>

          {/* h2, not h1 — QuoteHeader owns the page's only h1 and is never
              unmounted. The visual weight comes from the badge above. */}
          <h2 className="text-xl md:text-2xl font-semibold">
            Thank You!
          </h2>

          <p className="text-lg text-ink">
            Your booking has been successfully submitted.
          </p>
        </div>

        <div className="grid gap-5">
          <p className="text-sm text-ink-muted">
            If you have any questions, please don't hesitate to contact us.
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Button
              onClick={onStartNewQuote}
              variant="brand"
              className="w-full"
            >
              Start New Quote
            </Button>

            <Button
              onClick={() => window.open(BRAND.homepageUrl, '_blank')}
              variant="outline"
              className="w-full"
            >
              Go to Homepage
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
