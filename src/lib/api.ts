// API service for sending form data to external webhooks
import { getServiceDaysForPostcode } from '@/lib/scheduling'
import type { Step } from '@/stores/formStore'

// API endpoints for each step of the form
export const API_ENDPOINTS = {
  // Contact information step
  contact: 'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/6e0b2a42-77ba-4bfa-a83b-3b4b3d130e37',
  
  // Residential type selection
  residentialType: 'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/QtSbcCDrllKjMHuCfCZr',
  // Property type details
  bungalowType: 'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/QtSbcCDrllKjMHuCfCZr',
  bungalowTypeMobile: 'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/QtSbcCDrllKjMHuCfCZr',
  townhouseType: 'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/QtSbcCDrllKjMHuCfCZr',
  townhouseTypeMobile: 'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/QtSbcCDrllKjMHuCfCZr',


  // Property details
  propertyDetails: 'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/VgZnBHG8l0C1QBSBJIv3',
  

  residentialFrequency: 'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/FyK4jb9ilfkJJ7nRPH7p',


  residentialBook: 'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/FcRKc7hsELqvoqlii0sn',
  finalSubmission: 'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/FcRKc7hsELqvoqlii0sn',


  residentialLargeAddress: 'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/bNH63ZL2RTHDf3ge2Ikr',
  residentialLargePropertyDetails: 'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/VgZnBHG8l0C1QBSBJIv3',
  commercialDetails: 'https://services.leadconnectorhq.com/hooks/zfgtbqDWRUrkaHTmvrO7/webhook-trigger/bNH63ZL2RTHDf3ge2Ikr',


  residentialFlatNotSupported: 'https://api.example.com/kings-quote/flat-not-supported',
  residentialThanks: 'https://api.example.com/kings-quote/residential-thanks',
  
  
  // Quote and frequency
  residentialQuote: 'https://api.example.com/kings-quote/quote',
  
  
  
  // Commercial
  
  commercialThanks: 'https://api.example.com/kings-quote/commercial-thanks',
  
  // Thank you page
  thankYou: 'https://api.example.com/kings-quote/thank-you',
  
  
}

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
    hasLoftConversion?: string
    hasExtension: string
    hasConservatory: string
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
    extras: { label: string; price: number }[]
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
  
  // Format address
  const address = data.bookingDetails 
    ? `${data.bookingDetails.address1}, ${data.bookingDetails.city}`
    : data.largeUnusualAddress
    ? `${data.largeUnusualAddress.address1}, ${data.largeUnusualAddress.city}`
    : '';
  
  // Get appointment details
  const appointmentDay = data.bookingDetails ? getAppointmentDay(data.bookingDetails.postcode) : '';
  const appointmentTime = data.bookingDetails?.timePreference === 'morning' ? 'AM' : 'PM';
  
  // Get base pricing options
  const basePricingOptions = data.residentialQuoteResult ? {
    "6 weekly": data.residentialQuoteResult.schedule.find((s: any) => s.label === '6-weekly')?.price || 0,
    "8 weekly": data.residentialQuoteResult.schedule.find((s: any) => s.label === '8-weekly')?.price || 0,
    "12 weekly": data.residentialQuoteResult.schedule.find((s: any) => s.label === '12-weekly')?.price || 0,
    "One-off": data.residentialQuoteResult.schedule.find((s: any) => s.label === 'One-off')?.price || 0
  } : {
    "6 weekly": 0,
    "8 weekly": 0,
    "12 weekly": 0,
    "One-off": 0
  };
  
  // Format selected frequency
  const selectedFrequency = data.residentialFrequency?.frequency;
  const selectedFrequencyLabel = selectedFrequency === null 
    ? '' 
    : selectedFrequency === 'one-off' 
      ? 'One-off' 
      : `${selectedFrequency} weekly`;
  const selectedFrequencyPrice = selectedFrequency === null 
    ? 0 
    : (data.residentialQuoteResult?.basePrice || 0);
  
  // Helper function to get addon price
  const getAddonPrice = (label: string): number => {
    if (!data.residentialQuoteResult) return 0;
    const price = data.residentialQuoteResult.extras.find((e: any) => e.label === label)?.price;
    if (price !== undefined && price > 0) {
      return price;
    }
    // Standard prices fallback
    switch(label) {
      case 'Ad Hoc Gutter Clearance': return 160;
      case 'Ad Hoc Fascia Soffit & Gutter Clean': return 160;
      case 'Ad Hoc Conservatory Roof Clean - External': return 160;
      case 'Ad Hoc Conservatory Roof Clean - Internal': return 160;
      case 'Ad Hoc Internal Window Clean': return 51;
      default: return 0;
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
  
  // Create booked services array
  const bookedServicesArray = (() => {
    const services = [];
    
    // Add main frequency service if exists
    if (data.residentialFrequency?.frequency) {
      const freq = data.residentialFrequency.frequency;
      const price = data.residentialQuoteResult?.basePrice || 0;
      if (freq === 6) services.push(`6 week external window clean - £${price}`);
      else if (freq === 8) services.push(`8 week external window clean - £${price}`);
      else if (freq === 12) services.push(`12 week external window clean - £${price}`);
      else if (freq === 'one-off') services.push(`One-off external window clean - £${price}`);
    }
    
    // Add selected addons
    if (data.residentialFrequency?.addons) {
      const addons = data.residentialFrequency.addons;
      const extras = data.residentialQuoteResult?.extras || [];
      
      if (addons.adHocInternalClean) {
        const price = extras.find((e: any) => e.label === 'Ad Hoc Internal Window Clean')?.price || 0;
        services.push(`Internal Window Cleaning - £${price}`);
      }
      if (addons.gutterClear) {
        const price = extras.find((e: any) => e.label === 'Ad Hoc Gutter Clearance')?.price || 0;
        services.push(`Gutter Clearance - £${price}`);
      }
      if (addons.fasciaClean) {
        const price = extras.find((e: any) => e.label === 'Ad Hoc Fascia Soffit & Gutter Clean')?.price || 0;
        services.push(`Fascia Soffit & Gutter Washing - £${price}`);
      }
      if (addons.conservatoryRoofCleanExternal) {
        const price = extras.find((e: any) => e.label === 'Ad Hoc Conservatory Roof Clean - External')?.price || 0;
        services.push(`Conservatory Roof Cleaning - External - £${price}`);
      }
      if (addons.conservatoryRoofCleanInternal) {
        const price = extras.find((e: any) => e.label === 'Ad Hoc Conservatory Roof Clean - Internal')?.price || 0;
        services.push(`Conservatory Roof Cleaning - Internal - £${price}`);
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
    "number of bedrooms": data.propertyDetails?.bedrooms || 0,
    "do you have loft conversion": data.propertyDetails?.hasLoftConversion || '',
    extension: data.propertyDetails?.hasExtension || '',
    conservatory: data.propertyDetails?.hasConservatory || '',
    
    // Large/Unusual or Commercial Address
    address: address,
    postcode: data.bookingDetails?.postcode || data.largeUnusualAddress?.postcode || '',
    
    // Commercial Details
    "business name": data.businessDetails?.businessName || '',
    "building type": data.businessDetails?.buildingType || '',
    "cleaning types": data.businessDetails?.cleaningTypes ? data.businessDetails.cleaningTypes.join(', ') : '',
    
    // Frequency & Quote Information
    ...basePricingOptions,
    "selected frequency": selectedFrequencyLabel,
    "selected frequency price": selectedFrequencyPrice,
    
    // Addon Information
    ...Object.keys(addonData).reduce((acc: any, key: string) => {
      const addon = addonData[key];
      acc[key] = addon.selected ? `${addon.name} - £${addon.price}` : '';
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
    source: 'kings-window-cleaning-quote-form'
  };
}

/**
 * Sends complete form data to the lead connector webhook in structured format
 * @param data - The complete form data to send
 * @returns Promise<ApiResponse> - The API response
 */
export async function sendCompleteFormData(data: CompleteFormData): Promise<ApiResponse> {
  const webhookUrl = API_ENDPOINTS.finalSubmission
  
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

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(structuredData),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    
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
  
  const webhookUrl = API_ENDPOINTS[step]
  console.log(`Webhook URL for step ${step}:`, webhookUrl);
  
  if (!webhookUrl) {
    console.error(`No webhook URL defined for step: ${step}`)
    return {
      success: false,
      error: `No webhook URL defined for step: ${step}`
    }
  }
  
  try {
    // Create unified payload with ALL fields for every webhook
    const payload = createUnifiedPayload(data, contactData);
    
    // Add step information
    payload.step = step;
    
    console.log(`Making API call to ${webhookUrl} with unified payload:`, payload);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    console.log(`API response status: ${response.status}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    
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