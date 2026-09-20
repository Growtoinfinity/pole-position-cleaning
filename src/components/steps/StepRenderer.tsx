import { useMemo } from 'react'
import { useFormStore } from '@/stores/formStore'
import { useCostingStore } from '@/stores/costingStore'
import { useResponsive } from '@/hooks/useResponsive'
import { completeSubmission, syncQuote, syncStep } from '@/lib/submission'
import { type CalcInput, type WindowPlan } from '@/lib/costing-calc'
import { MANUAL_QUOTE_BEDROOMS, hasSelectableRow, pricingUnavailable } from '@/lib/pricing'
import type { Addons } from '@/stores/costingStore'
import type { QuoteStepValues } from '@/steps/quote/QuoteStep'

// Step components
import ContactStep from '@/steps/step-0/ContactStep'
import ResidentialTypeStep from '@/steps/step-2-residential/ResidentialTypeStep'
import LargeUnusualAddressStep from '@/steps/step-2-residential/LargeUnusualAddressStep'
import LargeUnusualThankYou from '@/steps/step-2-residential/LargeUnusualThankYou'
import QuoteUnavailableStep from '@/steps/quote/QuoteUnavailableStep'
import BungalowTypeStep from '@/steps/step-2-residential/bungalow/BungalowTypeStep'
import TownhouseTypeStep from '@/steps/step-2-residential/townhouse/TownhouseTypeStep'
import CommonPropertyDetailsStep from '@/steps/step-2-residential/CommonPropertyDetailsStep'
import QuoteStep from '@/steps/quote/QuoteStep'
import QuoteStepMobile from '@/steps/quote/QuoteStepMobile'
import BusinessDetailsStep from '@/steps/step-3-commercial/BusinessDetailsStep'
import CommercialThankYou from '@/steps/step-3-commercial/CommercialThankYou'
import BookStep from '@/steps/book/BookStep'
import ThankYouStep from '@/steps/thank-you/ThankYouStep'

// One mapping, shared with App and with /api/prefill — see src/lib/property-kind.ts
import { houseKindFor } from '@/lib/property-kind'
export { houseKindFor }

