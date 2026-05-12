/**
 * URL State Management for "Continue from where you left off" feature
 *
 * This module provides utilities to encode form state into a compact URL
 * and decode it back to restore the form state.
 *
 * Uses aggressive compression:
 * - Numeric codes for all enums
 * - Single-character keys
 * - Bit flags for booleans
 * - Omits data that can be recalculated
 */

import type { CalcResult } from '@/lib/costing-calc';
import type { BookStepValues } from '@/steps/book/BookStep';
import type { QuoteStepValues } from '@/steps/quote/QuoteStep';
import type { ContactFormValues } from '@/steps/step-0/ContactStep';
import type { CommonPropertyDetailsValues } from '@/steps/step-2-residential/CommonPropertyDetailsStep';
import type { LargeUnusualAddressValues } from '@/steps/step-2-residential/LargeUnusualAddressStep';
import type { ResidentialType } from '@/steps/step-2-residential/ResidentialTypeStep';
import type { BungalowKind } from '@/steps/step-2-residential/bungalow/BungalowTypeStep';
import type { TownhouseKind } from '@/steps/step-2-residential/townhouse/TownhouseTypeStep';
import type { BusinessDetailsValues } from '@/steps/step-3-commercial/BusinessDetailsStep';
import type { Step } from '@/stores/formStore';
import type { PropertyType, YesNo } from '@/types';
import { formatAppointmentTime } from '@/lib/scheduling';

// ============ ENUM MAPPINGS (string <-> number) ============

const STEP_MAP: Record<Step, number> = {
  contact: 0,
  residentialType: 1,
  residentialLargePropertyDetails: 2,
  residentialLargeAddress: 3,
  residentialFlatNotSupported: 4,
  residentialThanks: 5,
  bungalowType: 6,
  bungalowTypeMobile: 7,
  townhouseType: 8,
  townhouseTypeMobile: 9,
  propertyDetails: 10,
  residentialFrequency: 11,
  residentialQuote: 12,
  residentialBook: 13,
  commercialDetails: 14,
  commercialThanks: 15,
  thankYou: 16,
};

const STEP_REVERSE: Record<number, Step> = Object.fromEntries(
  Object.entries(STEP_MAP).map(([k, v]) => [v, k as Step])
);

const PROPERTY_TYPE_MAP: Record<PropertyType, number> = {
  residential: 0,
  commercial: 1,
};

const PROPERTY_TYPE_REVERSE: Record<number, PropertyType> = {
  0: 'residential',
  1: 'commercial',
};

const RESIDENTIAL_TYPE_MAP: Record<ResidentialType, number> = {
  semi_detached: 0,
  terraced: 1,
  detached: 2,
  bungalow: 3,
  townhouse: 4,
  flat: 5,
  large_unusual: 6,
};

const RESIDENTIAL_TYPE_REVERSE: Record<number, ResidentialType> =
  Object.fromEntries(
    Object.entries(RESIDENTIAL_TYPE_MAP).map(([k, v]) => [
      v,
      k as ResidentialType,
    ])
  );

const HOUSE_KIND_MAP: Record<BungalowKind | TownhouseKind, number> = {
  semi_detached: 0,
  terraced: 1,
  detached: 2,
};

const HOUSE_KIND_REVERSE: Record<number, BungalowKind> = {
  0: 'semi_detached',
  1: 'terraced',
  2: 'detached',
};

const FREQUENCY_MAP: Record<string, number> = {
  '6': 0,
  '8': 1,
  '12': 2,
  'one-off': 3,
};

const FREQUENCY_REVERSE: Record<number, 6 | 8 | 12 | 'one-off'> = {
  0: 6,
  1: 8,
  2: 12,
  3: 'one-off',
};

// ============ ULTRA-COMPACT STATE INTERFACE ============

interface MicroState {
  // Step (required)
  _: number;

  // Contact: [name, phone, email, propertyType, consent, hearAboutUs?, referralName?]
  c?: (string | number)[];

