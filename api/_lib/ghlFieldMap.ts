/**
 * Turns a form snapshot into the GHL contact payload.
 *
 * This replaces the old webhook body. Field ids were verified against contacts the
 * previous webhook flow created, so values land exactly where the workflows already
 * expect them — see the four `transform:` notes for logic that used to live inside a
 * GHL workflow and now has to happen here.
 */
import {
  supportsAncillaryServices, frequencyLabel, type CalcResult, type ConservatoryRoofPricingInput, type FlatFloor, type HouseKind } from '../../src/lib/costing-calc.js'
import { CONSERVATORY_ROOF_PANELS_UNKNOWN_LABEL } from '../../src/lib/conservatory-roof-copy.js'
import { toE164Phone } from '../../src/lib/phone.js'
import { FLOOR_LABEL_BY_FLOOR, ghlFieldOf, priceOf, SERVICE_KEYS, type PriceTable, type ServiceKey } from '../../src/lib/pricing.js'

/**
 * Contact custom fields in the GREENMASTER location, addressed by id.
 *
 * These are deliberately NOT the Kings ids. The Greenmaster location is a snapshot clone
 * of Kings, and a clone re-mints every id — GHL keeps the source id as `originId`, which
 * is why the Kings values looked plausible and matched nothing. GHL then discards an
 * unknown custom field id silently instead of rejecting the write, so every field except
 * `contact.4weekly` (identical in both locations by luck) vanished without an error.
 *
 * Each id carries its `fieldKey`. The key is what survives a clone, so it is what
 * `scripts/ghl-config-check.ts` re-verifies these ids against.
 */
export const FIELD = {
  howDidYouHearAboutUs: 'a1Z1YXHYMXb2jJO0cXhs',      // contact.how_did_you_hear_about_us
  typeOfProperty: 'Wpus1reAd9pEwH3VfA3T',            // contact.tyoe_of_property (GHL's own typo)
  typeOfHouse: 'HpRCh3Ga9mLFyMmLnSlz',               // contact.type_of_house
  numberOfBedrooms: 'dFA5FfMrksDcUevUMCNQ',          // contact.number_of_bedrooms
  floorFlat: 'zDcXJEFzHrd64dOlvLqV',                 // contact.floor_flat
  extension: 'ZlXoANmwfFOoBPGQGlo7',                 // contact.extension
  conservatory: 'mbf2wV57sTfGbjAohPKu',              // contact.conservatory
  conservatoryRoofPanels: 'An66EOD29bqEoatxesq0',    // contact.conservatory_roof_panels
  addressLine: 'BCEteT4KYzfshYgUiUrS',               // contact.address__postal_code — holds the address
  postalCodeForBooking: '2ORJEpyUeP08RCbIgJr2',      // contact.postal_code_for_booking
  buildingType: 'OHIXgxoVcb4WTDui4rP4',              // contact.building_type
  typeOfCleaningRequired: 'DJQDJT8i1C2XQh9vVJSR',    // contact.type_of_cleaning_required
  price4Weekly: 'BcHYvdIUBNUFMfmPC8p5',              // contact.4weekly
  price8Weekly: 'K9pg6bZEwKKI3XtvFrCr',              // contact.8weekly
  firstCleanPrice: '2DfkwFO8JibGgytO4XUw',           // contact.first_clean_price
  regularPrice: 'Nt8XxbLEcf8hXSMYEgfi',              // contact.regular_price
  gutterClearance: 'fklbgKOToxwzKvLF2wdl',           // contact.full_gutter_clearance
  fasciaSoffitGutterClean: '5DrVGgJjzYlgMNwIJIAJ',   // contact.fascia_soffit_and_gutter_clean
  conservatoryRoofExternal: 'nnLDZk9pWwBo0vufvhhe',  // contact.conservatory_roof_cleaning
  monthlyValue: 'OBCbCjHA2rPhjm9tuusX',              // contact.monthly_value
  yearlyValue: 't3S48sG20aetFBlwQpeZ',               // contact.yearly_value
  bookingCompletionDate: 'ekIzmoKOkCgzBmaY2wtL',     // contact.booking_completion_date
  bookedServicesArray: 'zOnArN7URK5gA4Vj9a9m',       // contact.booked_services_array
  bookedServices: 'JEMyHAGGNn6YOSRn11oO',            // contact.booked_services — CHECKBOX

  customerIssue: 'rIGLsMeFGOLfkFkdxdkm',             // contact.customer_issue
  webformToken: 'BJHCrqtSLGjBoY7YmKfi',              // contact.webform_token
  referrer: 'sc8jA7xmSC2TpTk0enUh',                  // contact.referrer

  // No appointment day/time fields: the form no longer asks. The round decides which day
  // a property is cleaned, so a slot picked in the form was a promise the schedule had
  // not agreed to. Every field this map names now exists in the location — `put` still
  // skips a null id, and the config check still fails on an id that resolves to nothing.
} as const

