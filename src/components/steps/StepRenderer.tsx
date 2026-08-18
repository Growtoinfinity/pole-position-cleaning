import { useMemo } from 'react'
import { useFormStore } from '@/stores/formStore'
import { useCostingStore } from '@/stores/costingStore'
import { useResponsive } from '@/hooks/useResponsive'
import { completeSubmission, syncQuote, syncStep } from '@/lib/submission'
import { type CalcInput } from '@/lib/costing-calc'
import type { QuoteStepValues } from '@/steps/quote/QuoteStep'

// Step components
import ContactStep from '@/steps/step-0/ContactStep'
import ResidentialTypeStep from '@/steps/step-2-residential/ResidentialTypeStep'
import LargeUnusualAddressStep from '@/steps/step-2-residential/LargeUnusualAddressStep'
import ResidentialFlatNotSupported from '@/steps/step-2-residential/ResidentialFlatNotSupported'
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
    setConservatoryRoofPricing,
    calculateResult
  } = useCostingStore()

  // Memoized calculation function for quote step
  const memoizedCalculateResult = useMemo(() => {
    return (frequency: any, addons: any) => {
      // We directly use the calculateResult function from the costingStore
      // The property details are already set in the store
      return calculateResult(frequency, addons)
    }
  }, [calculateResult])

  /** The exact input the server re-runs `calculateCost` on for the authoritative quote. */
  const buildCalcInput = (vals: QuoteStepValues): CalcInput | null => {
    const costing = useCostingStore.getState()
    if (!costing.propertyKind || costing.bedrooms <= 0) return null

    return {
      kind: costing.propertyKind,
      bedrooms: costing.bedrooms,
      hasExtension: costing.hasExtension,
      hasConservatory: costing.hasConservatory,
      conservatoryRoofPricing: costing.hasConservatory ? costing.conservatoryRoofPricing : null,
      selectedFrequency: vals.frequency || 8,
      addons: vals.addons,
    }
  }

  /**
   * S3. The client result is provisional — it exists so the user isn't left staring at a
   * spinner. The server's `quote` action is what gets written to Supabase and pushed to
   * GHL; we only send the frequency webhook from here if the server couldn't.
   */
  const handleQuoteSubmit = (vals: QuoteStepValues) => {
    setResidentialFrequency(vals)
    // Use 8-weekly as default when frequency is null (for addon-only scenarios)
    const provisional = memoizedCalculateResult(vals.frequency || 8, vals.addons)
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
              setResidentialType(v)

              setShowBungalowInline(false)
              setShowTownhouseInline(false)

              const nextStep =
                v === 'large_unusual' ? 'residentialLargePropertyDetails'
                : v === 'flat' ? 'residentialFlatNotSupported'
                : v === 'bungalow' ? 'bungalowTypeMobile'
                : v === 'townhouse' ? 'townhouseTypeMobile'
                // For direct house types (semi_detached, terraced, detached)
                : 'propertyDetails'

              // A flat is a dead end — close the submission out so the abandonment
              // job doesn't chase a lead we can't serve
              if (v === 'flat') {
                completeSubmission({
                  pipelineStage: 'unsupported_property',
                  arrivedAtStep: nextStep,
                }).catch((error) => console.error('Error completing flat submission:', error))
              } else {
                syncStep(nextStep).catch((error) =>
                  console.error('Error syncing residential type step:', error))
              }

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
            
            setBedrooms(vals.bedrooms)
            setHasExtension(vals.hasExtension)
            setHasConservatory(vals.hasConservatory)
            setConservatoryRoofPricing(
              vals.hasConservatory === 'yes' ? (vals.conservatoryRoof ?? null) : null,
            )
            
            syncStep('residentialLargeAddress').catch((error) =>
              console.error('Error syncing large unusual property details:', error))

            setStep('residentialLargeAddress')
          }}
          propertyType="Large/Unusual Property"
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

    case 'residentialFlatNotSupported':
      return <ResidentialFlatNotSupported />

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

    case 'propertyDetails':
      return residentialType ? (
        <CommonPropertyDetailsStep
          initialValues={propertyDetails ?? undefined}
          onSubmit={(vals) => {
            setPropertyDetails(vals)

            // Update property kind based on residential type
            if (residentialType === 'bungalow' && bungalowKind) {
              if (bungalowKind === 'semi_detached') {
                setPropertyKind('semi_detached')
              } else if (bungalowKind === 'terraced') {
                setPropertyKind('terraced')
              } else if (bungalowKind === 'detached') {
                setPropertyKind('detached')
              }
            } else if (residentialType === 'townhouse') {
              setPropertyKind('townhouse')
            } else if (residentialType === 'semi_detached') {
              setPropertyKind('semi_detached')
            } else if (residentialType === 'terraced') {
              setPropertyKind('terraced')
            } else if (residentialType === 'detached') {
              setPropertyKind('detached')
            }

            setBedrooms(vals.bedrooms)
            setHasExtension(vals.hasExtension)
            setHasConservatory(vals.hasConservatory)
            setConservatoryRoofPricing(
              vals.hasConservatory === 'yes' ? (vals.conservatoryRoof ?? null) : null,
            )

            syncStep('residentialFrequency').catch((error) =>
              console.error('Error syncing property details step:', error))

            setStep('residentialFrequency')
          }}
          propertyType={getPropertyTypeName()}
        />
      ) : null

    case 'residentialFrequency':
      if (!propertyDetails) return null

      return isMobile ? (
        <QuoteStepMobile
          initialValues={residentialFrequency ?? undefined}
          calculatedResult={memoizedCalculateResult}
          hasConservatory={propertyDetails.hasConservatory}
          onSubmit={handleQuoteSubmit}
        />
      ) : (
        <QuoteStep
          initialValues={residentialFrequency ?? undefined}
          calculatedResult={memoizedCalculateResult}
          hasConservatory={propertyDetails.hasConservatory}
          onSubmit={handleQuoteSubmit}
        />
      )

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