  // Property flow: [residentialType, bungalowKind?, townhouseKind?]
  r?: number[];

  // Property details: [bedrooms, extension, conservatory] + optional [roofMode, roofPanels] when conservatory=yes
  d?: number[];

  // Quote: [frequency, addonsBitfield]
  // Addons: gutterClear=1, fasciaClean=2, conservatoryExt=4, conservatoryInt=8, internal=16
  q?: number[];

  // Booking: [address1, city, postcode, date, timePref(0=morning,1=afternoon), notes?]
  b?: (string | number)[];

  // Large/unusual address: [address1, city, postcode]
  l?: string[];

  // Business: [name, buildingType, cleaningTypes(comma-separated), address1, city, postcode]
  u?: string[];

  // UI flags as bitfield: showBungalowInline=1, showTownhouseInline=2
  f?: number;
}

// ============ FULL FORM STATE INTERFACE ============

export interface FullFormState {
  step: Step;
  contactData: ContactFormValues | null;
  propertyType: PropertyType | null;
  residentialType: ResidentialType | null;
  bungalowKind: BungalowKind | null;
  townhouseKind: TownhouseKind | null;
  propertyDetails: CommonPropertyDetailsValues | null;
  residentialFrequency: QuoteStepValues | null;
  residentialQuoteResult: CalcResult | null;
  bookingDetails: BookStepValues | null;
  largeUnusualAddress: LargeUnusualAddressValues | null;
  businessDetails: BusinessDetailsValues | null;
  showBungalowInline: boolean;
  showTownhouseInline: boolean;
}

// ============ COMPRESSION UTILITIES ============

/**
 * Convert YesNo to bit (1 or 0)
 */
function yesNoToBit(val: YesNo | undefined): number {
  return val === 'yes' ? 1 : 0;
}

/**
 * Convert bit to YesNo
 */
function bitToYesNo(bit: number): YesNo {
  return bit === 1 ? 'yes' : 'no';
}

/**
 * Encode addons to bitfield
 */
function addonsTobitfield(addons: QuoteStepValues['addons']): number {
  let bits = 0;
  if (addons.gutterClear) bits |= 1;
  if (addons.fasciaClean) bits |= 2;
  if (addons.conservatoryRoofCleanExternal) bits |= 4;
  if (addons.conservatoryRoofCleanInternal) bits |= 8;
  if (addons.adHocInternalClean) bits |= 16;
  return bits;
}

/**
 * Decode bitfield to addons
 */
function bitfieldToAddons(bits: number): QuoteStepValues['addons'] {
  return {
    gutterClear: !!(bits & 1),
    fasciaClean: !!(bits & 2),
    conservatoryRoofCleanExternal: !!(bits & 4),
    conservatoryRoofCleanInternal: !!(bits & 8),
    adHocInternalClean: !!(bits & 16),
  };
}

/**
 * Convert full state to micro state
 */
