import BrandLogo from '@/components/ui/BrandLogo'
import { BRAND } from '@/lib/brand'

/**
 * Shown when we could not reach pricing at all — no key, a timeout, a tripped circuit.
 *
 * Deliberately NOT the "large or unusual home" screen. That one is a real statement about
 * the property, and showing it after a system failure tells the owner of an ordinary
 * semi-detached something false about their house. This says what is actually true: the
 * fault is ours, and a person will follow up.
 *
 * The lead is already captured by this point — the submission row and the CRM contact are
 * written on step 1 — so this is a message, not a lost enquiry.
 */
export default function QuoteUnavailableStep() {
  return (
    <div className="w-full py-4 md:py-8">
      <div className="wwe-card mx-auto max-w-2xl p-6 text-center md:p-8">
        <div className="flex w-full justify-center">
          <BrandLogo className="h-12 md:h-14" />
        </div>

        <h2 className="mt-8 text-xl font-semibold text-ink md:text-2xl">
          We can't show your price online right now
        </h2>

        <p className="mt-5 text-base text-ink-muted">
          Something on our side is stopping us pricing your clean at this moment — it is
          nothing to do with your property.
        </p>

        <p className="mt-4 text-base text-ink-muted">
          We have your details, so there is nothing more for you to do. A member of the{' '}
          {BRAND.name} team will be in touch shortly with your quote.
        </p>
      </div>
    </div>
  )
}
