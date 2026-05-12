/**
 * Lead URL Management
 * 
 * Handles human-readable URL parameters for lead capture from FB/social media.
 * Supports both parsing incoming leads AND generating continue URLs.
 * 
 * Example URL:
 * ?name=John%20Smith&email=john@email.com&phone=07123456789&property_type=residential&house_type=detached&bedrooms=3&extension=no&conservatory=no
 */

import type { ContactFormValues } from '@/steps/step-0/ContactStep';
import type { CommonPropertyDetailsValues } from '@/steps/step-2-residential/CommonPropertyDetailsStep';
import type { ResidentialType } from '@/steps/step-2-residential/ResidentialTypeStep';
import type { BungalowKind } from '@/steps/step-2-residential/bungalow/BungalowTypeStep';
import type { TownhouseKind } from '@/steps/step-2-residential/townhouse/TownhouseTypeStep';
import type { BusinessDetailsValues } from '@/steps/step-3-commercial/BusinessDetailsStep';
import type { PropertyType, YesNo } from '@/types';
import type { Step } from '@/stores/formStore';

// ============ URL PARAMETER KEYS ============

export const URL_PARAM_KEYS = {
  // Contact info
  name: 'name',
  phone: 'phone',
  email: 'email',
  propertyType: 'property_type',
  hearAboutUs: 'hear_about_us',
  referralName: 'referral_name',
  
  // Residential type
  houseType: 'house_type',
  bungalowType: 'bungalow_type',
  townhouseType: 'townhouse_type',
  
  // Property details
  bedrooms: 'bedrooms',
  extension: 'extension',
  conservatory: 'conservatory',
  conservatoryRoofPanels: 'conservatory_roof_panels',
  
  // Commercial details
  businessName: 'business_name',
  buildingType: 'building_type',
  cleaningTypes: 'cleaning_types',
  address: 'address',
  city: 'city',
  postcode: 'postcode',
} as const;

// ============ VALUE MAPPINGS ============

// Map URL values to internal values (handles variations in input)
const HOUSE_TYPE_MAP: Record<string, ResidentialType> = {
  'terraced': 'terraced',
  'terrace': 'terraced',
  'semi_detached': 'semi_detached',
  'semi-detached': 'semi_detached',
  'semidetached': 'semi_detached',
  'semi': 'semi_detached',
  'detached': 'detached',
  'bungalow': 'bungalow',
  'townhouse': 'townhouse',
  'town_house': 'townhouse',
  'flat': 'flat',
  'maisonette': 'flat',
  'flat_maisonette': 'flat',
  'flat/maisonette': 'flat',
  'large_unusual': 'large_unusual',
  'large': 'large_unusual',
  'unusual': 'large_unusual',
};

const SUB_TYPE_MAP: Record<string, BungalowKind | TownhouseKind> = {
  'terraced': 'terraced',
  'terrace': 'terraced',
  'semi_detached': 'semi_detached',
  'semi-detached': 'semi_detached',
  'semidetached': 'semi_detached',
  'semi': 'semi_detached',
  'detached': 'detached',
};

const PROPERTY_TYPE_MAP: Record<string, PropertyType> = {
  'residential': 'residential',
  'commercial': 'commercial',
};

const YES_NO_MAP: Record<string, YesNo> = {
  'yes': 'yes',
  'true': 'yes',
  '1': 'yes',
  'no': 'no',
  'false': 'no',
  '0': 'no',
};

// Building types for commercial (normalized to match form options)
const BUILDING_TYPE_MAP: Record<string, string> = {
  'office': 'Office',
  'retail': 'Retail',
  'restaurant': 'Restaurant/Café',
  'cafe': 'Restaurant/Café',
  'restaurant/cafe': 'Restaurant/Café',
  'restaurant/café': 'Restaurant/Café',
  'industrial': 'Industrial/Warehouse',
  'warehouse': 'Industrial/Warehouse',
  'industrial/warehouse': 'Industrial/Warehouse',
  'healthcare': 'Healthcare',
  'education': 'Education',
  'other': 'Other',
};

