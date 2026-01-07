import type { CalcResult } from '@/lib/costing-calc'
import {
  clearUrlState,
  type FullFormState,
  generateContinueUrl,
  getFormStateFromUrl,
  updateUrlWithState,
} from '@/lib/url-state'
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

  updateUrl: () => {
    const { skipNextUrlUpdate } = get()
    
    // If we should skip this update, clear the flag and clear the URL instead
    if (skipNextUrlUpdate) {
      set({ skipNextUrlUpdate: false })
      clearUrlState()
      return
    }
    
    const formState = get().getFormState()
    updateUrlWithState(formState)
  },

  getContinueUrl: () => {
    const formState = get().getFormState()
    return generateContinueUrl(formState)
  },

  clearUrl: () => {
    clearUrlState()
  }
}))