function toMicro(state: FullFormState): MicroState {
  const micro: MicroState = {
    _: STEP_MAP[state.step],
  };

  // Contact data (includes optional hearAboutUs and referralName)
  if (state.contactData) {
    const c: (string | number)[] = [
      state.contactData.fullName,
      state.contactData.phone,
      state.contactData.email,
      PROPERTY_TYPE_MAP[state.contactData.propertyType],
      state.contactData.consent ? 1 : 0,
    ];
    // Always include both hearAboutUs and referralName together to maintain index positions
    // If referralName exists, we must include hearAboutUs (even as empty string) first
    if (state.contactData.hearAboutUs || state.contactData.referralName) {
      c.push(state.contactData.hearAboutUs || '');
    }
    if (state.contactData.referralName) {
      c.push(state.contactData.referralName);
    }
    micro.c = c;
  }

  // Residential type flow
  if (
    state.residentialType !== null ||
    state.bungalowKind !== null ||
    state.townhouseKind !== null
  ) {
    const r: number[] = [];
    r.push(
      state.residentialType ? RESIDENTIAL_TYPE_MAP[state.residentialType] : -1
    );
    if (state.bungalowKind) {
      r.push(HOUSE_KIND_MAP[state.bungalowKind]);
    } else if (state.townhouseKind) {
      r.push(-1); // placeholder for bungalow
      r.push(HOUSE_KIND_MAP[state.townhouseKind]);
    }
    micro.r = r;
  }

  // Property details
  if (state.propertyDetails) {
    const row: number[] = [
      state.propertyDetails.bedrooms,
      yesNoToBit(state.propertyDetails.hasExtension),
      yesNoToBit(state.propertyDetails.hasConservatory),
    ];
    if (
      state.propertyDetails.hasConservatory === 'yes' &&
      state.propertyDetails.conservatoryRoof
    ) {
      const cr = state.propertyDetails.conservatoryRoof;
      if (cr.status === 'unknown') {
        row.push(0, 0);
      } else {
        row.push(1, Math.min(120, Math.max(1, cr.panelCount)));
      }
    }
    micro.d = row;
  }

  // Quote/frequency (skip residentialQuoteResult - can be recalculated)
  if (state.residentialFrequency) {
    const freq = state.residentialFrequency.frequency;
    micro.q = [
      freq === null ? -1 : FREQUENCY_MAP[String(freq)],
      addonsTobitfield(state.residentialFrequency.addons),
    ];
  }

  // Booking details
  if (state.bookingDetails) {
    const b: (string | number)[] = [
      state.bookingDetails.address1,
      state.bookingDetails.city,
      state.bookingDetails.postcode,
      state.bookingDetails.selectedDate,
      state.bookingDetails.timePreference === 'morning' ? 0 : 1,
    ];
    if (state.bookingDetails.additionalNotes) {
      b.push(state.bookingDetails.additionalNotes);
    }
    micro.b = b;
  }

  // Large unusual address
  if (state.largeUnusualAddress) {
    micro.l = [
      state.largeUnusualAddress.address1,
      state.largeUnusualAddress.city,
      state.largeUnusualAddress.postcode,
    ];
  }

  // Business details (includes buildingType and cleaningTypes)
  if (state.businessDetails) {
    micro.u = [
      state.businessDetails.businessName,
      state.businessDetails.buildingType,
      state.businessDetails.cleaningTypes.join(','),
      state.businessDetails.address1,
      state.businessDetails.city,
      state.businessDetails.postcode,
    ];
  }

  // UI flags
  let flags = 0;
  if (state.showBungalowInline) flags |= 1;
  if (state.showTownhouseInline) flags |= 2;
  if (flags > 0) micro.f = flags;

  return micro;
}

/**
 * Convert micro state to full state
 */