// Valid cleaning types
const VALID_CLEANING_TYPES = [
  'Regular window cleaning',
  'One-off deep clean',
  'Post-construction cleaning',
  'Gutter cleaning',
  'Facade cleaning',
  'Other',
];

// Cleaning type mapping (normalized to match form options)
const CLEANING_TYPE_MAP: Record<string, string> = {
  'regular': 'Regular window cleaning',
  'regular window cleaning': 'Regular window cleaning',
  'window cleaning': 'Regular window cleaning',
  'one-off': 'One-off deep clean',
  'one-off deep clean': 'One-off deep clean',
  'deep clean': 'One-off deep clean',
  'post-construction': 'Post-construction cleaning',
  'post-construction cleaning': 'Post-construction cleaning',
  'construction': 'Post-construction cleaning',
  'gutter': 'Gutter cleaning',
  'gutter cleaning': 'Gutter cleaning',
  'gutters': 'Gutter cleaning',
  'facade': 'Facade cleaning',
  'facade cleaning': 'Facade cleaning',
  'other': 'Other',
};

// ============ PARSED STATE INTERFACE ============

export interface LeadUrlState {
  // Contact data
  contactData: Partial<ContactFormValues> | null;
  
  // Property type (from contact form)
  propertyType: PropertyType | null;
  
  // Residential type selection
  residentialType: ResidentialType | null;
  bungalowKind: BungalowKind | null;
  townhouseKind: TownhouseKind | null;
  
  // Property details (residential)
  propertyDetails: Partial<CommonPropertyDetailsValues> | null;
  
  // Business details (commercial)
  businessDetails: Partial<BusinessDetailsValues> | null;
}

// ============ PARSE URL PARAMS ============

/**
 * Parse URL parameters into lead state
 */
