import { useEffect } from 'react'
import BrandLogo from '@/components/ui/BrandLogo'
import { pushLeadFormCompleteEvent } from '@/lib/analytics'

export default function CommercialThankYou({
  email,
  phone
}: {
  email?: string
  phone?: string
}) {
  useEffect(() => {
    pushLeadFormCompleteEvent(0, email, phone)
  }, [email, phone])

  return (
    <div className="w-full py-4 md:py-8">
      <div className="gm-card mx-auto max-w-2xl p-6 text-center md:p-8">
        <div className="flex w-full justify-center">
          <BrandLogo className="h-12 md:h-14" />
        </div>

        <h2 className="mt-8 text-xl md:text-2xl font-semibold text-brand-800">
          Thanks for requesting a quote for your commercial premises.
        </h2>

        <div className="mt-5 space-y-4 text-base text-ink-muted md:text-lg">
          <p>
            A member of our team will be in touch very soon to arrange a suitable time & day to visit.
          </p>
          <p>
            We’ll get in touch using the details you've already sent us.
          </p>
        </div>
      </div>

      {/* Navigation buttons removed per requirements */}
    </div>
  )
}
