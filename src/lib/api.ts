import { formatAppointmentTime, getServiceDaysForPostcode } from '@/lib/scheduling'
import type { Step } from '@/stores/formStore'
import { useFormStore } from '@/stores/formStore'
import { calculateCost, type ConservatoryRoofPricingInput, type HouseKind } from '@/lib/costing-calc'

// Kings — webhook URLs live server-side in `api/webhook.ts` (never in the browser bundle)
const PROXY_URL = '/api/webhook'

/** Steps the proxy forwards to Lead Connector (must match `api/webhook.ts`). */
const WEBHOOK_STEPS = new Set<string>([
  'contact',
  'residentialType',
  'bungalowType',
  'bungalowTypeMobile',
  'townhouseType',
  'townhouseTypeMobile',
  'propertyDetails',
  'residentialFrequency',
  'residentialBook',
  'finalSubmission',
  'residentialLargeAddress',
  'residentialLargePropertyDetails',
  'commercialDetails',
])

const DISPLAY_ONLY_STEPS = new Set<string>([
  'residentialFlatNotSupported',
  'residentialThanks',
  'residentialQuote',
  'commercialThanks',
  'thankYou',
])
export interface ContactFormData {
  fullName: string
  phone: string
  email: string
  hearAboutUs?: string
  referralName?: string
  propertyType: 'residential' | 'commercial'
  consent: boolean
}

export interface CompleteFormData {
  contact: {
    fullName: string
    phone: string
    email: string
    hearAboutUs?: string
    referralName?: string
    consent: boolean
    propertyType: 'residential' | 'commercial'
  }
  propertyType: 'residential' | 'commercial'
  residentialType: string | null
  typeOfHouse: string // terraced / detached / semi-detached / townhouse  
  propertyDetails: {
    bedrooms: number
    hasExtension: string
    hasConservatory: string
    conservatoryRoof?: ConservatoryRoofPricingInput | null
  } | null
  bungalowKind: string | null
  townhouseKind: string | null
  largeUnusualAddress: any | null
  // Keep these for internal use only - they won't be in the final output
  residentialFrequency: {
    frequency: 6 | 8 | 12 | 'one-off' | null
    addons: {
      gutterClear: boolean
      fasciaClean: boolean
      conservatoryRoofCleanExternal: boolean
      conservatoryRoofCleanInternal: boolean
      adHocInternalClean: boolean
    }
  } | null
  residentialQuoteResult: {
    schedule: { label: string; price: number }[]
    extras: { label: string; price: number; pricedOnVisit?: boolean }[]
    selectedFrequency: 6 | 8 | 12 | 'one-off'
    selectedLabel: string
    basePrice: number
    total: number
  } | null
  // New structure for quote details
  quoteDetails: {
    frequency: string // "8 weeks - {price}"
    addons: {
      gutterClear: string | null // "Ad Hoc Gutter Clearance - {price}" or null if not selected
      fasciaClean: string | null
      conservatoryRoofCleanExternal: string | null
      conservatoryRoofCleanInternal: string | null
      adHocInternalClean: string | null
    }
    totalPrice: number
  }
  bookingDetails: {
    address1: string
    city: string
    postcode: string
    selectedDate: string
    timePreference: 'morning' | 'afternoon'
    appointmentTime?: string
    additionalNotes?: string
    // allAppointmentDates removed from the final output
  } | null
  propertyTypeName: string
  submittedAt: string
}

export interface ApiResponse {
  success: boolean
  message?: string
  error?: string
}

/**
 * Helper function to format type of house
 */
function formatTypeOfHouse(residentialType: string | null, subType: string | null): string {
  if (!residentialType) return '';
  
  if (residentialType === 'bungalow') {
    return subType ? `${subType}` : 'bungalow';
  } else if (residentialType === 'townhouse') {
    return subType ? `${subType}` : 'townhouse';
  } else {
    return residentialType;
  }
}

