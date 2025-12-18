import Button from '@/components/ui/button'

export default function NoCoverageStep({
  onTryDifferentPostcode,
  onStartNewQuote
}: {
  onTryDifferentPostcode: () => void
  onStartNewQuote: () => void
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-6">
      <div className="grid gap-8 text-center">
        <div className="grid gap-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-orange-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-[#BF8639]">
            We Don't Cover Your Area Right Now
          </h1>

          <p className="text-white/90 text-lg">
            Unfortunately, we don't currently provide services in your postcode area.
          </p>
        </div>


        <div className="grid gap-4">
          <p className="text-white/70 text-sm">
            We're constantly expanding our service areas. Check back with us in the future!
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button
              onClick={onTryDifferentPostcode}
              className="w-full"
            >
              Try Different Postcode
            </Button>

            <Button
              onClick={onStartNewQuote}
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
