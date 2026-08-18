/**
 * The single flat payload every Lead Connector (GHL) webhook receives.
 *
 * Deliberately free of browser and store dependencies so `api/submission.ts` can
 * import it and rebuild the exact same payload server-side with server-computed
 * prices. Keep every import in this module (and everything it reaches) relative —
 * the `@/` alias does not resolve inside the Vercel Node runtime.
 */
import { CONSERVATORY_ROOF_PANELS_UNKNOWN_LABEL } from './conservatory-roof-copy'
import { formatAppointmentTime, getServiceDaysForPostcode } from './scheduling'
import { calculateCost, type ConservatoryRoofPricingInput, type HouseKind } from './costing-calc'

export interface ContactFormData {
  fullName: string
  phone: string
  email: string
  hearAboutUs?: string
  referralName?: string
  propertyType: 'residential' | 'commercial'
  consent: boolean
}

/** Extras attached to the payload that do not come out of the form data itself. */
export interface UnifiedPayloadOptions {
  /** `?token=` resume link handed to GHL workflows/emails. */
  continueUrl?: string
  /** Supabase submission token — lands in the `{{contact.webform_token}}` custom field. */
  webformToken?: string | null
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

/** Match `hasConservatory === true | 'yes'` used in payloads (CRM / URL restore may use booleans). */
function hasConservatoryYes(raw: unknown): boolean {
  if (raw === true) return true
  if (typeof raw === 'string') return raw.toLowerCase() === 'yes'
  return false
}

/**
 * Conservatory roof pricing for per-panel webhook / recalculation
 */
function conservatoryRoofPricingFromFormData(data: any): ConservatoryRoofPricingInput | null {
  const pd = data.propertyDetails as
    | { hasConservatory?: unknown; conservatoryRoof?: ConservatoryRoofPricingInput | null | undefined }
    | undefined
  if (hasConservatoryYes(pd?.hasConservatory)) {
    return pd?.conservatoryRoof ?? null
  }
  const lu = data.largeUnusualAddress as
    | { hasConservatory?: unknown; conservatoryRoof?: ConservatoryRoofPricingInput | null | undefined }
    | undefined
    | null
  if (hasConservatoryYes(lu?.hasConservatory)) {
    return lu?.conservatoryRoof ?? null
  }
  return null
}

/**
 * Helper function to create unified payload with ALL fields
 * This ensures every webhook gets the complete data structure
 */
export function createUnifiedPayload(
  data: any,
  contactData: ContactFormData | null,
  options: UnifiedPayloadOptions = {},
): any {
  const { continueUrl = '', webformToken = null } = options

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
    hasConservatoryYes(data.propertyDetails?.hasConservatory) ||
    hasConservatoryYes(data.largeUnusualAddress?.hasConservatory)

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
        ? CONSERVATORY_ROOF_PANELS_UNKNOWN_LABEL
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
    // Supabase submission token → `{{contact.webform_token}}` in GHL
    webform_token: webformToken ?? '',
    // Continue URL for "continue from where you left off" — now `?token=…`
    continueUrl
  };
}