/**
 * Determines the HouseKind from form data
 */
function getHouseKind(data: any): HouseKind | null {
  const residentialType = data.residentialType;
  
  if (residentialType === 'bungalow' && data.bungalowKind) {
    if (data.bungalowKind === 'semi_detached') return 'semi_detached';
    if (data.bungalowKind === 'terraced') return 'terraced';
    if (data.bungalowKind === 'detached') return 'detached';
  } else if (residentialType === 'townhouse' && data.townhouseKind) {
    if (data.townhouseKind === 'semi_detached') return 'semi_detached';
    if (data.townhouseKind === 'terraced') return 'terraced';
    if (data.townhouseKind === 'detached') return 'detached';
  } else if (residentialType === 'semi_detached') {
    return 'semi_detached';
  } else if (residentialType === 'terraced') {
    return 'terraced';
  } else if (residentialType === 'detached') {
    return 'detached';
  } else if (residentialType === 'townhouse') {
    return 'townhouse';
  }
  
  return null;
}

/**
 * Conservatory roof pricing for per-panel webhook / recalculation
 */
function conservatoryRoofPricingFromFormData(data: any): ConservatoryRoofPricingInput | null {
  const pd = data.propertyDetails as
    | { hasConservatory?: string; conservatoryRoof?: ConservatoryRoofPricingInput | null | undefined }
    | undefined
  if (pd?.hasConservatory === 'yes') {
    return pd.conservatoryRoof ?? null
  }
  const lu = data.largeUnusualAddress as
    | { hasConservatory?: string; conservatoryRoof?: ConservatoryRoofPricingInput | null | undefined }
    | undefined
    | null
  if (lu?.hasConservatory === 'yes') {
    return lu.conservatoryRoof ?? null
  }
  return null
}

/**
 * Helper function to create unified payload with ALL fields
 * This ensures every webhook gets the complete data structure
 */
