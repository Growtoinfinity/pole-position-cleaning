import type { CalcResult } from '@/lib/costing-calc'
import {
  clearUrlState,
  type FullFormState,
  getFormStateFromUrl,
} from '@/lib/url-state'
import {
  parseLeadUrl,
  determineTargetStep,
  generateLeadContinueUrl,
  clearLeadUrlParams,
} from '@/lib/lead-url'
import type { BookStepValues } from '@/steps/book/BookStep'
import type { QuoteStepValues } from '@/steps/quote/QuoteStep'
import type { ContactFormValues } from '@/steps/step-0/ContactStep'
import type { CommonPropertyDetailsValues } from '@/steps/step-2-residential/CommonPropertyDetailsStep'
import type { LargeUnusualAddressValues } from '@/steps/step-2-residential/LargeUnusualAddressStep'
import type { ResidentialType } from '@/steps/step-2-residential/ResidentialTypeStep'
import type { BungalowKind } from '@/steps/step-2-residential/bungalow/BungalowTypeStep'
import type { TownhouseKind } from '@/steps/step-2-residential/townhouse/TownhouseTypeStep'
import type { BusinessDetailsValues } from '@/steps/step-3-commercial/BusinessDetailsStep'
import type { PropertyType } from '@/types'
import { create } from 'zustand'

export type Step =
  | 'contact'
  | 'residentialType'
  | 'residentialLargePropertyDetails'
  | 'residentialLargeAddress'
  | 'residentialFlatNotSupported'
  | 'residentialThanks'
  | 'bungalowType'
  | 'bungalowTypeMobile'
  | 'townhouseType'
  | 'townhouseTypeMobile'
  | 'propertyDetails'
  | 'residentialFrequency'
  | 'residentialQuote'
  | 'residentialBook'
  | 'commercialDetails'
  | 'commercialThanks'
  | 'thankYou'

interface FormState {
  // Current step
  step: Step
  
  // Form data
  contactData: ContactFormValues | null
  propertyType: PropertyType | null
  businessDetails: BusinessDetailsValues | null
  residentialType: ResidentialType | null
  largeUnusualAddress: LargeUnusualAddressValues | null
  bungalowKind: BungalowKind | null
  townhouseKind: TownhouseKind | null
  propertyDetails: CommonPropertyDetailsValues | null
  residentialFrequency: QuoteStepValues | null
  residentialQuoteResult: CalcResult | null
  bookingDetails: BookStepValues | null
  
  // UI state
  showBungalowInline: boolean
  showTownhouseInline: boolean
  
  // URL state management flag
  skipNextUrlUpdate: boolean
  
  // Actions
  setStep: (step: Step) => void
  setContactData: (data: ContactFormValues | null) => void
  setPropertyType: (type: PropertyType | null) => void
  setBusinessDetails: (details: BusinessDetailsValues | null) => void
  setResidentialType: (type: ResidentialType | null) => void
  setLargeUnusualAddress: (address: LargeUnusualAddressValues | null) => void
  setBungalowKind: (kind: BungalowKind | null) => void
  setTownhouseKind: (kind: TownhouseKind | null) => void
  setPropertyDetails: (details: CommonPropertyDetailsValues | null) => void
  setResidentialFrequency: (frequency: QuoteStepValues | null) => void
  setResidentialQuoteResult: (result: CalcResult | null) => void
  setBookingDetails: (details: BookStepValues | null) => void
  setShowBungalowInline: (show: boolean) => void
  setShowTownhouseInline: (show: boolean) => void
  
  // Helper functions
  getPropertyTypeName: () => string
  goBack: () => void
  reset: () => void

  // URL state management
  getFormState: () => FullFormState
  restoreFromUrl: () => boolean
  restoreFromLeadUrl: () => { restored: boolean; targetStep: Step | null }
  updateUrl: () => void
  getContinueUrl: () => string
  clearUrl: () => void
}