/**
 * `ghlField` on a priced row names where that price belongs (`contact.4weekly`). The spec
 * says read it from the response rather than hard-coding, so a price-book change cannot
 * silently send a price to the wrong field — this resolves that name to the field id we
 * write by. A name we do not recognise is skipped and logged, never guessed at.
 */
const FIELD_ID_BY_GHL_NAME: Record<string, string> = {
  'contact.4weekly': FIELD.price4Weekly,
  'contact.8weekly': FIELD.price8Weekly,
  'contact.full_gutter_clearance': FIELD.gutterClearance,
  'contact.fascia_soffit_and_gutter_clean': FIELD.fasciaSoffitGutterClean,
  'contact.fascia_soffit_gutter': FIELD.fasciaSoffitGutterClean,
  'contact.conservatory_roof_cleaning': FIELD.conservatoryRoofExternal,
}

/** Where each row lands when the API priced it but did not name a field. */
const FALLBACK_FIELD_BY_KEY: Partial<Record<ServiceKey, string>> = {
  ext_window_4weekly: FIELD.price4Weekly,
  ext_window_8weekly: FIELD.price8Weekly,
  full_gutter_clearance: FIELD.gutterClearance,
  fascia_soffit_gutter: FIELD.fasciaSoffitGutterClean,
  conservatory_roof_external: FIELD.conservatoryRoofExternal,
}

/** Exact option strings on the `booked_services` checkbox — these must match GHL verbatim. */
export const CHECKLIST = {
  freq4: '4 weekly external window cleaning',
  freq8: '8 weekly external window cleaning',
  gutter: 'full gutter clearance',
  fascia: 'fascia soffit and gutter clean',
  conservatoryExternal: 'external conservatory clean',
} as const

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
  if (t === 'flat') return 'flat'
  if (t === 'semi_detached' || t === 'terraced' || t === 'detached') return t
  return null
}

/**
 * The floor label for a flat, as the price sheet spells it.
 *
 * A flat carries no bedroom count, so without this the CRM has nothing at all recording
 * what was priced. Reads `propertyDetails.floor` — the same object the house answers
 * live in — so a resumed submission rebuilds it from one place.
 */
function flatFloorLabel(snap: Snapshot): string {
  if (houseKindOf(snap) !== 'flat') return ''
  const floor = snap.propertyDetails?.floor
  return typeof floor === 'string' && floor in FLOOR_LABEL_BY_FLOOR ? FLOOR_LABEL_BY_FLOOR[floor as FlatFloor] : ''
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
}

/**
 * Add-on prices for the CRM, read straight off the API's table.
 *
 * Same rows `buildCalcResult` reads for the quote page, so the contact and the screen can
 * never show different numbers. A row the API declined to price — or no table at all —
 * yields null and writes nothing: there is no second price book to ask, and a 0 sitting
 * on a contact reads as "free" to every workflow that renders it.
 */
function addonPrices(table: PriceTable | null): AddonPrices {
  return {
    gutter: priceOf(table, 'full_gutter_clearance'),
    fascia: priceOf(table, 'fascia_soffit_gutter'),
    roofExternal: priceOf(table, 'conservatory_roof_external'),
  }
}

function scheduledPrice(quote: CalcResult | null | undefined, label: string): number {
  return quote?.schedule?.find((s) => s.label === label)?.price ?? 0
}

function selectedPrice(snap: Snapshot, quote: CalcResult | null | undefined): number {
  const freq = snap.residentialFrequency?.frequency
  if (freq === 4 || freq === 8) return scheduledPrice(quote, frequencyLabel(freq))
  return 0
}

