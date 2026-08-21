import { useMemo } from 'react'
import { useFormStore } from '@/stores/formStore'
import { useCostingStore } from '@/stores/costingStore'
import { useResponsive } from '@/hooks/useResponsive'
import { completeSubmission, syncQuote, syncStep } from '@/lib/submission'
import { type CalcInput, type Frequency, type HouseKind } from '@/lib/costing-calc'
import { hasSelectableRow } from '@/lib/pricing'
import type { Addons } from '@/stores/costingStore'
import type { QuoteStepValues } from '@/steps/quote/QuoteStep'
import type { ResidentialType } from '@/steps/step-2-residential/ResidentialTypeStep'
import type { BungalowKind } from '@/steps/step-2-residential/bungalow/BungalowTypeStep'

// Step components
import ContactStep from '@/steps/step-0/ContactStep'
import ResidentialTypeStep from '@/steps/step-2-residential/ResidentialTypeStep'
import LargeUnusualAddressStep from '@/steps/step-2-residential/LargeUnusualAddressStep'
import LargeUnusualThankYou from '@/steps/step-2-residential/LargeUnusualThankYou'
import BungalowTypeStep from '@/steps/step-2-residential/bungalow/BungalowTypeStep'
import TownhouseTypeStep from '@/steps/step-2-residential/townhouse/TownhouseTypeStep'
import CommonPropertyDetailsStep from '@/steps/step-2-residential/CommonPropertyDetailsStep'
import QuoteStep from '@/steps/quote/QuoteStep'
import QuoteStepMobile from '@/steps/quote/QuoteStepMobile'
import BusinessDetailsStep from '@/steps/step-3-commercial/BusinessDetailsStep'
import CommercialThankYou from '@/steps/step-3-commercial/CommercialThankYou'
import BookStep from '@/steps/book/BookStep'
import ThankYouStep from '@/steps/thank-you/ThankYouStep'

/**
 * The residential type as the price sheet sees it — the one place that mapping lives.
 *
 * Null for Large/Unusual, which has no priced kind at all. A bungalow is priced as its
 * base type, so it reports the sub-type the customer picked rather than "bungalow".
 */
export function houseKindFor(
  type: ResidentialType | null,
  bungalowKind: BungalowKind | null,
): HouseKind | null {
  if (type === 'bungalow') return bungalowKind
  if (type === 'townhouse') return 'townhouse'
  if (type === 'flat') return 'flat'
  if (type === 'semi_detached' || type === 'terraced' || type === 'detached') return type
  return null
}

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
    setPropertyKind, setBedrooms, setFloor, setHasExtension, setHasConservatory,
    setConservatoryRoofPricing,
    calculateResult, loadPriceTable,
    reset: resetCosting,
  } = useCostingStore()

  const priceStatus = useCostingStore((s) => s.priceStatus)
  const priceTable = useCostingStore((s) => s.priceTable)

  // Memoized calculation function for quote step
  const memoizedCalculateResult = useMemo(() => {
    return (frequency: Frequency, addons: Addons) => {
      // We directly use the calculateResult function from the costingStore
      // The property details are already set in the store
      return calculateResult(frequency, addons)
    }
  }, [calculateResult])

  /**
   * The exact input the server re-prices for the authoritative quote.
   *
   * Built by the store's own builder rather than assembled here, so the server is asked
   * about precisely the property the customer was just quoted on — and so the flat rule
   * (floor, never bedrooms) lives in exactly one place.
   */
  const buildCalcInput = (vals: QuoteStepValues): CalcInput | null =>
    useCostingStore.getState().currentCalcInput(vals.frequency ?? 8, vals.addons)

  /**
   * S3. The client result is provisional — it exists so the user isn't left staring at a
   * spinner. The server's `quote` action is what gets written to Supabase and pushed to
   * GHL; we only send the frequency webhook from here if the server couldn't.
   */
  const handleQuoteSubmit = (vals: QuoteStepValues) => {
    setResidentialFrequency(vals)
    // Use 8-weekly as default when frequency is null (for addon-only scenarios)
    const provisional = memoizedCalculateResult(vals.frequency ?? 8, vals.addons)
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
              // its own mirror of them (bedrooms, floor, uplifts, addons, price table)
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
                // which the price sheet now covers by floor
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
            // shape carries a flat's floor, which answers none of them.
            setBedrooms(vals.bedrooms ?? 0)
            setHasExtension(vals.hasExtension ?? 'no')
            setHasConservatory(vals.hasConservatory ?? 'no')
            setConservatoryRoofPricing(
              vals.hasConservatory === 'yes' ? (vals.conservatoryRoof ?? null) : null,
            )

            syncStep('residentialLargeAddress').catch((error) =>
              console.error('Error syncing large unusual property details:', error))

            setStep('residentialLargeAddress')
          }}
          propertyType="Large/Unusual Property"
          // Large/Unusual has no priced kind — but it is certainly not a flat, so it
          // gets the house questions.
          propertyKind={null}
          includeSixPlus={true}
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

      const kind = houseKindFor(residentialType, bungalowKind)

      return (
        <CommonPropertyDetailsStep
          initialValues={propertyDetails ?? undefined}
          onSubmit={(vals) => {
            setPropertyDetails(vals)

            setPropertyKind(kind)

            // A flat is priced by its floor and is asked nothing else. Mirroring
            // bedrooms, extension or conservatory for one would put answers into the
            // pricing call that the customer was never shown a question for.
            if (kind === 'flat') {
              setFloor(vals.floor ?? null)
            } else {
              // The house questions are all required, so these fallbacks are
              // unreachable — they exist because the values are optional at the type
              // level, in a shape shared with the flat's floor.
              setBedrooms(vals.bedrooms ?? 0)
              setHasExtension(vals.hasExtension ?? 'no')
              setHasConservatory(vals.hasConservatory ?? 'no')
              setConservatoryRoofPricing(
                vals.hasConservatory === 'yes' ? (vals.conservatoryRoof ?? null) : null,
              )
            }

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

    case 'residentialFrequency': {
      if (!propertyDetails) return null

      // Both quote screens gate their add-on rows on the property kind, so it has to
      // reach them. Null is Large/Unusual, which never routes through here — it leaves
      // by way of the address step — so there is nothing to render for it.
      const quoteKind = houseKindFor(residentialType, bungalowKind)
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

      // The same exit, for the case `oversized` cannot see. A table whose cells are all
      // not_priceable, not_applicable or unavailable carries `oversized: false`, so the
      // quote step would render every row disabled, Book Now disabled, and a hint telling
      // the customer to choose a frequency — advice no click on that page can follow.
      // Worst on the flat path, where the two window rows are the entire screen. It routes
      // to the screen the oversized path uses because it is the same promise to the
      // customer: we are not putting a number on this here, a human will.
      //
      // Tested only once the fetch has settled: while it is in flight every row is
      // unselectable by definition, and checking then would bounce every customer out on
      // arrival rather than showing them the prices that are seconds away.
      const pricesSettled = priceStatus === 'api' || priceStatus === 'unavailable'
      const nothingToPick =
        pricesSettled &&
        !hasSelectableRow(priceTable, {
          kind: quoteKind,
          hasConservatory: quoteHasConservatory === 'yes',
        })

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
          frequency={residentialFrequency.frequency ?? null}
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
      const firstCleanPrice = residentialFrequency?.frequency === null
        ? (residentialQuoteResult?.extras?.reduce((sum: number, e: { price: number; pricedOnVisit?: boolean }) => sum + (e.pricedOnVisit ? 0 : e.price), 0) || 0)
        : (residentialQuoteResult?.total || 0)

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
