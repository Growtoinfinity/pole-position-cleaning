import type { CalcResult } from '@/lib/costing-calc'
import type { Step } from '@/lib/form-steps'
import { isStep, stepForReached } from '@/lib/form-steps'
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

export type { Step }

/**
 * Everything persisted to `submissions.form_data`, and everything read back out of it
 * on resume. Must stay JSON-serialisable.
 */
export interface FormSnapshot {
  currentStep: Step
  contactData: ContactFormValues | null
  propertyType: PropertyType | null
  businessDetails: BusinessDetailsValues | null
  residentialType: ResidentialType | null
  largeUnusualAddress: LargeUnusualAddressValues | null
  bungalowKind: BungalowKind | null
  townhouseKind: TownhouseKind | null
  /**
   * Every answer from the property-details step, in one object.
   *
   * A flat is banded on bedrooms exactly as a house is, so it fills the same slot rather
   * than a parallel one that resume would have to remember to restore — and widening
   * `CommonPropertyDetailsValues` is the whole of the change needed here when a new
   * question is added, because this is copied whole into and out of `form_data`.
   */
  propertyDetails: CommonPropertyDetailsValues | null
  residentialFrequency: QuoteStepValues | null
  residentialQuoteResult: CalcResult | null
  bookingDetails: BookStepValues | null
}

/** The `submissions` row shape the `get` action hands back for resume. */
export interface SubmissionSnapshot {
  token: string
  email: string | null
  step_reached: number | null
  status: string | null
  form_type: string | null
  form_data: Partial<FormSnapshot> | null
  quote: CalcResult | null
  pipeline_stage: string | null
}

interface FormState {
  // Current step
  step: Step

  /** Supabase submission token — also the `?token=` resume key and `{{contact.webform_token}}`. */
  token: string | null

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

  // Actions
  setStep: (step: Step) => void
  setToken: (token: string | null) => void
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

  // Supabase-backed resume
  getFormSnapshot: (overrideStep?: Step) => FormSnapshot
  hydrateFromSubmission: (row: SubmissionSnapshot) => Step
  getContinueUrl: () => string
}

/** The state change Back applies — a step, plus any inline flags it has to clear. */
export type BackTarget = {
  step: Step
  showBungalowInline?: boolean
  showTownhouseInline?: boolean
}

/**
 * Where Back goes from here, or `null` when there is nowhere to go.
 *
 * Pure, and the single source of truth: `goBack()` applies whatever this
 * returns, and the Back control reads the same function to decide whether to
 * render at all and what to call its destination. That matters because the
 * control is now always on screen in the sticky bar — when this mapping was
 * inlined in `goBack`, a step missing a branch (`residentialQuote`, which is
 * where every prefill link lands) produced a Back button that rendered,
 * enabled, and silently swallowed the click. A step with no branch now hides
 * the control instead.
 */
export function backTargetFor(
  state: Pick<FormState, 'step' | 'residentialType'>,
): BackTarget | null {
  const { step } = state
  // Returning to the property type must also drop the inline sub-pickers, or
  // the customer lands back on the screen they just left.
  const toResidentialType: BackTarget = {
    step: 'residentialType',
    showBungalowInline: false,
    showTownhouseInline: false,
  }

  switch (step) {
    case 'residentialType':
      return { step: 'contact' }
    case 'residentialLargePropertyDetails':
      return { step: 'residentialType' }
    case 'residentialLargeAddress':
      return { step: 'residentialLargePropertyDetails' }
    case 'bungalowType':
    case 'townhouseType':
      return { step: 'residentialType' }
    case 'bungalowTypeMobile':
    case 'townhouseTypeMobile':
      return toResidentialType
    case 'propertyDetails':
      if (state.residentialType === 'bungalow') {
        return { ...toResidentialType, step: 'bungalowTypeMobile' }
      }
      if (state.residentialType === 'townhouse') {
        return { ...toResidentialType, step: 'townhouseTypeMobile' }
      }
      return { step: 'residentialType' }
    // Both quote views go back to the details that produced the quote.
    case 'residentialFrequency':
    case 'residentialQuote':
      return { step: 'propertyDetails' }
    case 'residentialBook':
      return { step: 'residentialFrequency' }
    case 'commercialDetails':
      return { step: 'contact' }
    // Unchanged from the original mapping. Unreachable from the UI, because
    // BackLink hides itself on the terminal screens — but it is the store's
    // answer, not the control's, so it stays here rather than being quietly
    // dropped during the move.
    case 'commercialThanks':
      return { step: 'commercialDetails' }
    // Nowhere to go: the first step, and the screens that are genuinely done.
    case 'contact':
    case 'residentialThanks':
    case 'thankYou':
      return null
  }
}