function createUnifiedPayload(data: any, contactData: ContactFormData | null): any {
  // DEBUG: Log incoming parameters
  console.log('createUnifiedPayload called with:');
  console.log('- data:', JSON.stringify(data, null, 2));
  console.log('- contactData:', JSON.stringify(contactData, null, 2));
  
  // Helper function to convert day number to day name
  const getDayName = (dayNum: number): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayNum] || '';
  };
  
  // Get appointment day based on postcode
  const getAppointmentDay = (postcode: string): string => {
    const serviceDays = getServiceDaysForPostcode(postcode);
    if (!serviceDays || serviceDays.length === 0) {
      return '';
    }
    return getDayName(serviceDays[0]);
  };
  
  // Format address (check bookingDetails, largeUnusualAddress, and businessDetails)
  const address = data.bookingDetails 
    ? `${data.bookingDetails.address1}, ${data.bookingDetails.city}`
    : data.largeUnusualAddress
    ? `${data.largeUnusualAddress.address1}, ${data.largeUnusualAddress.city}`
    : data.businessDetails
    ? `${data.businessDetails.address1}, ${data.businessDetails.city}`
    : '';
  
  // Get appointment details
  const appointmentDay = data.bookingDetails ? getAppointmentDay(data.bookingDetails.postcode) : '';
  const appointmentTime = data.bookingDetails?.appointmentTime
    || (data.bookingDetails?.selectedDate && data.bookingDetails?.timePreference
      ? formatAppointmentTime(data.bookingDetails.selectedDate, data.bookingDetails.timePreference)
      : '');
  
  // Get base pricing options - NO SPACES in keys (GHL requirement)
  const basePricingOptions = data.residentialQuoteResult ? {
    "6weekly": data.residentialQuoteResult.schedule.find((s: any) => s.label === '6-weekly')?.price || 0,
    "8weekly": data.residentialQuoteResult.schedule.find((s: any) => s.label === '8-weekly')?.price || 0,
    "12weekly": data.residentialQuoteResult.schedule.find((s: any) => s.label === '12-weekly')?.price || 0,
    "One-off": data.residentialQuoteResult.schedule.find((s: any) => s.label === 'One-off')?.price || 0
  } : {
    "6weekly": 0,
    "8weekly": 0,
    "12weekly": 0,
    "One-off": 0
  };
  
  // Format selected frequency - matching Versaclean format
  const selectedFrequency = data.residentialFrequency?.frequency;
  
  // Get selected frequency price from schedule array, not basePrice
  let selectedFrequencyPrice = 0;
  if (selectedFrequency !== null && selectedFrequency !== undefined && data.residentialQuoteResult) {
    if (selectedFrequency === 'one-off') {
      selectedFrequencyPrice = data.residentialQuoteResult.schedule.find((s: any) => s.label === 'One-off')?.price || 0;
    } else if (selectedFrequency === 6) {
      selectedFrequencyPrice = data.residentialQuoteResult.schedule.find((s: any) => s.label === '6-weekly')?.price || 0;
    } else if (selectedFrequency === 8) {
      selectedFrequencyPrice = data.residentialQuoteResult.schedule.find((s: any) => s.label === '8-weekly')?.price || 0;
    } else if (selectedFrequency === 12) {
      selectedFrequencyPrice = data.residentialQuoteResult.schedule.find((s: any) => s.label === '12-weekly')?.price || 0;
    }
  }
  
  const selectedFrequencyLabel = (selectedFrequency === null || selectedFrequency === undefined)
    ? '' 
    : selectedFrequency === 'one-off' 
      ? `One-off external window clean - £${selectedFrequencyPrice}` 
      : `${selectedFrequency} week external window clean - £${selectedFrequencyPrice}`;
  
  const hasConservatory =
    data.propertyDetails?.hasConservatory === 'yes' ||
    data.propertyDetails?.hasConservatory === true ||
    data.largeUnusualAddress?.hasConservatory === 'yes' ||
    data.largeUnusualAddress?.hasConservatory === true;

  const conservatoryRoofPricing = hasConservatory ? conservatoryRoofPricingFromFormData(data) : null

  // Helper function to calculate addon price dynamically if not in extras
  const getAddonPrice = (label: string): number => {
    // First, try to get price from extras (for selected addons)
    if (data.residentialQuoteResult) {
      const line = data.residentialQuoteResult.extras.find((e: any) => e.label === label)
      if (line?.pricedOnVisit) {
        return 0
      }
      if (line && line.price !== undefined && line.price > 0) {
        return line.price
      }
    }
    
    // If not found in extras (unselected addon), calculate it dynamically
    const houseKind = getHouseKind(data);
    if (!houseKind || (!data.propertyDetails && !data.largeUnusualAddress)) {
      return 0;
    }
    
    const bedrooms = data.propertyDetails?.bedrooms || data.largeUnusualAddress?.bedrooms || 0;
    const hasExtension = (data.propertyDetails?.hasExtension === 'yes' || data.propertyDetails?.hasExtension === true) || 
                         (data.largeUnusualAddress?.hasExtension === 'yes' || data.largeUnusualAddress?.hasExtension === true);
    
    // Create a temporary calculation with just this addon selected
    const tempAddons: any = {
      gutterClear: label === 'Ad Hoc Gutter Clearance',
      fasciaClean: label === 'Ad Hoc Fascia Soffit & Gutter Clean',
      conservatoryRoofCleanExternal: label === 'Ad Hoc Conservatory Roof Clean - External',
      conservatoryRoofCleanInternal: label === 'Ad Hoc Conservatory Roof Clean - Internal',
      adHocInternalClean: label === 'Ad Hoc Internal Window Clean'
    };
    
    try {
      const tempResult = calculateCost({
        kind: houseKind,
        bedrooms: Math.max(1, Math.min(5, bedrooms)),
        hasExtension,
        hasConservatory,
        conservatoryRoofPricing: hasConservatory ? conservatoryRoofPricing : null,
        selectedFrequency: 8, // Use 8-weekly as base for calculation
        addons: tempAddons
      });
      
      const addonLine = tempResult.extras.find((e: any) => e.label === label)
      if (addonLine?.pricedOnVisit) {
        return 0
      }
      const calculatedPrice = addonLine?.price
      return calculatedPrice || 0;
    } catch (error) {
      console.error(`Error calculating price for ${label}:`, error);
      return 0;
    }
  };
  
  // Build addon data
  const addonData: any = {
    GutterClearance: {
      name: "Gutter Clearance",
      price: getAddonPrice('Ad Hoc Gutter Clearance'),
      selected: data.residentialFrequency?.addons?.gutterClear || false
    },
    FasciaSoffitGutterClean: {
      name: "Fascia Soffit & Gutter Clean",
      price: getAddonPrice('Ad Hoc Fascia Soffit & Gutter Clean'),
      selected: data.residentialFrequency?.addons?.fasciaClean || false
    },
    ConservatoryRoofCleanExternal: {
      name: "Conservatory Roof Clean - External",
      price: getAddonPrice('Ad Hoc Conservatory Roof Clean - External'),
      selected: data.residentialFrequency?.addons?.conservatoryRoofCleanExternal || false
    },
    ConservatoryRoofCleanInternal: {
      name: "Conservatory Roof Clean - Internal",
      price: getAddonPrice('Ad Hoc Conservatory Roof Clean - Internal'),
      selected: data.residentialFrequency?.addons?.conservatoryRoofCleanInternal || false
    },
    InternalWindowClean: {
      name: "Internal Window Clean",
      price: getAddonPrice('Ad Hoc Internal Window Clean'),
      selected: data.residentialFrequency?.addons?.adHocInternalClean || false
    }
  };
  
  // Calculate first clean price (frequency + selected addons)
  const firstCleanPrice = selectedFrequencyPrice + Object.keys(addonData).reduce((sum, key) => {
    const addon = addonData[key];
    return sum + (addon.selected ? addon.price : 0);
  }, 0);
  
  // Create booked services array
  const bookedServicesArray = (() => {
    const services = [];
    
    // Add main frequency service if exists
    if (data.residentialFrequency?.frequency && data.residentialQuoteResult) {
      const freq = data.residentialFrequency.frequency;
      let price = 0;
      if (freq === 6) {
        price = data.residentialQuoteResult.schedule.find((s: any) => s.label === '6-weekly')?.price || 0;
        services.push(`6 week external window clean - £${price}`);
      } else if (freq === 8) {
        price = data.residentialQuoteResult.schedule.find((s: any) => s.label === '8-weekly')?.price || 0;
        services.push(`8 week external window clean - £${price}`);
      } else if (freq === 12) {
        price = data.residentialQuoteResult.schedule.find((s: any) => s.label === '12-weekly')?.price || 0;
        services.push(`12 week external window clean - £${price}`);
      } else if (freq === 'one-off') {
        price = data.residentialQuoteResult.schedule.find((s: any) => s.label === 'One-off')?.price || 0;
        services.push(`One-off external window clean - £${price}`);
      }
    }
    
    // Add selected addons
    if (data.residentialFrequency?.addons) {
      const addons = data.residentialFrequency.addons;
      
      if (addons.adHocInternalClean) {
        const price = getAddonPrice('Ad Hoc Internal Window Clean');
        services.push(`Internal Window Cleaning - £${price}`);
      }
      if (addons.gutterClear) {
        const price = getAddonPrice('Ad Hoc Gutter Clearance');
        services.push(`Gutter Clearance - £${price}`);
      }
      if (addons.fasciaClean) {
        const price = getAddonPrice('Ad Hoc Fascia Soffit & Gutter Clean');
        services.push(`Fascia Soffit & Gutter Washing - £${price}`);
      }
      if (addons.conservatoryRoofCleanExternal) {
        if (conservatoryRoofPricing?.status === 'unknown') {
          services.push('Conservatory roof cleaning (external) — price confirmed on visit (£10 per panel)')
        } else {
          const price = getAddonPrice('Ad Hoc Conservatory Roof Clean - External');
          services.push(`Conservatory Roof Cleaning - External - £${price}`);
        }
      }
      if (addons.conservatoryRoofCleanInternal) {
        if (conservatoryRoofPricing?.status === 'unknown') {
          services.push('Conservatory roof cleaning (internal) — price confirmed on visit (£10 per panel)')
        } else {
          const price = getAddonPrice('Ad Hoc Conservatory Roof Clean - Internal');
          services.push(`Conservatory Roof Cleaning - Internal - £${price}`);
        }
      }
    }
    
    return services;
  })();
  
  // Get continue URL from the store
  const continueUrl = useFormStore.getState().getContinueUrl()
  
  // Return unified payload with ALL fields
  return {
    // Contact Information (check both contactData and data.contact)
    fullName: contactData?.fullName || data.contact?.fullName || '',
    phone: contactData?.phone || data.contact?.phone || '',
    email: contactData?.email || data.contact?.email || '',
    hearAboutUs: contactData?.hearAboutUs || data.contact?.hearAboutUs || '',
    referralName: contactData?.referralName || data.contact?.referralName || '',
    propertyType: contactData?.propertyType || data.contact?.propertyType || '',
    consent: contactData?.consent || data.contact?.consent || false,
    
    // Property Type Information
    residentialType: data.residentialType || '',
    typeOfHouse: formatTypeOfHouse(data.residentialType || null, data.bungalowKind || data.townhouseKind || null),
    propertyTypeName: data.propertyTypeName || '',
    
    // Property Details (flat structure for GHL)
    numberOfBedrooms: data.propertyDetails?.bedrooms || 0,
    extension: data.propertyDetails?.hasExtension || '',
    conservatory: data.propertyDetails?.hasConservatory || '',
    conservatoryRoofPanels:
      conservatoryRoofPricing?.status === 'unknown'
        ? 'unknown (confirmed on visit)'
        : conservatoryRoofPricing?.status === 'count'
          ? String(conservatoryRoofPricing.panelCount)
          : '',
    
    // Large/Unusual or Commercial Address
    address: address,
    postcode: data.bookingDetails?.postcode || data.largeUnusualAddress?.postcode || data.businessDetails?.postcode || '',
    
    // Commercial Details
    businessName: data.businessDetails?.businessName || '',
    buildingType: data.businessDetails?.buildingType || '',
    cleaningTypes: data.businessDetails?.cleaningTypes ? data.businessDetails.cleaningTypes.join(', ') : '',
    
    // Frequency & Quote Information - NO SPACES in frequency keys
    ...basePricingOptions,
    selectedFrequencyLabel,
    selectedFrequencyPrice,
    
    // First clean and regular price (like Versaclean)
    firstCleanPrice: firstCleanPrice,
    regularPrice: selectedFrequencyPrice,
    
    // Addon Information
    ...Object.keys(addonData).reduce((acc: any, key: string) => {
      const addon = addonData[key];
      const isRoof =
        key === 'ConservatoryRoofCleanExternal' || key === 'ConservatoryRoofCleanInternal'
      const roofVisit =
        isRoof &&
        conservatoryRoofPricing?.status === 'unknown' &&
        addon.selected
      acc[key] =
        addon.selected
          ? roofVisit
            ? `${addon.name} — price confirmed on visit (£10 per panel)`
            : `${addon.name} - £${addon.price}`
          : '';
      acc[`${key}Price`] = addon.price;
      acc[`${key}Selected`] = addon.selected;
      return acc;
    }, {}),
    
    // Booking Details
    appointmentDay: appointmentDay,
    appointmentDate: data.bookingDetails?.selectedDate || '',
    appointmentTime: appointmentTime,
    additionalNotes: data.bookingDetails?.additionalNotes || '',
    
    // Booked Services Array
    booked_services_array: bookedServicesArray,
    
    // Metadata
    timestamp: new Date().toISOString(),
    source: 'kings-window-cleaning-quote-form',
    // Add continue URL for "continue from where you left off" feature
    continueUrl
  };
}

