import { useMemo } from 'react'
import { useFormStore } from '@/stores/formStore'
import { useCostingStore } from '@/stores/costingStore'
import { useResponsive } from '@/hooks/useResponsive'
import { sendCompleteFormData, sendStepData, type CompleteFormData } from '@/lib/api'
import { completeSubmission, syncQuote, syncStep } from '@/lib/submission'
import { type CalcInput, type HouseKind } from '@/lib/costing-calc'
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
    propertyType, setPropertyType,
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

    const sendFromClient = (result: typeof provisional) =>
      sendStepData(
        'residentialFrequency',
        { ...frequencyPayload, residentialQuoteResult: result },
        contactData,
      )
        .then(() => console.log('Frequency data sent successfully (client fallback)'))
        .catch((error) => console.error('Error sending frequency data:', error))

    const calcInput = buildCalcInput(vals)

    if (calcInput) {
      syncQuote({
        calcInput,
        formData: frequencyPayload,
        contactData,
        arrivedAtStep: 'residentialBook',
      })
        .then(({ quote, ghlForwarded }) => {
          // Server value is authoritative — replace the provisional one
          if (quote) setResidentialQuoteResult(quote)
          if (!ghlForwarded) return sendFromClient(quote ?? provisional)
        })
        .catch((error) => {
          console.error('Server quote failed, falling back to client send:', error)
          return sendFromClient(provisional)
        })
    } else {
      // No usable costing state (shouldn't happen) — keep GHL delivery working regardless
      sendFromClient(provisional)
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

            // Send data to API with contact data properly passed
            try {
              await sendStepData('contact', { contact: values }, values)
            } catch (error) {
              console.error('Error sending contact data:', error)
            }

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

              // Send data to API in the background
              sendStepData('residentialType', {
                residentialType: v,
                propertyType
              }, contactData)
                .then(() => console.log('Residential type data sent successfully'))
                .catch(error => console.error('Error sending residential type data:', error))

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
            
            // Send data to API in the background
            sendStepData('residentialLargePropertyDetails', {
              propertyDetails: vals,
              residentialType,
              propertyTypeName: 'Large/Unusual Property'
            }, contactData)
              .then(() => console.log('Large unusual property details sent successfully'))
              .catch(error => console.error('Error sending large unusual property details:', error))

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

            // Send data to API in the background
            sendStepData('residentialLargeAddress', {
              largeUnusualAddress: vals,
              residentialType
            }, contactData)
              .then(() => console.log('Large unusual address data sent successfully'))
              .catch(error => console.error('Error sending large unusual address data:', error))

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

            // Send data to API in the background
            sendStepData('bungalowTypeMobile', {
              bungalowKind: k,
              residentialType
            }, contactData)
              .then(() => console.log('Bungalow type mobile data sent successfully'))
              .catch(error => console.error('Error sending bungalow type data:', error))

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

            // Send data to API in the background
            sendStepData('townhouseTypeMobile', {
              townhouseKind: k,
              residentialType
            }, contactData)
              .then(() => console.log('Townhouse type mobile data sent successfully'))
              .catch(error => console.error('Error sending townhouse type data:', error))

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
            let propertyKindValue: HouseKind | null = null;

            if (residentialType === 'bungalow' && bungalowKind) {
              if (bungalowKind === 'semi_detached') {
                propertyKindValue = 'semi_detached';
                setPropertyKind('semi_detached')
              } else if (bungalowKind === 'terraced') {
                propertyKindValue = 'terraced';
                setPropertyKind('terraced')
              } else if (bungalowKind === 'detached') {
                propertyKindValue = 'detached';
                setPropertyKind('detached')
              }
            } else if (residentialType === 'townhouse') {
              propertyKindValue = 'townhouse';
              setPropertyKind('townhouse')
            } else if (residentialType === 'semi_detached') {
              propertyKindValue = 'semi_detached';
              setPropertyKind('semi_detached')
            } else if (residentialType === 'terraced') {
              propertyKindValue = 'terraced';
              setPropertyKind('terraced')
            } else if (residentialType === 'detached') {
              propertyKindValue = 'detached';
              setPropertyKind('detached')
            }

            setBedrooms(vals.bedrooms)
            setHasExtension(vals.hasExtension)
            setHasConservatory(vals.hasConservatory)
            setConservatoryRoofPricing(
              vals.hasConservatory === 'yes' ? (vals.conservatoryRoof ?? null) : null,
            )

            // Send data to API in the background
            sendStepData('propertyDetails', {
              propertyDetails: vals,
              propertyKind: propertyKindValue,
              residentialType,
              bungalowKind,
              townhouseKind,
              propertyTypeName: getPropertyTypeName()
            }, contactData)
              .then(() => console.log('Property details data sent successfully'))
              .catch(error => console.error('Error sending property details data:', error))

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

            // Send data to API in the background
            sendStepData('commercialDetails', {
              businessDetails: vals,
              propertyType
            }, contactData)
              .then(() => console.log('Commercial details data sent successfully'))
              .catch(error => console.error('Error sending commercial details data:', error))

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

            // Collect all form data from the entire flow
            const completeFormData: CompleteFormData = {
              // Contact information
              contact: contactData!,

              // Property type and details
              propertyType: propertyType!,
              residentialType,
              typeOfHouse: getTypeOfHouse(),
              propertyDetails,

              // Property-specific details
              bungalowKind,
              townhouseKind,
              largeUnusualAddress,

              // Quote and frequency details (keep for internal use)
              residentialFrequency,
              residentialQuoteResult,

              // New quote details structure
              quoteDetails: {
                frequency: formatFrequency(residentialFrequency?.frequency, residentialQuoteResult?.basePrice),
                addons: {
                  gutterClear: formatAddon('Ad Hoc Gutter Clearance', residentialFrequency?.addons.gutterClear, residentialQuoteResult),
                  fasciaClean: formatAddon('Ad Hoc Fascia Soffit & Gutter Clean', residentialFrequency?.addons.fasciaClean, residentialQuoteResult),
                  conservatoryRoofCleanExternal: formatAddon('Ad Hoc Conservatory Roof Clean - External', residentialFrequency?.addons.conservatoryRoofCleanExternal, residentialQuoteResult),
                  conservatoryRoofCleanInternal: formatAddon('Ad Hoc Conservatory Roof Clean - Internal', residentialFrequency?.addons.conservatoryRoofCleanInternal, residentialQuoteResult),
                  adHocInternalClean: formatAddon('Ad Hoc Internal Window Clean', residentialFrequency?.addons.adHocInternalClean, residentialQuoteResult)
                },
                // If frequency is null, calculate total from addons only
                totalPrice: residentialFrequency?.frequency === null
                  ? (residentialQuoteResult?.extras?.reduce((sum: number, e: { price: number; pricedOnVisit?: boolean }) => sum + (e.pricedOnVisit ? 0 : e.price), 0) || 0)
                  : (residentialQuoteResult?.total || 0)
              },

              // Final booking details (without allAppointmentDates)
              bookingDetails: {
                address1: vals.address1,
                city: vals.city,
                postcode: vals.postcode,
                selectedDate: vals.selectedDate,
                timePreference: vals.timePreference,
                appointmentTime: vals.appointmentTime,
                additionalNotes: vals.additionalNotes
              },

              // Calculated property type name
              propertyTypeName: getPropertyTypeName(),

              // Timestamp
              submittedAt: new Date().toISOString()
            }

            // Helper functions for formatting
            function getTypeOfHouse(): string {
              if (residentialType === 'townhouse') return 'townhouse';
              if (residentialType === 'bungalow') {
                return bungalowKind || '';
              }
              return residentialType || '';
            }

            function formatFrequency(freq: 6 | 8 | 12 | 'one-off' | null | undefined, price: number | undefined): string {
              if (freq === null || freq === undefined || price === undefined) return '';
              const freqLabel = freq === 'one-off' ? 'One-off' : `${freq} weeks`;
              return `${freqLabel} - £${price}`;
            }

            function formatAddon(label: string, isSelected: boolean | undefined, quoteResult: any): string | null {
              if (!isSelected || !quoteResult) return null;
              const addon = quoteResult.extras.find((e: any) => e.label === label);
              if (!addon) return null;
              if (addon.pricedOnVisit) {
                return `${label} — price confirmed on visit (£10 per panel)`;
              }
              return `${label} - £${addon.price}`;
            }

            // Log the complete form data
            console.log('=== COMPLETE FORM DATA ===')
            console.log(completeFormData)
            console.log('========================')

            // Send data to webhook in the background
            sendCompleteFormData(completeFormData)
              .then(result => {
                if (result.success) {
                  console.log('Form data sent successfully')
                } else {
                  console.error('Failed to send form data')
                }
              })
              .catch(error => {
                console.error('Error sending form data:', error)
              })

            // S5 — close the submission out in Supabase alongside the GHL completion webhook
            completeSubmission({
              pipelineStage: 'booked',
              arrivedAtStep: 'thankYou',
            }).catch(error => console.error('Error completing submission:', error))

            // Navigate to thank you page immediately without waiting for API response
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
            // Send thank you step data to API
            try {
              sendStepData('thankYou', {
                message: 'User started a new quote'
              }, contactData).catch(error => console.error('Error sending thank you data:', error))
            } catch (error) {
              console.error('Error sending thank you data:', error)
            }

            // Reset all form data and start over
            reset()
          }}
        />
      )
    }

    default:
      return null
  }
}
