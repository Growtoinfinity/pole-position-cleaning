import { TriangleAlert } from 'lucide-react'
import Button from '@/components/ui/button'

export default function NoCoverageStep({
  onTryDifferentPostcode,
  onStartNewQuote
}: {
  onTryDifferentPostcode: () => void
  onStartNewQuote: () => void
}) {
  return (
    <div className="w-full">
      <div className="gm-card mx-auto grid max-w-2xl gap-8 p-6 text-center md:p-8">
        <div className="grid gap-5">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-warn-soft">
            {/* text-warn, not a raw amber — same token as the warn-soft fill behind it */}
            <TriangleAlert className="h-10 w-10 text-warn" aria-hidden />
          </div>

          {/* h2, not h1 — QuoteHeader owns the page's only h1 and is never
              unmounted. The visual weight comes from the badge above. */}
          <h2 className="text-xl md:text-2xl font-semibold text-brand-800">
            We Don't Cover Your Area Right Now
          </h2>

          <p className="text-lg text-ink">
            Unfortunately, we don't currently provide services in your postcode area.
          </p>
        </div>

        <div className="grid gap-5">
          <p className="text-sm text-ink-muted">
            We're constantly expanding our service areas. Check back with us in the future!
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Button
              onClick={onTryDifferentPostcode}
              variant="brand"
              className="w-full"
            >
              Try Different Postcode
            </Button>

            <Button
              onClick={onStartNewQuote}
              variant="outline"
              className="w-full"
            >
              Start New Quote
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
