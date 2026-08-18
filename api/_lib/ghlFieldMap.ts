/**
 * Turns a form snapshot into the GHL contact payload.
 *
 * This replaces the old webhook body. Field ids were verified against contacts the
 * previous webhook flow created, so values land exactly where the workflows already
 * expect them — see the four `transform:` notes for logic that used to live inside a
 * GHL workflow and now has to happen here.
 */
import { calculateCost, type CalcResult, type ConservatoryRoofPricingInput, type HouseKind } from '../../src/lib/costing-calc'
import { formatAppointmentTime, getServiceDaysForPostcode } from '../../src/lib/scheduling'
import { CONSERVATORY_ROOF_PANELS_UNKNOWN_LABEL } from '../../src/lib/conservatory-roof-copy'
import { toE164Phone } from '../../src/lib/phone'
import { ghlFieldOf, priceOf, SERVICE_KEYS, type PriceTable, type ServiceKey } from '../../src/lib/pricing'

/** Contact custom fields in the Kings location, addressed by id so renames can't break them. */
export const FIELD = {
  howDidYouHearAboutUs: '6ZZnm0nqid9U5qHz97FF',
  referrer: '6go5ot9ALp0qB9lx8Odb',
  typeOfProperty: 'ifJNd1mME03Ly1voLsFa',      // GHL spells this "tyoe_of_property"
  typeOfHouse: 'PtBN5jD5Ej2q2f0niHTd',
  numberOfBedrooms: '17NOwXGT5YH8BJuTV4x6',
  extension: 'pOzEyx3FQAfR7xImR8ri',
  conservatory: 'yXybNWTUis74KZ5F9tyk',
  conservatoryRoofPanels: 'tK5vUWWHyt9vPlqRtqyi',
  addressLine: 'Ta8if3THODaHATSYeq6G',          // named address__postal_code, actually holds the address
  postalCodeForBooking: '1ErBOfjt3fPRmpapbxDu',
  buildingType: 'H7iRQ9b0izikkoW4azGu',
  typeOfCleaningRequired: 'NRVWAwCDouXA4yYRafol',
  price6Weekly: 'KO4NxujyvxxksbV6oTVx',
  price8Weekly: 'CI3E8uQb7AOYzcwOusUq',
  price12Weekly: 'ipjcHyQHTzNXZsHQmcK8',
  priceOneOff: 'jyYmoI0urjJ98t6xSfjy',
  firstCleanPrice: 'BbJyExSTckJijmMRwW7P',
  regularPrice: 'ZK8gV9Tkzhtxgy0oKOHd',
  gutterClearance: '52omyZ1SXyJPSYU7LrKO',
  fasciaSoffitGutterClean: 'dKAmuXQZaRB9nv0B2WYl',
  conservatoryRoofExternal: 'WwSZy4M9zMi4IN4FDhyS',  // conservatory_roof_cleaning
  conservatoryRoofInternal: 'AJGW20TXraQupDJ7FpRw',  // con_roof
  adHocInternalWindowClean: 'ihfXlHb3KJvR8q08FOTv',
  monthlyValue: 'JTia6lY0GGHvnix56xme',
  yearlyValue: 'JWu8ySBjFnVruZKtnddz',
  appointmentDayRequested: '01oCDoZLisgr8S10Xnkq',
  appointmentTimeRequested: 'miqvZH9OqS9kEqRZRsBz',
  bookingCompletionDate: '89x1HkX7BxMoRwbOoRi5',
  customerIssue: 'DHCSqjVqtkfkfifvCKOA',
  bookedServicesArray: 'iHtMA4u1LgKyQ2FG6TyF',
  bookedServices: 'UlaSUjjfeJiBkEJ86JWb',            // CHECKBOX — the checklist
  webformToken: '5DjUZ1warHpfU6Npel0R',
} as const

/**
 * `ghlField` on a priced row names where that price belongs (`contact.6weekly`). The spec
 * says read it from the response rather than hard-coding, so a price-book change cannot
 * silently send a price to the wrong field — this resolves that name to the field id we
 * write by. A name we do not recognise is skipped and logged, never guessed at.
 */
