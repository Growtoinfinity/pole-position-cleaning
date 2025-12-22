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
 * Sends contact form data to the lead connector webhook
 * @param data - The contact form data to send
 * @returns Promise<ApiResponse> - The API response
 */
export async function sendContactData(data: ContactFormData): Promise<ApiResponse> {
  const webhookUrl = API_ENDPOINTS.contact
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Map our form data to the expected webhook format
        fullName: data.fullName,
        phone: data.phone,
        email: data.email,
        hearAboutUs: data.hearAboutUs,
        referralName: data.referralName,
        propertyType: data.propertyType,
        consent: data.consent,
        // Add timestamp for tracking
        timestamp: new Date().toISOString(),
        // Add source identifier
        source: 'kings-window-cleaning-quote-form',
        // Add step identifier
        step: 'contact'
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    
    return {
      success: true,
      message: 'Contact data sent successfully',
      ...result
    }
  } catch (error) {
    console.error('Error sending contact data:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Sends complete form data to the lead connector webhook in structured format
 * @param data - The complete form data to send
 * @returns Promise<ApiResponse> - The API response
 */
export async function sendCompleteFormData(data: CompleteFormData): Promise<ApiResponse> {
  const webhookUrl = API_ENDPOINTS.finalSubmission
  
  try {
    // Helper function to convert day number to day name
    const getDayName = (dayNum: number): string => {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return days[dayNum] || '';
    };
    
    // Get appointment day based on postcode
    const getAppointmentDay = (postcode: string): string => {
      // Import functions from scheduling.ts
      const { getServiceDaysForPostcode } = require('@/lib/scheduling');
      
      // Get service days for this postcode
      const serviceDays = getServiceDaysForPostcode(postcode);
      
      // If no service days found, return empty string
      if (!serviceDays || serviceDays.length === 0) {
        return '';
      }
      
      // Return the first service day name
      return getDayName(serviceDays[0]);
    };
    
    // Format address
    const address = data.bookingDetails ? 
      `${data.bookingDetails.address1}, ${data.bookingDetails.city}` : '';
    
    // Get appointment day
    const appointmentDay = data.bookingDetails ? 
      getAppointmentDay(data.bookingDetails.postcode) : '';
    
    // Format appointment time
    const appointmentTime = data.bookingDetails?.timePreference === 'morning' ? 'AM' : 'PM';
    
    // Use the same format as residentialBook API
    const structuredData = {
      email: data.contact.email,
      address,
      postcode: data.bookingDetails?.postcode || '',
      appointmentDay,
      appointmentDate: data.bookingDetails?.selectedDate || '',
      appointmentTime,
      additionalNotes: data.bookingDetails?.additionalNotes || '',
      timestamp: new Date().toISOString(),
      source: 'kings-window-cleaning-quote-form'
    }

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
      message: 'Complete form data sent successfully',
      ...result
    }
  } catch (error) {
    console.error('Error sending complete form data:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Helper function to format typeOfHouse value correctly
 * @param residentialType - The residential type
 * @param subType - The sub-type (bungalowKind or townhouseKind)
 * @returns string - The formatted typeOfHouse value
 */
function formatTypeOfHouse(residentialType: string | null, subType: string | null): string {
  // For townhouse or bungalow, use the subType (terraced/semi-detached/detached)
  if ((residentialType === 'townhouse' || residentialType === 'bungalow') && subType) {
    // Convert snake_case to kebab-case for consistency
    return subType.replace('_', '-');
  }
  
  // For direct house types (semi_detached, terraced, detached)
  // Convert snake_case to kebab-case for consistency
  return residentialType ? residentialType.replace('_', '-') : '';
}

/**
 * Sends form data for a specific step to the appropriate webhook
 * @param step - The form step
 * @param data - The data to send
 * @param contactData - The contact information to include with every API call
 * @returns Promise<ApiResponse> - The API response
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
    let payload;
    
    // Special handling for step 2 APIs
    const isStep2Api = ['residentialType', 'bungalowType', 'bungalowTypeMobile', 'townhouseType', 'townhouseTypeMobile'].includes(step);
    
    // Special handling for property details API
    const isPropertyDetailsApi = step === 'propertyDetails';
    
    // Special handling for frequency API
    const isFrequencyApi = step === 'residentialFrequency';
    
    // Special handling for booking API
    const isBookingApi = step === 'residentialBook';
    
    // Special handling for commercial details API
    const isCommercialDetailsApi = step === 'commercialDetails';
    
    // Special handling for residential large address API
    const isResidentialLargeAddressApi = step === 'residentialLargeAddress';
    
    // Special handling for residential large property details API
    const isResidentialLargePropertyDetailsApi = step === 'residentialLargePropertyDetails';
    
    if (isStep2Api && contactData) {
      // For step 2 APIs, only send email and typeOfHouse
      payload = {
        email: contactData.email,
        typeOfHouse: formatTypeOfHouse(data.residentialType || null, 
                                      data.bungalowKind || data.townhouseKind || null),
        timestamp: new Date().toISOString(),
        source: 'kings-window-cleaning-quote-form'
      };
    } else if (isResidentialLargeAddressApi && contactData && data.largeUnusualAddress) {
      // For residential large address API, send email, address, postcode
      
      // Format full address
      const address = `${data.largeUnusualAddress.address1}, ${data.largeUnusualAddress.city}, ${data.largeUnusualAddress.postcode}`;
      
      payload = {
        email: contactData.email,
        address,
        postcode: data.largeUnusualAddress.postcode || '',
        timestamp: new Date().toISOString(),
        source: 'kings-window-cleaning-quote-form'
      };
    } else if (isPropertyDetailsApi && contactData && data.propertyDetails) {
      // For property details API, only send specific fields
      payload = {
        email: contactData.email,
        "do you have loft conversion": data.propertyDetails.hasLoftConversion || 'no',
        extension: data.propertyDetails.hasExtension || 'no',
        conservatory: data.propertyDetails.hasConservatory || 'no',
        "number of bedrooms": data.propertyDetails.bedrooms || 0,
        timestamp: new Date().toISOString(),
        source: 'kings-window-cleaning-quote-form'
      };
    } else if (isResidentialLargePropertyDetailsApi && contactData && data.propertyDetails) {
      // For residential large property details API, flatten the property details object
      payload = {
        email: contactData.email,
        "do you have loft conversion": data.propertyDetails.hasLoftConversion || 'no',
        extension: data.propertyDetails.hasExtension || 'no',
        conservatory: data.propertyDetails.hasConservatory || 'no',
        "number of bedrooms": data.propertyDetails.bedrooms || 0,
        timestamp: new Date().toISOString(),
        source: 'kings-window-cleaning-quote-form'
      };
    } else if (isCommercialDetailsApi && contactData && data.businessDetails) {
      // For commercial details API, send email, business name, address, postcode
      
      // Format full address
      const address = `${data.businessDetails.address1}, ${data.businessDetails.city}, ${data.businessDetails.postcode}`;
      
      payload = {
        email: contactData.email,
        "business name": data.businessDetails.businessName || '',
        "building type": data.businessDetails.buildingType || '',
        "cleaning types": data.businessDetails.cleaningTypes ? data.businessDetails.cleaningTypes.join(', ') : '',
        address,
        postcode: data.businessDetails.postcode || '',
        timestamp: new Date().toISOString(),
        source: 'kings-window-cleaning-quote-form'
      };
    } else if (isBookingApi && contactData && data.bookingDetails) {
      // For booking API, send email, address, postcode, appointment details
      
      // Helper function to convert day number to day name
      const getDayName = (dayNum: number): string => {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[dayNum] || '';
      };
      
      // Get appointment day based on postcode
      const getAppointmentDay = (postcode: string): string => {
        // Get service days for this postcode using the imported function
        const serviceDays = getServiceDaysForPostcode(postcode);
        
        // If no service days found, return empty string
        if (!serviceDays || serviceDays.length === 0) {
          return '';
        }
        
        // Return the first service day name
        return getDayName(serviceDays[0]);
      };
      
      // Format address
      const address = `${data.bookingDetails.address1}, ${data.bookingDetails.city}`;
      
      // Get appointment day
      const appointmentDay = getAppointmentDay(data.bookingDetails.postcode);
      
      // Format appointment time
      const appointmentTime = data.bookingDetails.timePreference === 'morning' ? 'AM' : 'PM';
      
      payload = {
        email: contactData.email,
        address,
        postcode: data.bookingDetails.postcode,
        appointmentDay,
        appointmentDate: data.bookingDetails.selectedDate,
        appointmentTime,
        additionalNotes: data.bookingDetails.additionalNotes || '',
        // Booked Services Array - all services the client selected
        booked_services_array: (() => {
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
        })(),
        timestamp: new Date().toISOString(),
        source: 'kings-window-cleaning-quote-form'
      };
    } else if (isFrequencyApi && contactData && data.residentialFrequency && data.residentialQuoteResult) {
      // For frequency API, send email, all calculated pricing options, and selected options
      
      // Get base pricing options
      const basePricingOptions = {
        "6 weekly": data.residentialQuoteResult.schedule.find((s: {label: string; price: number}) => s.label === '6-weekly')?.price || 0,
        "8 weekly": data.residentialQuoteResult.schedule.find((s: {label: string; price: number}) => s.label === '8-weekly')?.price || 0,
        "12 weekly": data.residentialQuoteResult.schedule.find((s: {label: string; price: number}) => s.label === '12-weekly')?.price || 0,
        "One-off": data.residentialQuoteResult.schedule.find((s: {label: string; price: number}) => s.label === 'One-off')?.price || 0
      };
      
      // Format selected frequency (handle null case for addon-only scenarios)
      const selectedFrequency = data.residentialFrequency.frequency;
      const selectedFrequencyLabel = selectedFrequency === null 
        ? 'Addons Only' 
        : selectedFrequency === 'one-off' 
          ? 'One-off' 
          : `${selectedFrequency} weekly`;
      const selectedFrequencyPrice = selectedFrequency === null 
        ? 0 
        : (data.residentialQuoteResult.basePrice || 0);
      
      // Prepare addon data with standard prices
      const addonData: {
        name: string;
        apiKey: string; // Property name without spaces for API
        price: number;
        selected: boolean;
      }[] = [];
      
      // Helper function to get addon price, ensuring we always get a valid price
      const getAddonPrice = (label: string): number => {
        // First try to get the price from the extras
        const price = data.residentialQuoteResult.extras.find(
          (e: {label: string; price: number}) => e.label === label
        )?.price;
        
        // If we found a valid price and it's not 0, use it
        if (price !== undefined && price > 0) {
          return price;
        }
        
        // Otherwise use standard prices
        switch(label) {
          case 'Ad Hoc Gutter Clearance':
            return 160;
          case 'Ad Hoc Fascia Soffit & Gutter Clean':
            return 160;
          case 'Ad Hoc Conservatory Roof Clean - External':
            return 160;
          case 'Ad Hoc Conservatory Roof Clean - Internal':
            return 160;
          case 'Ad Hoc Internal Window Clean':
            return 51;
          default:
            return 0;
        }
      };
      
      // Helper function removed as we're using hardcoded apiKeys
      
      // Gutter Clearance
      addonData.push({
        name: "Gutter Clearance",
        apiKey: "GutterClearance",
        price: getAddonPrice('Ad Hoc Gutter Clearance'),
        selected: data.residentialFrequency.addons.gutterClear
      });
      
      // Fascia Soffit & Gutter Clean
      addonData.push({
        name: "Fascia Soffit & Gutter Clean",
        apiKey: "FasciaSoffitGutterClean",
        price: getAddonPrice('Ad Hoc Fascia Soffit & Gutter Clean'),
        selected: data.residentialFrequency.addons.fasciaClean
      });
      
      // Conservatory Roof Clean - External
      addonData.push({
        name: "Conservatory Roof Clean - External",
        apiKey: "ConservatoryRoofCleanExternal",
        price: getAddonPrice('Ad Hoc Conservatory Roof Clean - External'),
        selected: data.residentialFrequency.addons.conservatoryRoofCleanExternal
      });
      
      // Conservatory Roof Clean - Internal
      addonData.push({
        name: "Conservatory Roof Clean - Internal",
        apiKey: "ConservatoryRoofCleanInternal",
        price: getAddonPrice('Ad Hoc Conservatory Roof Clean - Internal'),
        selected: data.residentialFrequency.addons.conservatoryRoofCleanInternal
      });
      
      // Internal Window Clean
      addonData.push({
        name: "Internal Window Clean",
        apiKey: "InternalWindowClean",
        price: getAddonPrice('Ad Hoc Internal Window Clean'),
        selected: data.residentialFrequency.addons.adHocInternalClean
      });
      
      // Format pricing options including addons
      const allPricingOptions: Record<string, string | number> = {
        // Replace spaces in base pricing options keys
        "6weekly": basePricingOptions["6 weekly"],
        "8weekly": basePricingOptions["8 weekly"],
        "12weekly": basePricingOptions["12 weekly"],
        "Oneoff": basePricingOptions["One-off"]
      };
      
      // Add all addons to pricing options with numeric values using apiKey (no spaces)
      addonData.forEach(addon => {
        allPricingOptions[addon.apiKey] = addon.price;
      });
      
      // Format selected addons with string values including pound symbol
      const selectedAddons: Record<string, string> = {};
      
      addonData.forEach(addon => {
        if (addon.selected) {
          selectedAddons[addon.apiKey] = `${addon.name} - £${addon.price}`;
        }
      });
      
      payload = {
        email: contactData.email,
        // All calculated pricing options including addons (numeric values)
        "pricing_options": allPricingOptions,
        // Selected frequency with price (or "Addons Only" if no frequency)
        "selected_frequency": selectedFrequency === null 
          ? selectedFrequencyLabel 
          : `${selectedFrequencyLabel} - £${selectedFrequencyPrice}`,
        // Selected addons with prices as strings including pound symbol
        "selected_addons": selectedAddons,
        // Total price (if frequency is null, use sum of addons only)
        "total_price": selectedFrequency === null 
          ? (data.residentialQuoteResult.extras?.reduce((sum: number, e: {label: string; price: number}) => sum + e.price, 0) || 0)
          : (data.residentialQuoteResult.total || 0),
        // Regular price (cost from second week, only relevant if frequency is selected)
        "regular_price": selectedFrequencyPrice,
        timestamp: new Date().toISOString(),
        source: 'kings-window-cleaning-quote-form'
      };
    } else {
      // For other steps, include contact data if available
      const contactInfo = contactData ? {
        fullName: contactData.fullName,
        phone: contactData.phone,
        email: contactData.email,
        hearAboutUs: contactData.hearAboutUs,
        referralName: contactData.referralName,
        propertyType: contactData.propertyType,
        consent: contactData.consent
      } : {};
      
      payload = {
        ...data,
        ...contactInfo, // Include contact info in every API call
        timestamp: new Date().toISOString(),
        source: 'kings-window-cleaning-quote-form',
        step
      };
    }
    
    console.log(`Making API call to ${webhookUrl} with payload:`, payload);
    
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
 * Generic function to send any data to a webhook
 * @param url - The webhook URL
 * @param data - The data to send
 * @returns Promise<ApiResponse> - The API response
 */
export async function sendWebhookData(url: string, data: any): Promise<ApiResponse> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    
    return {
      success: true,
      message: 'Data sent successfully',
      ...result
    }
  } catch (error) {
    console.error('Error sending webhook data:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}