export function parseLeadUrl(): LeadUrlState | null {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  
  // Check if we have any lead params (not the compressed 'c' param)
  const hasLeadParams = Array.from(params.keys()).some(key => 
    Object.values(URL_PARAM_KEYS).includes(key as any)
  );
  
  if (!hasLeadParams) {
    return null;
  }
  
  const state: LeadUrlState = {
    contactData: null,
    propertyType: null,
    residentialType: null,
    bungalowKind: null,
    townhouseKind: null,
    propertyDetails: null,
    businessDetails: null,
  };
  
  // Parse contact data
  const name = params.get(URL_PARAM_KEYS.name);
  const phone = params.get(URL_PARAM_KEYS.phone);
  const email = params.get(URL_PARAM_KEYS.email);
  const propertyTypeParam = params.get(URL_PARAM_KEYS.propertyType);
  const hearAboutUs = params.get(URL_PARAM_KEYS.hearAboutUs);
  const referralName = params.get(URL_PARAM_KEYS.referralName);
  
  if (name || phone || email || propertyTypeParam) {
    state.contactData = {};
    if (name) state.contactData.fullName = name;
    if (phone) state.contactData.phone = phone;
    if (email) state.contactData.email = email;
    if (hearAboutUs) state.contactData.hearAboutUs = hearAboutUs;
    if (referralName) state.contactData.referralName = referralName;
    
    if (propertyTypeParam) {
      const normalizedType = propertyTypeParam.toLowerCase().trim();
      const mappedType = PROPERTY_TYPE_MAP[normalizedType];
      if (mappedType) {
        state.contactData.propertyType = mappedType;
        state.propertyType = mappedType;
      }
    }
  }
  
  // Parse house type
  const houseType = params.get(URL_PARAM_KEYS.houseType);
  if (houseType) {
    const normalizedType = houseType.toLowerCase().trim().replace(/\s+/g, '_');
    const mappedType = HOUSE_TYPE_MAP[normalizedType];
    if (mappedType) {
      state.residentialType = mappedType;
    }
  }
  
  // Parse bungalow/townhouse sub-type
  const bungalowType = params.get(URL_PARAM_KEYS.bungalowType);
  const townhouseType = params.get(URL_PARAM_KEYS.townhouseType);
  
  if (bungalowType) {
    const normalizedType = bungalowType.toLowerCase().trim().replace(/\s+/g, '_');
    const mappedType = SUB_TYPE_MAP[normalizedType];
    if (mappedType) {
      state.bungalowKind = mappedType as BungalowKind;
    }
  }
  
  if (townhouseType) {
    const normalizedType = townhouseType.toLowerCase().trim().replace(/\s+/g, '_');
    const mappedType = SUB_TYPE_MAP[normalizedType];
    if (mappedType) {
      state.townhouseKind = mappedType as TownhouseKind;
    }
  }
  
  // Parse property details
  const bedrooms = params.get(URL_PARAM_KEYS.bedrooms);
  const extension = params.get(URL_PARAM_KEYS.extension);
  const conservatory = params.get(URL_PARAM_KEYS.conservatory);
  
  if (bedrooms || extension || conservatory) {
    state.propertyDetails = {};
    
    if (bedrooms) {
      const bedroomNum = parseInt(bedrooms, 10);
      if (!isNaN(bedroomNum) && bedroomNum >= 1 && bedroomNum <= 6) {
        state.propertyDetails.bedrooms = bedroomNum;
      }
    }
    
    if (extension) {
      const mapped = YES_NO_MAP[extension.toLowerCase().trim()];
      if (mapped) state.propertyDetails.hasExtension = mapped;
    }
    
    if (conservatory) {
      const mapped = YES_NO_MAP[conservatory.toLowerCase().trim()];
      if (mapped) state.propertyDetails.hasConservatory = mapped;
    }

    const conservatoryRoofPanelsRaw = params.get(URL_PARAM_KEYS.conservatoryRoofPanels);
    if (conservatoryRoofPanelsRaw !== null && conservatoryRoofPanelsRaw !== '' && state.propertyDetails.hasConservatory === 'yes') {
      const raw = conservatoryRoofPanelsRaw.trim().toLowerCase();
      if (raw === 'unknown') {
        state.propertyDetails.conservatoryRoof = { status: 'unknown' };
      } else {
        const n = parseInt(raw, 10);
        if (!isNaN(n) && n >= 1 && n <= 120) {
          state.propertyDetails.conservatoryRoof = { status: 'count', panelCount: n };
        }
      }
    }
  }
  
  // Parse commercial/business details
  const businessName = params.get(URL_PARAM_KEYS.businessName);
  const buildingType = params.get(URL_PARAM_KEYS.buildingType);
  const cleaningTypes = params.get(URL_PARAM_KEYS.cleaningTypes);
  const address = params.get(URL_PARAM_KEYS.address);
  const city = params.get(URL_PARAM_KEYS.city);
  const postcode = params.get(URL_PARAM_KEYS.postcode);
  
  if (businessName || buildingType || cleaningTypes || address || city || postcode) {
    state.businessDetails = {};
    
    if (businessName) {
      state.businessDetails.businessName = businessName;
    }
    
    if (buildingType) {
      const normalizedType = buildingType.toLowerCase().trim();
      const mappedType = BUILDING_TYPE_MAP[normalizedType];
      if (mappedType) {
        state.businessDetails.buildingType = mappedType;
      } else {
        // If not in map, use as-is (for direct values like "Office")
        state.businessDetails.buildingType = buildingType;
      }
    }
    
    if (cleaningTypes) {
      // Parse comma-separated cleaning types
      const types = cleaningTypes.split(',').map(t => t.trim()).filter(Boolean);
      const mappedTypes: string[] = [];
      
      for (const type of types) {
        const normalizedType = type.toLowerCase().trim();
        const mappedType = CLEANING_TYPE_MAP[normalizedType];
        if (mappedType && !mappedTypes.includes(mappedType)) {
          mappedTypes.push(mappedType);
        } else if (VALID_CLEANING_TYPES.includes(type) && !mappedTypes.includes(type)) {
          // Direct match with valid type
          mappedTypes.push(type);
        }
      }
      
      if (mappedTypes.length > 0) {
        state.businessDetails.cleaningTypes = mappedTypes;
      }
    }
    
    if (address) {
      state.businessDetails.address1 = address;
    }
    
    if (city) {
      state.businessDetails.city = city;
    }
    
    if (postcode) {
      state.businessDetails.postcode = postcode;
    }
  }
  
  return state;
}