const FIELD_ID_BY_GHL_NAME: Record<string, string> = {
  'contact.6weekly': FIELD.price6Weekly,
  'contact.8weekly': FIELD.price8Weekly,
  'contact.12weekly': FIELD.price12Weekly,
  'contact.oneoff': FIELD.priceOneOff,
  'contact.int_window_oneoff': FIELD.adHocInternalWindowClean,
  'contact.ad_hoc_internal_window_cleaning': FIELD.adHocInternalWindowClean,
  'contact.full_gutter_clearance': FIELD.gutterClearance,
  'contact.fascia_soffit_and_gutter_clean': FIELD.fasciaSoffitGutterClean,
  'contact.fascia_soffit_gutter': FIELD.fasciaSoffitGutterClean,
  'contact.conservatory_roof_cleaning': FIELD.conservatoryRoofExternal,
  'contact.con_roof': FIELD.conservatoryRoofInternal,
}

/** Where each row lands when the API did not name a field (no table, local book). */
const FALLBACK_FIELD_BY_KEY: Partial<Record<ServiceKey, string>> = {
  ext_window_6weekly: FIELD.price6Weekly,
  ext_window_8weekly: FIELD.price8Weekly,
  ext_window_12weekly: FIELD.price12Weekly,
  ext_window_oneoff: FIELD.priceOneOff,
  int_window_oneoff: FIELD.adHocInternalWindowClean,
  full_gutter_clearance: FIELD.gutterClearance,
  fascia_soffit_gutter: FIELD.fasciaSoffitGutterClean,
  conservatory_roof_external: FIELD.conservatoryRoofExternal,
  conservatory_roof_internal: FIELD.conservatoryRoofInternal,
}

/** Exact option strings on the `booked_services` checkbox — these must match GHL verbatim. */
const CHECKLIST = {
  freq6: '6 weekly external window cleaning',
  freq8: '8 weekly external window cleaning',
  freq12: '12 weekly external window cleaning',
  oneOff: 'one-off external window cleaning',
  internalWindow: 'internal window cleaning',
  gutter: 'full gutter clearance',
  fascia: 'fascia soffit and gutter clean',
  conservatoryExternal: 'external conservatory clean',
  conservatoryInternal: 'internal conservatory clean',
} as const

const GUTTER_LABEL = 'Ad Hoc Gutter Clearance'
const FASCIA_LABEL = 'Ad Hoc Fascia Soffit & Gutter Clean'
const ROOF_EXT_LABEL = 'Ad Hoc Conservatory Roof Clean - External'
const ROOF_INT_LABEL = 'Ad Hoc Conservatory Roof Clean - Internal'
const INTERNAL_LABEL = 'Ad Hoc Internal Window Clean'

export type CustomFieldWrite = { id: string; field_value: string | number | string[] }

export type GhlContactWrite = {
  firstName?: string
  lastName?: string
  name?: string
  email?: string
  phone?: string
  companyName?: string
  address1?: string
  city?: string
  postalCode?: string
  customFields: CustomFieldWrite[]
}

type Snapshot = Record<string, any>

function yes(raw: unknown): boolean {
  if (raw === true) return true
  return typeof raw === 'string' && raw.toLowerCase() === 'yes'
}