export default function StepRenderer() {
  const { isMobile } = useResponsive()
  const {
    step,
    contactData, setContactData,
    setPropertyType,
    businessDetails, setBusinessDetails,
    residentialType, setResidentialType,
    largeUnusualAddress, setLargeUnusualAddress,
    bungalowKind, setBungalowKind,
    townhouseKind, setTownhouseKind,
    propertyDetails, setPropertyDetails,
    residentialFrequency, setResidentialFrequency,
    residentialQuoteResult, setResidentialQuoteResult,
    bookingDetails, setBookingDetails,
    setShowBungalowInline,
    setShowTownhouseInline,
    setStep, getPropertyTypeName, reset
  } = useFormStore()

  const {
    setPropertyKind, setBedrooms, setHasExtension, setHasConservatory,
    setHasLoftConversion, setHasVelux, setHasOutdoorAccess,
    calculateResult, loadPriceTable,
    reset: resetCosting,
  } = useCostingStore()

  const priceStatus = useCostingStore((s) => s.priceStatus)
  const priceTable = useCostingStore((s) => s.priceTable)

  // Memoized calculation function for quote step
  const memoizedCalculateResult = useMemo(() => {
    return (plan: WindowPlan | null, addons: Addons) => {
      // We directly use the calculateResult function from the costingStore
      // The property details are already set in the store
      return calculateResult(plan, addons)
    }
  }, [calculateResult])

  /**
   * The exact input the server re-prices for the authoritative quote.
   *
   * Built by the store's own builder rather than assembled here, so the server is asked
   * about precisely the property the customer was just quoted on — and so the rule that
   * a flat is asked neither uplift lives in exactly one place.
   *
   * A null plan is passed through as null. It used to be `?? 4`, which priced an
   * add-ons-only customer as though they had taken a 4-weekly round: the stored quote
   * came back with that round's basePrice, total and selectedLabel, and the resume link
   * showed it. `selectedPlan` is nullable precisely so no caller has to invent one.
   */
  const buildCalcInput = (vals: QuoteStepValues): CalcInput | null =>
    useCostingStore.getState().currentCalcInput(vals.plan, vals.addons)

  /**
   * S3. The client result is provisional — it exists so the user isn't left staring at a
   * spinner. The server's `quote` action is what gets written to Supabase and pushed to
   * GHL; we only send the frequency webhook from here if the server couldn't.
   */
  const handleQuoteSubmit = (vals: QuoteStepValues) => {
    setResidentialFrequency(vals)
    // Null stays null — an add-ons-only selection has no plan row, and inventing one
    // puts a price for an unchosen round into the quote the customer is shown.
    const provisional = memoizedCalculateResult(vals.plan, vals.addons)
    setResidentialQuoteResult(provisional)

    const frequencyPayload = {
      residentialFrequency: vals,
      residentialQuoteResult: provisional,
      propertyTypeName: getPropertyTypeName(),
      propertyDetails,
      residentialType,
      bungalowKind,
      townhouseKind,
    }

    const calcInput = buildCalcInput(vals)

    if (calcInput) {
      syncQuote({
        calcInput,
        formData: frequencyPayload,
        contactData,
        arrivedAtStep: 'residentialBook',
      })
        .then(({ quote }) => {
          // The server's figure is authoritative — replace the provisional one
          if (quote) setResidentialQuoteResult(quote)
        })
        .catch((error) => console.error('Server quote failed:', error))
    } else {
      console.error('Cannot request a server quote: costing state is incomplete')
    }

    setStep('residentialBook')
  }

  // Render the appropriate step based on the current step state
  switch (step) {
    case 'contact':
      return (
        <ContactStep
          initialValues={contactData ?? undefined}
          onSubmit={async (values) => {
            setContactData(values)
            setPropertyType(values.propertyType)

            const nextStep = values.propertyType === 'commercial'
              ? 'commercialDetails'
              : 'residentialType'

            syncStep(nextStep).catch((error) =>
              console.error('Error syncing contact step:', error))

            setStep(nextStep)
          }}
        />
      )

    case 'residentialType':
      return (
        <>
          <ResidentialTypeStep
            initialValue={residentialType}
            onSelect={(v) => {
              // formStore drops the previous property's answers; the costing store has
              // its own mirror of them (bedrooms, uplifts, addons, price table)
              // that has to go with them, or the quote step re-prices the old property.
              if (v !== residentialType) resetCosting()
              setResidentialType(v)

              setShowBungalowInline(false)
              setShowTownhouseInline(false)

              const nextStep =
                v === 'large_unusual' ? 'residentialLargePropertyDetails'
                : v === 'bungalow' ? 'bungalowTypeMobile'
                : v === 'townhouse' ? 'townhouseTypeMobile'
                // For direct house types (semi_detached, terraced, detached) and flats,
                // which this price sheet bands on bedrooms exactly as it bands a house
                : 'propertyDetails'

              syncStep(nextStep).catch((error) =>
                console.error('Error syncing residential type step:', error))

              setStep(nextStep)
            }}
          />
        </>
      )

    case 'residentialLargePropertyDetails':
      return (
        <CommonPropertyDetailsStep
          initialValues={propertyDetails ?? undefined}
          onSubmit={(vals) => {
            setPropertyDetails(vals)

            // The house questions are all required, so these fallbacks are unreachable.
            // They exist because the values are optional at the type level — the same
            // shape serves a flat, which answers only the bedroom count.
            setBedrooms(vals.bedrooms ?? 0)
            setHasExtension(vals.hasExtension ?? 'no')
            setHasConservatory(vals.hasConservatory ?? 'no')
            setHasLoftConversion(vals.hasLoftConversion ?? 'no')
            setHasVelux(vals.hasVelux ?? 'no')
            if (vals.hasOutdoorAccess) setHasOutdoorAccess(vals.hasOutdoorAccess)

            syncStep('residentialLargeAddress').catch((error) =>
              console.error('Error syncing large unusual property details:', error))

            setStep('residentialLargeAddress')
          }}
          propertyType="Large/Unusual Property"
          // Large/Unusual has no priced kind — but it is certainly not a flat, so it
          // gets the house questions.
          propertyKind={null}
          // One chip further than the standard branch: nothing here is being priced from
          // a table, so "5+" would merge two answers a human quoting the job has to tell
          // apart. See `plusFrom`.
          plusFrom={6}
        />
      )

    case 'residentialLargeAddress':
      return (
        <LargeUnusualAddressStep
          initialValues={largeUnusualAddress ?? undefined}
          onSubmit={(vals) => {
            setLargeUnusualAddress(vals)

            // Terminal step for this branch — the enquiry is with the team now
            completeSubmission({
              pipelineStage: 'large_unusual_enquiry',
              arrivedAtStep: 'residentialThanks',
            }).catch((error) => console.error('Error completing large unusual submission:', error))

            setStep('residentialThanks')
          }}
        />
      )

    case 'residentialThanks':
      return <LargeUnusualThankYou email={contactData?.email} phone={contactData?.phone} />

    case 'bungalowTypeMobile':
      return (
        <BungalowTypeStep
          initialValue={bungalowKind}
          onSelect={(k) => {
            setBungalowKind(k)

            syncStep('propertyDetails').catch((error) =>
              console.error('Error syncing bungalow type step:', error))

            setStep('propertyDetails')
          }}
        />
      )

    case 'townhouseTypeMobile':
      return (
        <TownhouseTypeStep
          initialValue={townhouseKind}
          onSelect={(k) => {
            setTownhouseKind(k)

            syncStep('propertyDetails').catch((error) =>
              console.error('Error syncing townhouse type step:', error))

            setStep('propertyDetails')
          }}
        />
      )

    case 'propertyDetails': {
      if (!residentialType) return null

      const kind = houseKindFor(residentialType, bungalowKind, townhouseKind)

      return (
        <CommonPropertyDetailsStep
          initialValues={propertyDetails ?? undefined}
          onSubmit={(vals) => {
            /**
             * "5+" bedrooms is a hand-off, not a property type.
             *
             * The chip means "five or more", and this business does not quote those from
             * the table — so the answer re-classifies the property as large/unusual
             * whatever the customer picked two steps ago, and the lead leaves down that
             * branch. The price table is never fetched.
             *
             * `setResidentialType` FIRST, and the order is load-bearing: changing the
             * type clears `propertyDetails`, `bungalowKind` and `townhouseKind`. Clearing
             * the sub-kinds is exactly right — "Large/Unusual, detached bungalow" is a
             * contradiction the CRM would have to store — but doing it AFTER
             * `setPropertyDetails` would wipe the answers this customer just gave, and
             * they are the only survey the team quoting this job will have.
             *
             * The questions are the same on both branches (one component asks them), so
             * the customer goes straight to the address step rather than being asked the
             * lot again under a different heading.
             */
            if ((vals.bedrooms ?? 0) >= MANUAL_QUOTE_BEDROOMS) {
              setResidentialType('large_unusual')
              setPropertyDetails(vals)

              syncStep('residentialLargeAddress').catch((error) =>
                console.error('Error syncing large unusual hand-off:', error))

              setStep('residentialLargeAddress')
              return
            }

            setPropertyDetails(vals)

            setPropertyKind(kind)

            // Every property bands on bedrooms, a flat included, so the count is
            // mirrored unconditionally. A flat is still asked neither uplift, so
            // mirroring those for one would put answers into the pricing call that the
            // customer was never shown a question for.
            setBedrooms(vals.bedrooms ?? 0)
            // The house questions are all required, so these fallbacks are
            // unreachable — they exist because the values are optional at the type
            // level, in a shape shared with a flat, which answers neither.
            setHasExtension(vals.hasExtension ?? 'no')
            setHasConservatory(vals.hasConservatory ?? 'no')
            setHasLoftConversion(vals.hasLoftConversion ?? 'no')
            setHasVelux(vals.hasVelux ?? 'no')
            if (vals.hasOutdoorAccess) setHasOutdoorAccess(vals.hasOutdoorAccess)

            syncStep('residentialFrequency').catch((error) =>
              console.error('Error syncing property details step:', error))

            // The one pricing fetch for this property. It has to happen here rather than
            // inside the quote step, because every input a row reads must be answered
            // before that row can be quoted — for a house that means all four questions,
            // including gutters and fascia, whose prices do not actually vary with
            // extension or conservatory. Ask earlier and every row comes back
            // "not priceable".
            loadPriceTable().catch((error) =>
              console.error('Error loading price table:', error))

            setStep('residentialFrequency')
          }}
          propertyType={getPropertyTypeName()}
          propertyKind={kind}
        />
      )
    }

    // `residentialQuote` is a legal Step with a `step_reached` of its own, and it named
    // the screen a caller would reasonably expect to land on — but nothing rendered it, so
    // arriving there produced a page with a progress bar and no content. `/api/prefill`
    // fell into exactly that on its first run. The quote and the frequency are one screen,
    // so both ids resolve to it rather than one of them being a blank page.
    case 'residentialQuote':
    case 'residentialFrequency': {
      if (!propertyDetails) return null

      // Both quote screens gate their add-on rows on the property kind, so it has to
      // reach them. Null is Large/Unusual, which never routes through here — it leaves
      // by way of the address step — so there is nothing to render for it.
      const quoteKind = houseKindFor(residentialType, bungalowKind, townhouseKind)
      if (!quoteKind) return null

      // A flat is never asked the conservatory question, so it must not carry an answer
      // into the quote — a 'yes' left over from a house picked earlier would otherwise
      // offer a roof clean for a property that has no roof to clean. Read once, so the
      // rows the screen renders and the rows the routing below counts are the same rows.
      const quoteHasConservatory =
        residentialType === 'flat' ? 'no' as const : propertyDetails.hasConservatory

      // The API says this property is outside what it can price — over five bedrooms, or
      // a type it cannot classify. That is a custom quote, never a clamped number: the
      // price tables clamp above their top band, so an oversized property comes back with
      // a real-looking price that is simply the top-band rate.
      if (priceTable?.oversized) {
        return <LargeUnusualThankYou email={contactData?.email} phone={contactData?.phone} />
      }

      // Nothing on the page can be picked. Two very different reasons, and they must not
      // share a screen.
      //
      // Tested only once the fetch has settled: while it is in flight every row is
      // unselectable by definition, and checking then would bounce every customer out on
      // arrival rather than showing them the prices that are seconds away.
      const pricesSettled = priceStatus === 'api' || priceStatus === 'unavailable'
      const quoteProperty = {
        kind: quoteKind,
        hasConservatory: quoteHasConservatory === 'yes',
      }
      const nothingToPick = pricesSettled && !hasSelectableRow(priceTable, quoteProperty)

      // Reason one: we never got an answer — no key, a timeout, a tripped circuit. The
      // fault is ours and says nothing about the property, so it gets its own screen.
      // Routing this to the large/unusual thank-you told the owner of an ordinary
      // semi-detached that their home was "large or unusual" because a deployment was
      // missing its API key.
      if (nothingToPick && pricingUnavailable(priceTable, quoteProperty)) {
        return <QuoteUnavailableStep />
      }

      // Reason two: the API answered, and the answer is that it cannot price this
      // property — every offered row came back not_priceable or not_applicable. That is
      // the same promise the oversized path makes: no number here, a human will follow up.
      if (nothingToPick) {
        return <LargeUnusualThankYou email={contactData?.email} phone={contactData?.phone} />
      }

      const quoteProps = {
        initialValues: residentialFrequency ?? undefined,
        calculatedResult: memoizedCalculateResult,
        propertyKind: quoteKind,
        hasConservatory: quoteHasConservatory,
        onSubmit: handleQuoteSubmit,
        priceStatus,
        priceTable,
      }

      return isMobile ? <QuoteStepMobile {...quoteProps} /> : <QuoteStep {...quoteProps} />
    }

    case 'commercialDetails':
      return (
        <BusinessDetailsStep
          initialValues={businessDetails ?? undefined}
          onSubmit={(vals) => {
            setBusinessDetails(vals)

            // Terminal step for this branch — the enquiry is with the team now
            completeSubmission({
              pipelineStage: 'commercial_enquiry',
              arrivedAtStep: 'commercialThanks',
            }).catch((error) => console.error('Error completing commercial submission:', error))

            setStep('commercialThanks')
          }}
        />
      )

    case 'commercialThanks':
      return <CommercialThankYou email={contactData?.email} phone={contactData?.phone} />

    case 'residentialBook':
      return residentialFrequency ? (
        <BookStep
          initialValues={bookingDetails ?? undefined}
          onSubmit={(vals) => {
            setBookingDetails(vals)

            // S5 — close the submission out; the server pushes the final state to GHL
            completeSubmission({
              pipelineStage: 'booked',
              arrivedAtStep: 'thankYou',
            }).catch(error => console.error('Error completing submission:', error))

            // Navigate to the thank-you page without waiting on the backend
            setStep('thankYou')
          }}
        />
      ) : null

    case 'thankYou': {
      // Same formula used for quoteDetails.totalPrice when the booking was submitted
      // Every extra now carries a real number or is not listed at all — there is no
      // "priced on the visit" line to exclude from the sum, because nothing in this
      // catalogue is quoted per unit on the day.
      // `total` is already correct for both cases: with no plan chosen, `buildCalcResult`
      // sets basePrice to 0, so total IS the extras sum. The old ternary re-summed the
      // extras by hand precisely because basePrice used to carry an invented 4-weekly price.
      const firstCleanPrice = residentialQuoteResult?.total || 0

      return (
        <ThankYouStep
          firstCleanPrice={firstCleanPrice}
          email={contactData?.email}
          phone={contactData?.phone}
          onStartNewQuote={() => {
            // Clears the token too, so the next quote starts its own submission
            reset()
          }}
        />
      )
    }

    default:
      return null
  }
}