// ============ DETERMINE TARGET STEP ============

/**
 * Determine which step to auto-advance to based on the lead data present
 * Returns the FIRST INCOMPLETE step
 */
export function determineTargetStep(state: LeadUrlState): Step {
  // Check if contact data is complete
  const hasCompleteContact = state.contactData?.fullName && 
    state.contactData?.phone && 
    state.contactData?.email && 
    state.contactData?.propertyType;
  
  if (!hasCompleteContact) {
    return 'contact';
  }
  
  // If commercial, check if business details are complete
  if (state.propertyType === 'commercial') {
    const hasCompleteBusinessDetails = state.businessDetails?.businessName &&
      state.businessDetails?.buildingType &&
      state.businessDetails?.cleaningTypes &&
      state.businessDetails.cleaningTypes.length > 0 &&
      state.businessDetails?.address1 &&
      state.businessDetails?.city &&
      state.businessDetails?.postcode;
    
    if (hasCompleteBusinessDetails) {
      // All business details complete - go to thank you
      // Note: The form still needs to be submitted, so we go to commercialDetails
      // but with all fields pre-filled
      return 'commercialDetails';
    }
    
    return 'commercialDetails';
  }
  
  // If no residential type, go to residential type selection
  if (!state.residentialType) {
    return 'residentialType';
  }
  
  // Handle special cases
  if (state.residentialType === 'flat') {
    return 'residentialFlatNotSupported';
  }
  
  if (state.residentialType === 'large_unusual') {
    return 'residentialLargePropertyDetails';
  }
  
  // For bungalow, check if we have the sub-type
  if (state.residentialType === 'bungalow' && !state.bungalowKind) {
    return 'bungalowTypeMobile';
  }
  
  // For townhouse, check if we have the sub-type
  if (state.residentialType === 'townhouse' && !state.townhouseKind) {
    return 'townhouseTypeMobile';
  }
  
  // Check if property details are complete
  const hasCompleteDetails =
    state.propertyDetails?.bedrooms !== undefined &&
    state.propertyDetails?.hasExtension !== undefined &&
    state.propertyDetails?.hasConservatory !== undefined &&
    (state.propertyDetails.hasConservatory !== 'yes' ||
      !!state.propertyDetails.conservatoryRoof);
  
  if (!hasCompleteDetails) {
    return 'propertyDetails';
  }
  
  // All data complete, go to frequency/quote step
  return 'residentialFrequency';
}

// ============ GENERATE CONTINUE URL ============

/**
 * Generate a human-readable continue URL from form state
 */
