import { useMemo } from 'react'
import { useFormStore } from '@/stores/formStore'
import { useCostingStore } from '@/stores/costingStore'
import { useResponsive } from '@/hooks/useResponsive'
import { sendCompleteFormData, sendStepData, type CompleteFormData } from '@/lib/api'
import { type HouseKind } from '@/lib/costing-calc'

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

            if (values.propertyType === 'commercial') {
              setStep('commercialDetails')
            } else {
              setStep('residentialType')
            }
          }}
        />
      )

    case 'residentialType':
      return (
        <>
          <ResidentialTypeStep
            onSelect={(v) => {
              setResidentialType(v)

              // Send data to API in the background
              sendStepData('residentialType', {
                residentialType: v,
                propertyType
              }, contactData)
                .then(() => console.log('Residential type data sent successfully'))
                .catch(error => console.error('Error sending residential type data:', error))

              if (v === 'large_unusual') {
                setShowBungalowInline(false)
                setShowTownhouseInline(false)
                setStep('residentialLargePropertyDetails')
              }
              else if (v === 'flat') {
                setShowBungalowInline(false)
                setShowTownhouseInline(false)
                setStep('residentialFlatNotSupported')
              }
              else if (v === 'bungalow') {
                setShowBungalowInline(false)
                setShowTownhouseInline(false)
                setStep('bungalowTypeMobile')
              }
              else if (v === 'townhouse') {
                setShowBungalowInline(false)
                setShowTownhouseInline(false)
                setStep('townhouseTypeMobile')
              }
              else {
                // For direct house types (semi_detached, terraced, detached)
                setShowBungalowInline(false)
                setShowTownhouseInline(false)
                setStep('propertyDetails')
              }
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
            
            // Send data to API in the background
            sendStepData('residentialLargePropertyDetails', {
              propertyDetails: vals,
              residentialType,
              propertyTypeName: 'Large/Unusual Property'
            }, contactData)
              .then(() => console.log('Large unusual property details sent successfully'))
              .catch(error => console.error('Error sending large unusual property details:', error))

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

            setStep('residentialThanks')
          }}
        />
      )

    case 'residentialFlatNotSupported':
      return <ResidentialFlatNotSupported />

    case 'residentialThanks':
      return <LargeUnusualThankYou />

    case 'bungalowTypeMobile':
      return (
        <BungalowTypeStep
          onSelect={(k) => {
            setBungalowKind(k)

            // Send data to API in the background
            sendStepData('bungalowTypeMobile', {
              bungalowKind: k,
              residentialType
            }, contactData)
              .then(() => console.log('Bungalow type mobile data sent successfully'))
              .catch(error => console.error('Error sending bungalow type data:', error))

            setStep('propertyDetails')
          }}
        />
      )

    case 'townhouseTypeMobile':
      return (
        <TownhouseTypeStep
          onSelect={(k) => {
            setTownhouseKind(k)

            // Send data to API in the background
            sendStepData('townhouseTypeMobile', {
              townhouseKind: k,
              residentialType
            }, contactData)
              .then(() => console.log('Townhouse type mobile data sent successfully'))
              .catch(error => console.error('Error sending townhouse type data:', error))

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
          onSubmit={(vals) => {
            setResidentialFrequency(vals)
            // Use 8-weekly as default when frequency is null (for addon-only scenarios)
            const result = memoizedCalculateResult(vals.frequency || 8, vals.addons)
            setResidentialQuoteResult(result)

            // Send data to API in the background
            sendStepData('residentialFrequency', {
              residentialFrequency: vals,
              residentialQuoteResult: result,
              propertyTypeName: getPropertyTypeName(),
              propertyDetails,
              residentialType,
              bungalowKind,
              townhouseKind
            }, contactData)
              .then(() => console.log('Frequency data sent successfully'))
              .catch(error => console.error('Error sending frequency data:', error))

            setStep('residentialBook')
          }}
        />
      ) : (
        <QuoteStep
          initialValues={residentialFrequency ?? undefined}
          calculatedResult={memoizedCalculateResult}
          hasConservatory={propertyDetails.hasConservatory}
          onSubmit={(vals) => {
            setResidentialFrequency(vals)
            // Use 8-weekly as default when frequency is null (for addon-only scenarios)
            const result = memoizedCalculateResult(vals.frequency || 8, vals.addons)
            setResidentialQuoteResult(result)

            // Send data to API in the background
            sendStepData('residentialFrequency', {
              residentialFrequency: vals,
              residentialQuoteResult: result,
              propertyTypeName: getPropertyTypeName(),
              propertyDetails,
              residentialType,
              bungalowKind,
              townhouseKind
            }, contactData)
              .then(() => console.log('Frequency data sent successfully'))
              .catch(error => console.error('Error sending frequency data:', error))

            setStep('residentialBook')
          }}
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

            setStep('commercialThanks')
          }}
        />
      )

    case 'commercialThanks':
      return <CommercialThankYou />

    case 'residentialBook':
      return residentialFrequency ? (
        <BookStep
          initialValues={bookingDetails ?? undefined}
          frequency={residentialFrequency.frequency ?? null}
          onSubmit={(vals) => {
            setBookingDetails(vals)

            // Send booking data to API in the background
            sendStepData('residentialBook', {
              bookingDetails: vals,
              residentialFrequency,
              residentialQuoteResult,
              propertyTypeName: getPropertyTypeName()
            }, contactData)
              .then(() => {
                console.log('Booking data sent successfully')
              })
              .catch(error => {
                console.error('Error sending booking data:', error)
              })

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
                  ? (residentialQuoteResult?.extras?.reduce((sum: number, e: any) => sum + e.price, 0) || 0)
                  : (residentialQuoteResult?.total || 0)
              },

              // Final booking details (without allAppointmentDates)
              bookingDetails: {
                address1: vals.address1,
                city: vals.city,
                postcode: vals.postcode,
                selectedDate: vals.selectedDate,
                timePreference: vals.timePreference,
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

            // Navigate to thank you page immediately without waiting for API response
            setStep('thankYou')
          }}
        />
      ) : null

    case 'thankYou':
      return (
        <ThankYouStep
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

    default:
      return null
  }
}