function fromMicro(micro: MicroState): FullFormState {
  const state: FullFormState = {
    step: STEP_REVERSE[micro._] || 'contact',
    contactData: null,
    propertyType: null,
    residentialType: null,
    bungalowKind: null,
    townhouseKind: null,
    propertyDetails: null,
    residentialFrequency: null,
    residentialQuoteResult: null,
    bookingDetails: null,
    largeUnusualAddress: null,
    businessDetails: null,
    showBungalowInline: false,
    showTownhouseInline: false,
  };

  // Contact data
  if (micro.c) {
    // Handle hearAboutUs - convert empty string back to undefined
    const hearAboutUs = micro.c[5] as string | undefined;
    state.contactData = {
      fullName: micro.c[0] as string,
      phone: micro.c[1] as string,
      email: micro.c[2] as string,
      propertyType: PROPERTY_TYPE_REVERSE[micro.c[3] as number],
      consent: micro.c[4] === 1,
      hearAboutUs: hearAboutUs || undefined,
      referralName: micro.c[6] as string | undefined,
    };
    state.propertyType = PROPERTY_TYPE_REVERSE[micro.c[3] as number];
  }

  // Residential type flow
  if (micro.r) {
    if (micro.r[0] !== -1) {
      state.residentialType = RESIDENTIAL_TYPE_REVERSE[micro.r[0]];
    }
    if (micro.r.length > 1 && micro.r[1] !== -1) {
      state.bungalowKind = HOUSE_KIND_REVERSE[micro.r[1]];
    }
    if (micro.r.length > 2 && micro.r[2] !== -1) {
      state.townhouseKind = HOUSE_KIND_REVERSE[micro.r[2]];
    }
  }

  // Property details row: new format [beds, ext, cons] or [beds, ext, cons, roofMode, roofPanels];
  // legacy format still decoded: [beds, loft, ext, cons] or + [roofMode, roofPanels] (length 6).
  if (micro.d) {
    const d = micro.d
    const len = d.length
    let bedrooms: number
    let hasExtension: YesNo
    let hasConservatory: YesNo
    let roofModeIdx: number | null = null

    if (len === 3 || len === 5) {
      bedrooms = d[0]
      hasExtension = bitToYesNo(d[1])
      hasConservatory = bitToYesNo(d[2])
      roofModeIdx = len === 5 ? 3 : null
    } else if (len === 4 || len === 6) {
      bedrooms = d[0]
      hasExtension = bitToYesNo(d[2])
      hasConservatory = bitToYesNo(d[3])
      roofModeIdx = len === 6 ? 4 : null
    } else {
      bedrooms = d[0]
      hasExtension = 'no'
      hasConservatory = 'no'
      roofModeIdx = null
    }

    state.propertyDetails = {
      bedrooms,
      hasExtension,
      hasConservatory,
    }
    if (
      roofModeIdx !== null &&
      len >= roofModeIdx + 2 &&
      state.propertyDetails.hasConservatory === 'yes'
    ) {
      const roofMode = d[roofModeIdx]
      const roofCount = d[roofModeIdx + 1]
      if (roofMode === 0 && roofCount === 0) {
        state.propertyDetails.conservatoryRoof = { status: 'unknown' }
      } else if (roofMode === 1 && roofCount >= 1 && roofCount <= 120) {
        state.propertyDetails.conservatoryRoof = {
          status: 'count',
          panelCount: roofCount,
        }
      }
    }
  }

  // Quote/frequency
  if (micro.q) {
    state.residentialFrequency = {
      frequency: micro.q[0] === -1 ? null : FREQUENCY_REVERSE[micro.q[0]],
      addons: bitfieldToAddons(micro.q[1]),
    };
  }

  // Booking details
  if (micro.b) {
    const selectedDate = micro.b[3] as string;
    const timePreference = micro.b[4] === 0 ? 'morning' : 'afternoon';
    state.bookingDetails = {
      address1: micro.b[0] as string,
      city: micro.b[1] as string,
      postcode: micro.b[2] as string,
      selectedDate,
      timePreference,
      appointmentTime: formatAppointmentTime(selectedDate, timePreference),
      additionalNotes: micro.b[5] as string | undefined,
      allAppointmentDates: [], // Will be recalculated
    };
  }

  // Large unusual address
  if (micro.l) {
    state.largeUnusualAddress = {
      address1: micro.l[0],
      city: micro.l[1],
      postcode: micro.l[2],
    };
  }

  // Business details
  if (micro.u) {
    state.businessDetails = {
      businessName: micro.u[0],
      buildingType: micro.u[1],
      cleaningTypes: micro.u[2] ? micro.u[2].split(',') : [],
      address1: micro.u[3],
      city: micro.u[4],
      postcode: micro.u[5],
    };
  }

  // UI flags
  if (micro.f) {
    state.showBungalowInline = !!(micro.f & 1);
    state.showTownhouseInline = !!(micro.f & 2);
  }

  return state;
}

/**
 * Encode string to handle Unicode characters (converts to UTF-8 bytes)
 */
function encodeUnicode(str: string): string {
  return encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );
}

/**
 * Decode UTF-8 bytes back to Unicode string
 */