export function generateLeadContinueUrl(formState: {
  contactData: ContactFormValues | null;
  propertyType: PropertyType | null;
  residentialType: ResidentialType | null;
  bungalowKind: BungalowKind | null;
  townhouseKind: TownhouseKind | null;
  propertyDetails: CommonPropertyDetailsValues | null;
  businessDetails?: BusinessDetailsValues | null;
}): string {
  const url = new URL(window.location.origin + window.location.pathname);
  
  // Add contact data
  if (formState.contactData) {
    if (formState.contactData.fullName) {
      url.searchParams.set(URL_PARAM_KEYS.name, formState.contactData.fullName);
    }
    if (formState.contactData.phone) {
      url.searchParams.set(URL_PARAM_KEYS.phone, formState.contactData.phone);
    }
    if (formState.contactData.email) {
      url.searchParams.set(URL_PARAM_KEYS.email, formState.contactData.email);
    }
    if (formState.contactData.propertyType) {
      url.searchParams.set(URL_PARAM_KEYS.propertyType, formState.contactData.propertyType);
    }
    if (formState.contactData.hearAboutUs) {
      url.searchParams.set(URL_PARAM_KEYS.hearAboutUs, formState.contactData.hearAboutUs);
    }
    if (formState.contactData.referralName) {
      url.searchParams.set(URL_PARAM_KEYS.referralName, formState.contactData.referralName);
    }
  }
  
  // Add residential type
  if (formState.residentialType) {
    url.searchParams.set(URL_PARAM_KEYS.houseType, formState.residentialType);
  }
  
  // Add bungalow/townhouse sub-type
  if (formState.bungalowKind) {
    url.searchParams.set(URL_PARAM_KEYS.bungalowType, formState.bungalowKind);
  }
  if (formState.townhouseKind) {
    url.searchParams.set(URL_PARAM_KEYS.townhouseType, formState.townhouseKind);
  }
  
  // Add property details (residential)
  if (formState.propertyDetails) {
    if (formState.propertyDetails.bedrooms !== undefined) {
      url.searchParams.set(URL_PARAM_KEYS.bedrooms, String(formState.propertyDetails.bedrooms));
    }
    if (formState.propertyDetails.hasExtension) {
      url.searchParams.set(URL_PARAM_KEYS.extension, formState.propertyDetails.hasExtension);
    }
    if (formState.propertyDetails.hasConservatory) {
      url.searchParams.set(URL_PARAM_KEYS.conservatory, formState.propertyDetails.hasConservatory);
    }
    if (
      formState.propertyDetails.hasConservatory === 'yes' &&
      formState.propertyDetails.conservatoryRoof
    ) {
      const cr = formState.propertyDetails.conservatoryRoof;
      url.searchParams.set(
        URL_PARAM_KEYS.conservatoryRoofPanels,
        cr.status === 'unknown' ? 'unknown' : String(cr.panelCount),
      );
    }
  }
  
  // Add business details (commercial)
  if (formState.businessDetails) {
    if (formState.businessDetails.businessName) {
      url.searchParams.set(URL_PARAM_KEYS.businessName, formState.businessDetails.businessName);
    }
    if (formState.businessDetails.buildingType) {
      url.searchParams.set(URL_PARAM_KEYS.buildingType, formState.businessDetails.buildingType);
    }
    if (formState.businessDetails.cleaningTypes && formState.businessDetails.cleaningTypes.length > 0) {
      url.searchParams.set(URL_PARAM_KEYS.cleaningTypes, formState.businessDetails.cleaningTypes.join(','));
    }
    if (formState.businessDetails.address1) {
      url.searchParams.set(URL_PARAM_KEYS.address, formState.businessDetails.address1);
    }
    if (formState.businessDetails.city) {
      url.searchParams.set(URL_PARAM_KEYS.city, formState.businessDetails.city);
    }
    if (formState.businessDetails.postcode) {
      url.searchParams.set(URL_PARAM_KEYS.postcode, formState.businessDetails.postcode);
    }
  }
  
  return url.toString();
}

// ============ CLEAR LEAD URL PARAMS ============

/**
 * Remove lead parameters from URL (call after restoring state)
 */
export function clearLeadUrlParams(): void {
  const url = new URL(window.location.href);
  
  // Remove all lead params
  Object.values(URL_PARAM_KEYS).forEach(key => {
    url.searchParams.delete(key);
  });
  
  window.history.replaceState({}, '', url.toString());
}