/**
 * transform: `monthly_value` / `yearly_value` used to be computed inside a workflow.
 * Cleans per year is floor(52 / interval) — 13 at 4-weekly, 6 at 8-weekly. The add-ons-only
 * case leaves the frequency null and has no recurring value at all.
 */
function recurringValue(snap: Snapshot, regular: number): { monthly: number; yearly: number } {
  const freq = snap.residentialFrequency?.frequency
  if (freq !== 4 && freq !== 8) return { monthly: 0, yearly: 0 }
  const yearly = Math.floor(52 / freq) * regular
  return { monthly: Math.round(yearly / 12), yearly }
}

/**
 * transform: `booking_completion_date` is a real DATE field recording the day the customer
 * *completed the form*. Set on every completed outcome, quote requests included.
 * Only the complete action passes a value here.
 */
function asDateOnly(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * True when this property can be offered gutter clearance and fascia/soffit at all.
 *
 * Unknown kind means an early step, where nothing has been ruled out yet — so it
 * defaults to true rather than silently dropping a service the customer did pick.
 */
function ancillaryOfferedFor(snap: Snapshot): boolean {
  const kind = houseKindOf(snap)
  return kind ? supportsAncillaryServices(kind) : true
}

/** The human-readable line per booked service, joined into `booked_services_array`. */
function bookedServicesText(snap: Snapshot, quote: CalcResult | null | undefined, prices: AddonPrices): string {
  // Gutter and fascia are priced for terraced/semi/detached only. A townhouse or flat is
  // never offered either, so a flag surviving a property-type change must not put the
  // service on the CRM record the booking guard reads back.
  const offersAncillary = ancillaryOfferedFor(snap)
  const money = (n: number | null, label: string) => (n === null ? `${label} — price on request` : `${label} - £${n}`)
  const lines: string[] = []
  const freq = snap.residentialFrequency?.frequency
  const addons = snap.residentialFrequency?.addons ?? {}
  const price = selectedPrice(snap, quote)
  const spec = roofPricing(snap)
  const onVisit = spec?.status === 'unknown'

  // `price || null` so an unpriced clean reads "price on request" rather than "£0" — the
  // team quotes from this line, and a free clean is not what we mean by it.
  if (freq === 4 || freq === 8) lines.push(money(price || null, `${freq} week external window clean`))

  if (offersAncillary && addons.gutterClear) lines.push(money(prices.gutter, 'Gutter Clearance'))
  if (offersAncillary && addons.fasciaClean) lines.push(money(prices.fascia, 'Fascia Soffit & Gutter Washing'))
  if (addons.conservatoryRoofCleanExternal) {
    lines.push(onVisit
      ? 'Conservatory roof cleaning (external) — price confirmed on visit, per glazed panel'
      : money(prices.roofExternal, 'Conservatory Roof Cleaning - External'))
  }

  return lines.join(', ')
}

/** The `booked_services` checkbox selections. Option strings must match GHL exactly. */
function bookedServicesChecklist(snap: Snapshot): string[] {
  const picked: string[] = []
  const offersAncillary = ancillaryOfferedFor(snap)
  const freq = snap.residentialFrequency?.frequency
  const addons = snap.residentialFrequency?.addons ?? {}

  if (freq === 4) picked.push(CHECKLIST.freq4)
  else if (freq === 8) picked.push(CHECKLIST.freq8)

  if (offersAncillary && addons.gutterClear) picked.push(CHECKLIST.gutter)
  if (offersAncillary && addons.fasciaClean) picked.push(CHECKLIST.fascia)
  if (addons.conservatoryRoofCleanExternal) picked.push(CHECKLIST.conservatoryExternal)

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
  const prices = addonPrices(options.priceTable ?? null)
  const address = addressOf(snap)

  const write: GhlContactWrite = { customFields: [] }
  let firstCleanPrice: number | null = null
  const put = (
    id: string | null,
    value: string | number | string[] | null | undefined,
  ) => {
    // A null id is a field this location has not got — see FIELD. Nothing to write to, so
    // skip; `scripts/ghl-config-check.ts` is what keeps the gap visible.
    if (!id) return
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

  /**
   * A house is priced by bedrooms, a flat by floor, and the two sets are mutually
   * exclusive. Writing only what applies is not enough: a customer who answers as a
   * house and then goes back and picks a flat has ALREADY had the house fields written
   * at the previous syncStep, and they would stand alongside the floor forever. `put`
   * drops '' on purpose, so blanking has to bypass it.
   *
   * Left alone entirely while the kind is unknown (step 1, commercial, large/unusual),
   * so an early step can never blank an answer that is simply not in yet.
   */
  const propertyKind = houseKindOf(snap)
  const clear = (id: string) => write.customFields.push({ id, field_value: '' })

  if (propertyKind === 'flat') {
    put(FIELD.floorFlat, flatFloorLabel(snap))
    clear(FIELD.numberOfBedrooms)
    clear(FIELD.extension)
    clear(FIELD.conservatory)
    clear(FIELD.conservatoryRoofPanels)
  } else {
    if (propertyKind) clear(FIELD.floorFlat)

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
  }

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

  // What the property costs is a fact about the property, so it is written as soon as we
  // know it — when the quote page loads its table, not when the customer picks a frequency.
  // Gating these on a choice is what left every lead who read the prices and walked away
  // with a contact carrying none: step 3 hands them to the late-abandonment workflow, whose
  // bot message renders exactly these fields, and it sent a price list with every price
  // blank.
  //
  // No table means no prices — not a cue to work some out. `priceOf` returns null for
  // every row the API declined, and `putPrice` writes nothing for a null.
  if (table) {
    // A table fetched before the customer changed property type can still carry gutter
    // and fascia rows. Writing them onto a townhouse or flat contact would hand the
    // booking guard a price for a service this property is never offered.
    const offersAncillary = ancillaryOfferedFor(snap)
    for (const key of SERVICE_KEYS) {
      if (!offersAncillary && (key === 'full_gutter_clearance' || key === 'fascia_soffit_gutter')) {
        continue
      }
      putPrice(key, priceOf(table, key))
    }
  }

  // Everything below describes a choice the customer has actually made, so it stays behind
  // the frequency step. `selectedPrice` is 0 until then, and a 0 written here is
  // indistinguishable in the CRM from a genuine £0 — the bot would quote a first clean of
  // nothing to someone who has picked nothing. The gate is `residentialFrequency`, the
  // object that step submits, not `.frequency` inside it: the add-ons-only case leaves the
  // latter null while still being a real choice.
  if (quote && snap.residentialFrequency) {
    const regular = selectedPrice(snap, quote)
    const addons = snap.residentialFrequency?.addons ?? {}
    // Summing distinct returned prices is fine; re-deriving one is not
    const firstClean = regular
      + (addons.gutterClear ? (prices.gutter ?? 0) : 0)
      + (addons.fasciaClean ? (prices.fascia ?? 0) : 0)
      + (addons.conservatoryRoofCleanExternal ? (prices.roofExternal ?? 0) : 0)

    // `|| null` for the same reason firstCleanPrice below uses it: `put` keeps a
    // numeric 0, and £0 in the CRM is indistinguishable from a genuinely free clean.
    put(FIELD.regularPrice, regular || null)
    // `firstClean` reaches 0 only when nothing the customer picked carried a price — an
    // unknown conservatory panel count with a roof clean and nothing else, which is quoted
    // per panel on the visit. `put` does not drop numeric 0, and a £0 first clean reads in
    // the CRM as a genuinely free job. `handleComplete` routes this to a quote request, so
    // the field stays empty until the team has a number. The raw figure is still returned
    // below, because that is what does the routing.
    put(FIELD.firstCleanPrice, firstClean || null)
    firstCleanPrice = firstClean

    const { monthly, yearly } = recurringValue(snap, regular)
    put(FIELD.monthlyValue, monthly || null)
    put(FIELD.yearlyValue, yearly || null)

    put(FIELD.bookedServicesArray, bookedServicesText(snap, quote, prices))
    put(FIELD.bookedServices, bookedServicesChecklist(snap))
  }

  // ── the booking ──
  // Just the notes now. The gate code and "round the back, past the bins" is the part the
  // cleaner actually needs; the appointment day and slot are the round's to decide.
  const booking = snap.bookingDetails
  if (booking) put(FIELD.customerIssue, booking.additionalNotes)

  // The day the form was completed — a booking, a commercial quote request or a
  // large/unusual one.
  if (options.completedAt) put(FIELD.bookingCompletionDate, asDateOnly(options.completedAt))

  return { write, firstCleanPrice }
}
