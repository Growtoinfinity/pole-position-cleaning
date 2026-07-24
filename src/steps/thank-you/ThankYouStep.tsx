import { useEffect } from 'react'
import Button from '@/components/ui/button'
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
      <div className="grid gap-8 text-center">
        <div className="grid gap-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-[#BF8639]">
            Thank You!
          </h1>

          <p className="text-white/90 text-lg">
            Your booking has been successfully submitted.
          </p>
        </div>


        <div className="grid gap-4">
          <p className="text-white/70 text-sm">
            If you have any questions, please don't hesitate to contact us.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button
              onClick={onStartNewQuote}
              className="w-full"
            >
              Start New Quote
            </Button>

            <Button
              onClick={() => window.open('https://www.kingswindowcleaning.co.uk/', '_blank')}
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
