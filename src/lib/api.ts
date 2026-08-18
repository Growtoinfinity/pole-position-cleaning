import type { Step } from '@/stores/formStore'
import { useFormStore } from '@/stores/formStore'
import type { ConservatoryRoofPricingInput } from '@/lib/costing-calc'
import { createUnifiedPayload, type ContactFormData } from '@/lib/unified-payload'
import { ensureSubmissionStarted } from '@/lib/submission'

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
export type { ContactFormData }

/**
 * Builds the outgoing GHL payload, stamping on the two store-derived extras:
 * the `?token=` continue URL and the Supabase token itself (`webform_token`).
 */
function buildPayload(data: any, contactData: ContactFormData | null): any {
  const state = useFormStore.getState()
  return createUnifiedPayload(data, contactData, {
    continueUrl: state.getContinueUrl(),
    webformToken: state.token,
  })
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
    
    const structuredData = buildPayload(data, contactData);

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
    const payload = buildPayload(data, contactData ?? null);
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
  // S1 — create the Supabase submission row first so the very first webhook already
  // carries `webform_token`. Never blocks: a Supabase failure resolves to a null token.
  await ensureSubmissionStarted(data)

  // Pass contact data properly so it gets included in unified payload
  return sendStepData('contact', { contact: data }, data)
}