function decodeUnicode(str: string): string {
  try {
    return decodeURIComponent(
      str
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    return str; // Return as-is if decoding fails
  }
}

/**
 * Simple LZW-like compression for strings
 */
function compress(str: string): string {
  if (!str) return '';

  // Encode Unicode to ASCII-safe format before compression
  const safeStr = encodeUnicode(str);

  const dict: Map<string, number> = new Map();
  let dictSize = 256;

  for (let i = 0; i < 256; i++) {
    dict.set(String.fromCharCode(i), i);
  }

  const result: number[] = [];
  let w = '';

  for (const c of safeStr) {
    const wc = w + c;
    if (dict.has(wc)) {
      w = wc;
    } else {
      result.push(dict.get(w)!);
      dict.set(wc, dictSize++);
      w = c;
    }
  }

  if (w) {
    result.push(dict.get(w)!);
  }

  const bytes: number[] = [];
  for (const code of result) {
    if (code < 128) {
      bytes.push(code);
    } else if (code < 16384) {
      bytes.push(128 | (code >> 7));
      bytes.push(code & 127);
    } else {
      bytes.push(192 | (code >> 14));
      bytes.push((code >> 7) & 127);
      bytes.push(code & 127);
    }
  }

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Decompress LZW-compressed string
 */
function decompress(compressed: string): string {
  if (!compressed) return '';

  try {
    let base64 = compressed.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const codes: number[] = [];
    let i = 0;
    while (i < bytes.length) {
      const b = bytes[i];
      if (b < 128) {
        codes.push(b);
        i += 1;
      } else if (b < 192) {
        codes.push(((b & 63) << 7) | bytes[i + 1]);
        i += 2;
      } else {
        codes.push(((b & 63) << 14) | (bytes[i + 1] << 7) | bytes[i + 2]);
        i += 3;
      }
    }

    const dict: Map<number, string> = new Map();
    let dictSize = 256;

    for (let i = 0; i < 256; i++) {
      dict.set(i, String.fromCharCode(i));
    }

    if (codes.length === 0) return '';

    let w = dict.get(codes[0])!;
    let result = w;

    for (let i = 1; i < codes.length; i++) {
      const code = codes[i];
      let entry: string;

      if (dict.has(code)) {
        entry = dict.get(code)!;
      } else if (code === dictSize) {
        entry = w + w[0];
      } else {
        throw new Error('Invalid compressed data');
      }

      result += entry;
      dict.set(dictSize++, w + entry[0]);
      w = entry;
    }

    // Decode Unicode back from ASCII-safe format
    return decodeUnicode(result);
  } catch {
    return '';
  }
}

// ============ PUBLIC API ============

/**
 * Encode form state into a URL-safe string
 */
export function encodeFormState(state: FullFormState): string {
  try {
    const micro = toMicro(state);
    const json = JSON.stringify(micro);
    return compress(json);
  } catch {
    return '';
  }
}

/**
 * Decode URL-safe string back to form state
 */
export function decodeFormState(encoded: string): FullFormState | null {
  try {
    const json = decompress(encoded);
    if (!json) return null;

    const micro = JSON.parse(json) as MicroState;
    return fromMicro(micro);
  } catch {
    return null;
  }
}

/**
 * Generate a continue URL with the current form state
 */
export function generateContinueUrl(state: FullFormState): string {
  const encoded = encodeFormState(state);
  if (!encoded) return window.location.origin + window.location.pathname;

  const url = new URL(window.location.href);
  url.searchParams.set('c', encoded);
  return url.toString();
}

/**
 * Get form state from current URL if present
 */
export function getFormStateFromUrl(): FullFormState | null {
  const url = new URL(window.location.href);
  const encoded = url.searchParams.get('c');
  if (!encoded) return null;
  return decodeFormState(encoded);
}

/**
 * Update browser URL with current form state (without page reload)
 */
export function updateUrlWithState(state: FullFormState): void {
  const url = generateContinueUrl(state);
  window.history.replaceState({}, '', url);
}

/**
 * Clear form state from URL
 */
export function clearUrlState(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('c');
  window.history.replaceState({}, '', url.toString());
}
