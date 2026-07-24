import { useEffect } from 'react'
import logo from '@/assets/logo.png'
import { pushLeadFormCompleteEvent } from '@/lib/analytics'

export default function LargeUnusualThankYou() {
  useEffect(() => {
    pushLeadFormCompleteEvent(0)
  }, [])

  return (
    <div className="w-full text-center">
      <div className="flex w-full justify-center">
        <img src={logo} alt="Kings Window Cleaning" className="h-28 w-auto md:h-36" />
      </div>

      <div className="mt-10 space-y-6">
        <h2 className="text-2xl font-bold text-[#BF8639] md:text-3xl">
          Thanks for requesting a quote for your large or unusual home.
        </h2>
        <p className="mx-auto max-w-3xl text-base text-white/90 md:text-lg">
          A member of our team will be in touch very soon to arrange a suitable time & day to visit.
        </p>
        <p className="mx-auto max-w-3xl text-base text-white/90 md:text-lg">
          We’ll get in touch using the details you've already sent us.
        </p>
      </div>
      {/* Navigation buttons removed per requirements */}
    </div>
  )
}