export const useFormStore = create<FormState>((set, get) => ({
  // Initial state
  step: 'contact',
  token: null,
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

  // Actions
  setStep: (step) => set({ step }),
  setToken: (token) => set({ token }),
  setContactData: (data) => set({ contactData: data }),
  setPropertyType: (type) => set({ propertyType: type }),
  setBusinessDetails: (details) => set({ businessDetails: details }),
  /**
   * Changing the property type invalidates every answer that came after it.
   *
   * Without this the snapshot posted on the very next syncStep still carries the old
   * property's answers, and the contact is written as e.g. a flat WITH bedrooms, an
   * extension, a conservatory and gutter/fascia prices — a record the booking guard
   * later reads back and believes. Re-selecting the same type is a no-op so a stray
   * re-render cannot wipe answers the customer is still filling in.
   */
  setResidentialType: (type) =>
    set((state) =>
      state.residentialType === type
        ? { residentialType: type }
        : {
            residentialType: type,
            propertyDetails: null,
            residentialFrequency: null,
            residentialQuoteResult: null,
            bungalowKind: null,
            townhouseKind: null,
          },
    ),
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
        // A flat now reaches the details step like any other property, and this name is
        // what heads it — without the case it read "Property Details".
        case 'flat': return 'Flat'
        default: return 'Property'
      }
    }
  },

  goBack: () => {
    const target = backTargetFor(get())
    if (target) set(target)
  },

  reset: () => {
    set({
      step: 'contact',
      token: null,
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
    })
  },

  /**
   * `overrideStep` records the step the user is being sent *to*, so resume lands on the
   * next unanswered question rather than replaying the one they just completed.
   */
  getFormSnapshot: (overrideStep) => {
    const state = get()
    return {
      currentStep: overrideStep ?? state.step,
      contactData: state.contactData,
      propertyType: state.propertyType,
      businessDetails: state.businessDetails,
      residentialType: state.residentialType,
      largeUnusualAddress: state.largeUnusualAddress,
      bungalowKind: state.bungalowKind,
      townhouseKind: state.townhouseKind,
      propertyDetails: state.propertyDetails,
      residentialFrequency: state.residentialFrequency,
      residentialQuoteResult: state.residentialQuoteResult,
      bookingDetails: state.bookingDetails,
    }
  },

  hydrateFromSubmission: (row) => {
    const data = row.form_data ?? {}

    const targetStep: Step = isStep(data.currentStep)
      ? data.currentStep
      : stepForReached(row.step_reached)

    set({
      token: row.token,
      step: targetStep,
      contactData: data.contactData ?? null,
      propertyType: data.propertyType ?? null,
      businessDetails: data.businessDetails ?? null,
      residentialType: data.residentialType ?? null,
      largeUnusualAddress: data.largeUnusualAddress ?? null,
      bungalowKind: data.bungalowKind ?? null,
      townhouseKind: data.townhouseKind ?? null,
      propertyDetails: data.propertyDetails ?? null,
      residentialFrequency: data.residentialFrequency ?? null,
      // The server-calculated quote is authoritative over whatever the client last stored
      residentialQuoteResult: row.quote ?? data.residentialQuoteResult ?? null,
      bookingDetails: data.bookingDetails ?? null,
      showBungalowInline: false,
      showTownhouseInline: false,
    })

    return targetStep
  },

  /**
   * The one and only continue-URL format. GHL workflows/emails should link to
   * `url?token={{contact.webform_token}}`, which is exactly what this produces.
   */
  getContinueUrl: () => {
    if (typeof window === 'undefined') return ''
    const base = `${window.location.origin}${window.location.pathname}`
    const { token } = get()
    return token ? `${base}?token=${encodeURIComponent(token)}` : base
  },
}))