function splitName(fullName: string | null | undefined): { firstName?: string; lastName?: string } {
  const trimmed = (fullName ?? '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return {}
  const parts = trimmed.split(' ')
  if (parts.length === 1) return { firstName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function houseKindOf(snap: Snapshot): HouseKind | null {
  const t = snap.residentialType
  if (t === 'bungalow' && snap.bungalowKind) return snap.bungalowKind as HouseKind
  if (t === 'townhouse') return 'townhouse'
  if (t === 'semi_detached' || t === 'terraced' || t === 'detached') return t
  return null
}

/** Mirrors the old payload's `typeOfHouse`: the sub-kind when there is one. */
function typeOfHouse(snap: Snapshot): string {
  const t = snap.residentialType
  if (!t) return ''
  if (t === 'bungalow') return snap.bungalowKind || 'bungalow'
  if (t === 'townhouse') return snap.townhouseKind || 'townhouse'
  return String(t)
}

function roofPricing(snap: Snapshot): ConservatoryRoofPricingInput | null {
  const pd = snap.propertyDetails
  if (yes(pd?.hasConservatory)) return pd?.conservatoryRoof ?? null
  const lu = snap.largeUnusualAddress
  if (yes(lu?.hasConservatory)) return lu?.conservatoryRoof ?? null
  return null
}

/** A price we can write, or null when this row has no number to write. */
type AddonPrices = {
  gutter: number | null
  fascia: number | null
  roofExternal: number | null
  roofInternal: number | null
  internalWindow: number | null
}

/**
 * Add-on prices for the CRM.
 *
 * When the pricing API answered, its numbers are written verbatim — a row it declined to
 * price writes nothing rather than a fabricated 0. Only when there is no table at all do
 * we fall back to the local book, which mirrors what `quoteSource` does for the schedule
 * so the add-on rows and the frequency rows can never come from different engines.
 */
function addonPrices(snap: Snapshot, table: PriceTable | null): AddonPrices {
  if (table) {
    return {
      gutter: priceOf(table, 'full_gutter_clearance'),
      fascia: priceOf(table, 'fascia_soffit_gutter'),
      roofExternal: priceOf(table, 'conservatory_roof_external'),
      roofInternal: priceOf(table, 'conservatory_roof_internal'),
      internalWindow: priceOf(table, 'int_window_oneoff'),
    }
  }

  const kind = houseKindOf(snap)
  const bedrooms = Number(snap.propertyDetails?.bedrooms ?? 0)
  if (!kind || bedrooms <= 0) {
    return { gutter: null, fascia: null, roofExternal: null, roofInternal: null, internalWindow: null }
  }

  const hasConservatory = yes(snap.propertyDetails?.hasConservatory) || yes(snap.largeUnusualAddress?.hasConservatory)
  const spec = hasConservatory ? roofPricing(snap) : null

  const priceFor = (label: string, addons: Record<string, boolean>): number | null => {
    try {
      const result = calculateCost({
        kind,
        bedrooms: Math.max(1, Math.min(5, bedrooms)),
        hasExtension: yes(snap.propertyDetails?.hasExtension),
        hasConservatory,
        conservatoryRoofPricing: spec,
        selectedFrequency: 8,
        addons,
      })
      const line = result.extras.find((e) => e.label === label)
      if (!line || line.pricedOnVisit) return null
      return line.price
    } catch {
      return null
    }
  }

  return {
    gutter: priceFor(GUTTER_LABEL, { gutterClear: true }),
    fascia: priceFor(FASCIA_LABEL, { fasciaClean: true }),
    roofExternal: priceFor(ROOF_EXT_LABEL, { conservatoryRoofCleanExternal: true }),
    roofInternal: priceFor(ROOF_INT_LABEL, { conservatoryRoofCleanInternal: true }),
    internalWindow: priceFor(INTERNAL_LABEL, { adHocInternalClean: true }),
  }
}

function scheduledPrice(quote: CalcResult | null | undefined, label: string): number {
  return quote?.schedule?.find((s) => s.label === label)?.price ?? 0
}

function selectedPrice(snap: Snapshot, quote: CalcResult | null | undefined): number {
  const freq = snap.residentialFrequency?.frequency
  if (freq === 'one-off') return scheduledPrice(quote, 'One-off')
  if (freq === 6) return scheduledPrice(quote, '6-weekly')
  if (freq === 8) return scheduledPrice(quote, '8-weekly')
  if (freq === 12) return scheduledPrice(quote, '12-weekly')
  return 0
}

/**
 * transform: `monthly_value` / `yearly_value` used to be computed inside a workflow.
 * Cleans per year is floor(52 / interval) — matches the live data (6-weekly £30 → £240/yr,
 * 8-weekly £28 → £168/yr). A one-off has no recurring value.
 */
function recurringValue(snap: Snapshot, regular: number): { monthly: number; yearly: number } {
  const freq = snap.residentialFrequency?.frequency
  if (freq !== 6 && freq !== 8 && freq !== 12) return { monthly: 0, yearly: 0 }
  const yearly = Math.floor(52 / freq) * regular
  return { monthly: Math.round(yearly / 12), yearly }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * transform: `appointment_day_requested` is the day name joined to the date —
 * "Wednesday, 26-08-2026" — which a workflow used to assemble.
 *
 * The day name comes from the chosen date itself. The old flow derived it from the
 * postcode's first service day instead, which agrees only as long as the customer picks
 * a date the round actually runs — and silently disagrees with its own date string when
 * they do not.
 */
function appointmentDayLabel(snap: Snapshot): string {
  const booking = snap.bookingDetails
  const selected = booking?.selectedDate
  if (!selected) {
    // No date yet: fall back to the round's service day for this postcode
    if (!booking?.postcode) return ''
    const serviceDays = getServiceDaysForPostcode(booking.postcode)
    return serviceDays?.length ? DAY_NAMES[serviceDays[0]] : ''
  }

  const date = new Date(selected)
  if (Number.isNaN(date.getTime())) return ''

  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${DAY_NAMES[date.getDay()]}, ${dd}-${mm}-${date.getFullYear()}`
}

/**
 * transform: `booking_completion_date` is a real DATE field recording the day the customer
 * *completed* the booking — not the day they want cleaning. That is
 * `appointment_day_requested`. Only the complete action passes a value here.
 */
function asDateOnly(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** The human-readable line per booked service, joined into `booked_services_array`. */
function bookedServicesText(snap: Snapshot, quote: CalcResult | null | undefined, prices: AddonPrices): string {
  const money = (n: number | null, label: string) => (n === null ? `${label} — price on request` : `${label} - £${n}`)
  const lines: string[] = []
  const freq = snap.residentialFrequency?.frequency
  const addons = snap.residentialFrequency?.addons ?? {}
  const price = selectedPrice(snap, quote)
  const spec = roofPricing(snap)
  const onVisit = spec?.status === 'unknown'

  if (freq === 'one-off') lines.push(`One-off external window clean - £${price}`)
  else if (freq === 6 || freq === 8 || freq === 12) lines.push(`${freq} week external window clean - £${price}`)

  if (addons.adHocInternalClean) lines.push(money(prices.internalWindow, 'Internal Window Cleaning'))
  if (addons.gutterClear) lines.push(money(prices.gutter, 'Gutter Clearance'))
  if (addons.fasciaClean) lines.push(money(prices.fascia, 'Fascia Soffit & Gutter Washing'))
  if (addons.conservatoryRoofCleanExternal) {
    lines.push(onVisit
      ? 'Conservatory roof cleaning (external) — price confirmed on visit (£10 per panel)'
      : money(prices.roofExternal, 'Conservatory Roof Cleaning - External'))
  }
  if (addons.conservatoryRoofCleanInternal) {
    lines.push(onVisit
      ? 'Conservatory roof cleaning (internal) — price confirmed on visit (£10 per panel)'
      : money(prices.roofInternal, 'Conservatory Roof Cleaning - Internal'))
  }

  return lines.join(', ')
}

/** The `booked_services` checkbox selections. Option strings must match GHL exactly. */
function bookedServicesChecklist(snap: Snapshot): string[] {
  const picked: string[] = []
  const freq = snap.residentialFrequency?.frequency
  const addons = snap.residentialFrequency?.addons ?? {}

  if (freq === 6) picked.push(CHECKLIST.freq6)
  else if (freq === 8) picked.push(CHECKLIST.freq8)
  else if (freq === 12) picked.push(CHECKLIST.freq12)
  else if (freq === 'one-off') picked.push(CHECKLIST.oneOff)

  if (addons.adHocInternalClean) picked.push(CHECKLIST.internalWindow)
  if (addons.gutterClear) picked.push(CHECKLIST.gutter)
  if (addons.fasciaClean) picked.push(CHECKLIST.fascia)
  if (addons.conservatoryRoofCleanExternal) picked.push(CHECKLIST.conservatoryExternal)
  if (addons.conservatoryRoofCleanInternal) picked.push(CHECKLIST.conservatoryInternal)

  return picked
}

/** The address the customer gave, whichever branch they came down. */
function addressOf(snap: Snapshot): { address1: string; city: string; postcode: string } {
  const src = snap.bookingDetails ?? snap.largeUnusualAddress ?? snap.businessDetails ?? null
  return {
    address1: src?.address1 ?? '',
    city: src?.city ?? '',
    postcode: src?.postcode ?? '',
  }
}

/**
 * Builds the contact write. Only fields with a real value are included, so a partially
 * completed form never blanks out data an earlier step already wrote.
 */
export type BuiltContactWrite = {
  write: GhlContactWrite
  /** Frequency + selected add-ons — the value a won opportunity carries. */
  firstCleanPrice: number | null
}

export function buildContactWrite(
  snapshot: Snapshot,
  options: {
    webformToken?: string | null
    quote?: CalcResult | null
    /** ISO timestamp of booking completion — set only when the submission is closed out. */
    completedAt?: string | null
    /** Per-row API prices. When present they are written verbatim, never recomputed. */
    priceTable?: PriceTable | null
  } = {},
): BuiltContactWrite {
  const snap = snapshot ?? {}
  const contact = snap.contactData ?? {}
  const quote = options.quote ?? snap.residentialQuoteResult ?? null
  const prices = addonPrices(snap, options.priceTable ?? null)
  const address = addressOf(snap)

  const write: GhlContactWrite = { customFields: [] }
  let firstCleanPrice: number | null = null
  const put = (id: string, value: string | number | string[] | null | undefined) => {
    if (value === null || value === undefined) return
    if (typeof value === 'string' && !value) return
    if (Array.isArray(value) && value.length === 0) return
    write.customFields.push({ id, field_value: value })
  }

  // ── standard contact fields ──
  const { firstName, lastName } = splitName(contact.fullName)
  if (firstName) write.firstName = firstName
  if (lastName) write.lastName = lastName
  if (contact.fullName?.trim()) write.name = contact.fullName.trim()
  if (contact.email) write.email = contact.email
  const phone = toE164Phone(contact.phone)
  if (phone) write.phone = phone
  if (snap.businessDetails?.businessName) write.companyName = snap.businessDetails.businessName
  if (address.address1) write.address1 = address.address1
  if (address.city) write.city = address.city
  if (address.postcode) write.postalCode = address.postcode

  // ── who they are ──
  put(FIELD.webformToken, options.webformToken ?? null)
  put(FIELD.howDidYouHearAboutUs, contact.hearAboutUs)
  put(FIELD.referrer, contact.referralName)
  put(FIELD.typeOfProperty, snap.propertyType ?? contact.propertyType)

  // ── the property ──
  put(FIELD.typeOfHouse, typeOfHouse(snap))
  const bedrooms = snap.propertyDetails?.bedrooms
  if (bedrooms) put(FIELD.numberOfBedrooms, String(bedrooms))
  // "Yes"/"No" exactly — GHL rejects raw booleans here, and the bot's booking guard
  // reads these back to re-derive the price
  const pd = snap.propertyDetails
  if (pd?.hasExtension !== undefined) put(FIELD.extension, yes(pd.hasExtension) ? 'Yes' : 'No')
  if (pd?.hasConservatory !== undefined) put(FIELD.conservatory, yes(pd.hasConservatory) ? 'Yes' : 'No')

  const spec = roofPricing(snap)
  if (spec?.status === 'unknown') put(FIELD.conservatoryRoofPanels, CONSERVATORY_ROOF_PANELS_UNKNOWN_LABEL)
  else if (spec?.status === 'count') put(FIELD.conservatoryRoofPanels, String(spec.panelCount))

  // ── where they are ──
  // Despite the name, this field holds the full booking address — postcode included
  if (address.address1) {
    put(FIELD.addressLine, [address.address1, address.city, address.postcode].filter(Boolean).join(', '))
  }
  put(FIELD.postalCodeForBooking, address.postcode)

  // ── commercial branch ──
  put(FIELD.buildingType, snap.businessDetails?.buildingType)
  const cleaningTypes = snap.businessDetails?.cleaningTypes
  if (Array.isArray(cleaningTypes) && cleaningTypes.length) {
    put(FIELD.typeOfCleaningRequired, cleaningTypes.join(', '))
  }

  // ── the quote ──
  //
  // Prices are filed under the field each row *names* (`ghlField`), falling back to the
  // known mapping only when the API did not say — a price-book change on the bot side
  // then cannot silently land a price in the wrong field.
  if (quote) {
    const table = options.priceTable ?? null

    const putPrice = (key: ServiceKey, value: number | null) => {
      if (value === null) return
      const named = ghlFieldOf(table, key)
      const id = (named ? FIELD_ID_BY_GHL_NAME[named] : undefined) ?? FALLBACK_FIELD_BY_KEY[key]
      if (!id) {
        console.warn(`[ghl] no field for ${key}${named ? ` (API named "${named}")` : ''} — skipping`)
        return
      }
      put(id, value)
    }

    if (table) {
      for (const key of SERVICE_KEYS) putPrice(key, priceOf(table, key))
    } else {
      // Local book: the schedule carries the four frequencies, add-ons come from `prices`
      putPrice('ext_window_6weekly', scheduledPrice(quote, '6-weekly') || null)
      putPrice('ext_window_8weekly', scheduledPrice(quote, '8-weekly') || null)
      putPrice('ext_window_12weekly', scheduledPrice(quote, '12-weekly') || null)
      putPrice('ext_window_oneoff', scheduledPrice(quote, 'One-off') || null)
      putPrice('full_gutter_clearance', prices.gutter)
      putPrice('fascia_soffit_gutter', prices.fascia)
      putPrice('conservatory_roof_external', prices.roofExternal)
      putPrice('conservatory_roof_internal', prices.roofInternal)
      putPrice('int_window_oneoff', prices.internalWindow)
    }

    const regular = selectedPrice(snap, quote)
    const addons = snap.residentialFrequency?.addons ?? {}
    // Summing distinct returned prices is fine; re-deriving one is not
    const firstClean = regular
      + (addons.gutterClear ? (prices.gutter ?? 0) : 0)
      + (addons.fasciaClean ? (prices.fascia ?? 0) : 0)
      + (addons.conservatoryRoofCleanExternal ? (prices.roofExternal ?? 0) : 0)
      + (addons.conservatoryRoofCleanInternal ? (prices.roofInternal ?? 0) : 0)
      + (addons.adHocInternalClean ? (prices.internalWindow ?? 0) : 0)

    put(FIELD.regularPrice, regular)
    put(FIELD.firstCleanPrice, firstClean)
    firstCleanPrice = firstClean

    const { monthly, yearly } = recurringValue(snap, regular)
    put(FIELD.monthlyValue, monthly)
    put(FIELD.yearlyValue, yearly)

    put(FIELD.bookedServicesArray, bookedServicesText(snap, quote, prices))
    put(FIELD.bookedServices, bookedServicesChecklist(snap))
  }

  // ── the booking ──
  const booking = snap.bookingDetails
  if (booking) {
    put(FIELD.appointmentDayRequested, appointmentDayLabel(snap))
    put(
      FIELD.appointmentTimeRequested,
      booking.appointmentTime
        || (booking.selectedDate && booking.timePreference
          ? formatAppointmentTime(booking.selectedDate, booking.timePreference)
          : ''),
    )
    put(FIELD.customerIssue, booking.additionalNotes)
  }

  // The day the booking was completed, distinct from the requested service day above.
  // Only a real booking has one — a commercial or large/unusual enquiry completes the
  // form without booking anything, and stamping this would misreport it as a booking.
  if (options.completedAt && booking) {
    put(FIELD.bookingCompletionDate, asDateOnly(options.completedAt))
  }

  return { write, firstCleanPrice }
}