/**
 * Sends complete form data to the lead connector webhook in structured format
 * @param data - The complete form data to send
 * @returns Promise<ApiResponse> - The API response
 */
export async function sendCompleteFormData(data: CompleteFormData): Promise<ApiResponse> {
  try {
    // Use unified payload
    const contactData: ContactFormData = {
      fullName: data.contact.fullName,
      phone: data.contact.phone,
      email: data.contact.email,
      hearAboutUs: data.contact.hearAboutUs,
      referralName: data.contact.referralName,
      propertyType: data.contact.propertyType,
      consent: data.contact.consent
    };
    
    const structuredData = createUnifiedPayload(data, contactData);

    const response = await fetch(`${PROXY_URL}?step=finalSubmission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(structuredData),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP error! status: ${response.status}`)
      throw new Error(errorText || `HTTP error! status: ${response.status}`)
    }

    let result: Record<string, unknown> = {}
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      try {
        result = (await response.json()) as Record<string, unknown>
      } catch {
        result = { message: 'Request completed successfully' }
      }
    } else {
      const text = await response.text().catch(() => '')
      result = { message: text || 'Request completed successfully' }
    }
    
    return {
      success: true,
      message: 'Form data sent successfully',
      ...result
    }
  } catch (error) {
    console.error('Error sending form data:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Sends step-specific form data to the appropriate webhook
 * NOW SENDS COMPLETE UNIFIED PAYLOAD TO EVERY WEBHOOK
 */
export async function sendStepData(step: Step, data: any, contactData?: ContactFormData | null): Promise<ApiResponse> {
  console.log(`Sending data for step: ${step}`, data);
  
  // Skip API request for residentialType if value is bungalow or townhouse
  if (step === 'residentialType' && (data.residentialType === 'bungalow' || data.residentialType === 'townhouse')) {
    console.log(`Skipping API request for residentialType: ${data.residentialType}`);
    return {
      success: true,
      message: `Skipped API request for residentialType: ${data.residentialType}`
    }
  }

  if (DISPLAY_ONLY_STEPS.has(step) || !WEBHOOK_STEPS.has(step)) {
    return {
      success: true,
      message: `Step data processed (no webhook configured for ${step})`
    }
  }
  
  try {
    const payload = createUnifiedPayload(data, contactData ?? null);
    payload.step = step;
    
    console.log(`Making API call to ${PROXY_URL}?step=${step} with unified payload:`, payload);
    
    const response = await fetch(`${PROXY_URL}?step=${step}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    console.log(`API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP error! status: ${response.status}`)
      throw new Error(errorText || `HTTP error! status: ${response.status}`)
    }

    let result: Record<string, unknown> = {}
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      try {
        result = (await response.json()) as Record<string, unknown>
      } catch {
        result = { message: 'Request completed successfully' }
      }
    } else {
      const text = await response.text().catch(() => '')
      result = { message: text || 'Request completed successfully' }
    }
    
    return {
      success: true,
      message: `${step} data sent successfully`,
      ...result
    }
  } catch (error) {
    console.error(`Error sending ${step} data:`, error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Sends contact information to the contact webhook
 */
export async function sendContactData(data: ContactFormData): Promise<ApiResponse> {
  // Pass contact data properly so it gets included in unified payload
  return sendStepData('contact', { contact: data }, data)
}