export const useFormStore = create<FormState>((set, get) => ({
  // Initial state
  step: 'contact',
  contactData: null,
  propertyType: null,
  businessDetails: null,
  residentialType: null,
  largeUnusualAddress: null,
  bungalowKind: null,
  townhouseKind: null,
  propertyDetails: null,
  residentialFrequency: null,
  residentialQuoteResult: null,
  bookingDetails: null,
  showBungalowInline: false,
  showTownhouseInline: false,
  skipNextUrlUpdate: false,
  
  // Actions
  setStep: (step) => set({ step }),
  setContactData: (data) => set({ contactData: data }),
  setPropertyType: (type) => set({ propertyType: type }),
  setBusinessDetails: (details) => set({ businessDetails: details }),
  setResidentialType: (type) => set({ residentialType: type }),
  setLargeUnusualAddress: (address) => set({ largeUnusualAddress: address }),
  setBungalowKind: (kind) => set({ bungalowKind: kind }),
  setTownhouseKind: (kind) => set({ townhouseKind: kind }),
  setPropertyDetails: (details) => set({ propertyDetails: details }),
  setResidentialFrequency: (frequency) => set({ residentialFrequency: frequency }),
  setResidentialQuoteResult: (result) => set({ residentialQuoteResult: result }),
  setBookingDetails: (details) => set({ bookingDetails: details }),
  setShowBungalowInline: (show) => set({ showBungalowInline: show }),
  setShowTownhouseInline: (show) => set({ showTownhouseInline: show }),
  
  // Helper functions
  getPropertyTypeName: () => {
    const { residentialType, bungalowKind, townhouseKind } = get()
    
    if (residentialType === 'bungalow' && bungalowKind) {
      return `${bungalowKind === 'semi_detached' ? 'Semi-Detached' :
        bungalowKind === 'terraced' ? 'Terraced' : 'Detached'} Bungalow`
    } else if (residentialType === 'townhouse' && townhouseKind) {
      return `${townhouseKind === 'semi_detached' ? 'Semi-Detached' :
        townhouseKind === 'terraced' ? 'Terraced' : 'Detached'} Townhouse`
    } else {
      switch (residentialType) {
        case 'semi_detached': return 'Semi-Detached'
        case 'terraced': return 'Terraced'
        case 'detached': return 'Detached'
        default: return 'Property'
      }
    }
  },
  
  goBack: () => {
    const { step } = get()
    
    // naive back logic based on current step
    if (step === 'residentialType') {
      set({ step: 'contact' })
    }
    else if (step === 'residentialLargePropertyDetails') {
      set({ step: 'residentialType' })
    }
    else if (step === 'residentialLargeAddress') {
      set({ step: 'residentialLargePropertyDetails' })
    }
    else if (step === 'residentialFlatNotSupported') {
      set({ step: 'residentialType' })
    }
    else if (step === 'bungalowType') {
      set({ step: 'residentialType' })
    }
    else if (step === 'bungalowTypeMobile') {
      set({ 
        step: 'residentialType',
        showBungalowInline: false,
        showTownhouseInline: false
      })
    }
    else if (step === 'townhouseType') {
      set({ step: 'residentialType' })
    }
    else if (step === 'townhouseTypeMobile') {
      set({
        step: 'residentialType',
        showBungalowInline: false,
        showTownhouseInline: false
      })
    }
    else if (step === 'propertyDetails') {
      const { residentialType } = get()
      if (residentialType === 'bungalow') {
        set({ 
          step: 'bungalowTypeMobile',
          showBungalowInline: false,
          showTownhouseInline: false
        })
      }
      else if (residentialType === 'townhouse') {
        set({
          step: 'townhouseTypeMobile',
          showBungalowInline: false,
          showTownhouseInline: false
        })
      }
      else {
        set({ step: 'residentialType' })
      }
    }
    else if (step === 'residentialFrequency') {
      set({ step: 'propertyDetails' })
    }
    else if (step === 'residentialBook') {
      set({ step: 'residentialFrequency' })
    }
    else if (step === 'commercialDetails') {
      set({ step: 'contact' })
    }
    else if (step === 'commercialThanks') {
      set({ step: 'commercialDetails' })
    }
  },
  
  reset: () => {
    // Clear URL first
    clearUrlState()
    // Set flag to skip next URL update (prevents useContinueUrl from re-adding the URL)
    set({
      step: 'contact',
      contactData: null,
      propertyType: null,
      businessDetails: null,
      residentialType: null,
      largeUnusualAddress: null,
      bungalowKind: null,
      townhouseKind: null,
      propertyDetails: null,
      residentialFrequency: null,
      residentialQuoteResult: null,
      bookingDetails: null,
      showBungalowInline: false,
      showTownhouseInline: false,
      skipNextUrlUpdate: true,
    })
  },

  // URL state management
  getFormState: () => {
    const state = get()
    return {
      step: state.step,
      contactData: state.contactData,
      propertyType: state.propertyType,
      residentialType: state.residentialType,
      bungalowKind: state.bungalowKind,
      townhouseKind: state.townhouseKind,
      propertyDetails: state.propertyDetails,
      residentialFrequency: state.residentialFrequency,
      residentialQuoteResult: state.residentialQuoteResult,
      bookingDetails: state.bookingDetails,
      largeUnusualAddress: state.largeUnusualAddress,
      businessDetails: state.businessDetails,
      showBungalowInline: state.showBungalowInline,
      showTownhouseInline: state.showTownhouseInline,
    }
  },

  restoreFromUrl: () => {
    const urlState = getFormStateFromUrl()
    if (!urlState) return false

    set({
      step: urlState.step,
      contactData: urlState.contactData,
      propertyType: urlState.propertyType,
      residentialType: urlState.residentialType,
      bungalowKind: urlState.bungalowKind,
      townhouseKind: urlState.townhouseKind,
      propertyDetails: urlState.propertyDetails,
      residentialFrequency: urlState.residentialFrequency,
      residentialQuoteResult: urlState.residentialQuoteResult,
      bookingDetails: urlState.bookingDetails,
      largeUnusualAddress: urlState.largeUnusualAddress,
      businessDetails: urlState.businessDetails,
      showBungalowInline: urlState.showBungalowInline,
      showTownhouseInline: urlState.showTownhouseInline,
      // Set flag to skip next URL update (prevents useContinueUrl from re-adding the URL after restore)
      skipNextUrlUpdate: true,
    })

    // Clear the URL after restoring state
    clearUrlState()

    return true
  },

  restoreFromLeadUrl: () => {
    const leadState = parseLeadUrl()
    if (!leadState) return { restored: false, targetStep: null }

    // Build contact data if we have any contact fields
    let contactData = null
    if (leadState.contactData) {
      contactData = {
        fullName: leadState.contactData.fullName || '',
        phone: leadState.contactData.phone || '',
        email: leadState.contactData.email || '',
        propertyType: leadState.contactData.propertyType || ('residential' as const),
        consent: false, // User must consent manually
        hearAboutUs: leadState.contactData.hearAboutUs,
        referralName: leadState.contactData.referralName,
      }
    }

    // Build property details if we have any
    let propertyDetails = null
    if (leadState.propertyDetails) {
      // Only set property details if we have ALL required fields
      const hasAllDetails = 
        leadState.propertyDetails.bedrooms !== undefined &&
        leadState.propertyDetails.hasExtension !== undefined &&
        leadState.propertyDetails.hasConservatory !== undefined
      
      if (hasAllDetails) {
        propertyDetails = {
          bedrooms: leadState.propertyDetails.bedrooms!,
          hasExtension: leadState.propertyDetails.hasExtension!,
          hasConservatory: leadState.propertyDetails.hasConservatory!,
        }
      } else {
        // Partial details - still store them for pre-filling forms
        propertyDetails = {
          bedrooms: leadState.propertyDetails.bedrooms || 0,
          hasExtension: leadState.propertyDetails.hasExtension || 'no',
          hasConservatory: leadState.propertyDetails.hasConservatory || 'no',
        }
      }
    }

    // Build business details if we have any (commercial)
    let businessDetails = null
    if (leadState.businessDetails) {
      businessDetails = {
        businessName: leadState.businessDetails.businessName || '',
        buildingType: leadState.businessDetails.buildingType || '',
        cleaningTypes: leadState.businessDetails.cleaningTypes || [],
        address1: leadState.businessDetails.address1 || '',
        city: leadState.businessDetails.city || '',
        postcode: leadState.businessDetails.postcode || '',
      }
    }

    // Determine the target step
    const targetStep = determineTargetStep(leadState)

    // Update the store
    set({
      contactData,
      propertyType: leadState.propertyType,
      residentialType: leadState.residentialType,
      bungalowKind: leadState.bungalowKind,
      townhouseKind: leadState.townhouseKind,
      propertyDetails,
      businessDetails,
      step: targetStep,
      skipNextUrlUpdate: true,
    })

    // Clear the lead URL params
    clearLeadUrlParams()

    return { restored: true, targetStep }
  },

  updateUrl: () => {
    const { skipNextUrlUpdate } = get()
    
    // If we should skip this update, clear the flag
    if (skipNextUrlUpdate) {
      set({ skipNextUrlUpdate: false })
    }
    
    // Always keep the URL clean - don't add any state to the browser URL
    // The continue URL is generated separately via getContinueUrl()
    clearUrlState()
  },

  getContinueUrl: () => {
    const formState = get().getFormState()
    // Use human-readable lead URL format instead of compressed format
    return generateLeadContinueUrl({
      contactData: formState.contactData,
      propertyType: formState.propertyType,
      residentialType: formState.residentialType,
      bungalowKind: formState.bungalowKind,
      townhouseKind: formState.townhouseKind,
      propertyDetails: formState.propertyDetails,
      businessDetails: formState.businessDetails,
    })
  },

  clearUrl: () => {
    clearUrlState()
  }
}))
