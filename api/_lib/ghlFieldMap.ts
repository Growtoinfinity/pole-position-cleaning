/**
 * Turns a form snapshot into the GHL contact payload.
 *
 * This replaces the old webhook body. Field ids were verified against contacts the
 * previous webhook flow created, so values land exactly where the workflows already
 * expect them — see the four `transform:` notes for logic that used to live inside a
 * GHL workflow and now has to happen here.
 *
 * `docs/pricing-api-wewasheverything.md` is the single source of truth for what this
 * client sells and what each row means; section references below point into it.
 */
import {
  frequencyLabel,
  supportsAncillaryServices,
  supportsUplifts,
  type CalcResult,
  type HouseKind,
} from '../../src/lib/costing-calc.js'
import { toE164Phone } from '../../src/lib/phone.js'
import {
  ANCILLARY_KEYS,
  ghlFieldOf,
  LABEL_BY_SERVICE_KEY,
  ONEOFF_KEYS,
  priceOf,
  ROOF_KEYS,
  SERVICE_KEYS,
  WINDOW_KEYS,
  type PriceTable,
  type ServiceKey,
} from '../../src/lib/pricing.js'

/**
 * Contact custom fields in the WE WASH EVERYTHING location (A9cGvKBunXk003dXUmSV),
 * addressed by id.
 *
 * These are deliberately NOT the Greenmaster ids, for the reason that cost a week of
 * leads once already: an id is minted per location, GHL keeps the source id only as
 * `originId`, and a foreign id looks entirely plausible while matching nothing. GHL then
 * discards an unknown custom field id *silently* instead of rejecting the write — the
 * request returns 200 and the fields simply are not there.
 *
 * Every id below was read back from the live location rather than translated by hand.
 * Each carries its `fieldKey`; the key is what survives a clone, so it is what
 * `scripts/ghl-config-check.ts` re-verifies these ids against. Run `npm run check:ghl`
 * after any change here.
 */
export const FIELD = {
  howDidYouHearAboutUs: 'b8Jl0AAxr7oOo2OkKoXs',      // contact.how_did_you_hear_about_us
  typeOfProperty: 'dmxtje8DBNcgZJgKXUN8',            // contact.tyoe_of_property (GHL's own typo)
  typeOfHouse: '2L4IncPeXtfbyl4kwHd1',               // contact.type_of_house
  numberOfBedrooms: 'J213UsNAzrUGzEojiLoi',          // contact.number_of_bedrooms

  /**
   * contact.floor_flat — carried, never written with a value.
   *
   * This client bands a flat on BEDROOMS exactly as it bands a house, and never asks
   * which floor a flat is on; the doc records this field as deliberately unused (§2, §7).
   * The id stays here so `check:ghl` keeps proving it exists, and so the write below can
   * blank it: an earlier version of this form did write a floor label, and a stale
   * "First floor" standing beside a bedroom-banded price tells the team the property was
   * quoted on something it was not.
   */
  floorFlat: '8f5Xm0b1gXStHkZpE0nI',

  loftConversion: 'XqsyByNbPqunxccSbU5G',            // contact.do_you_have_a_loft_conversion
  extension: '5acWIPV5tGnsGP1PbBK1',                 // contact.extension
  conservatory: 'DzNAsFhbkqfCXS8jlbXz',              // contact.conservatory

  /**
   * contact.conservatory_roof_panels — carried, never written with a value.
   *
   * Conservatory roof cleaning is priced from a house x bedroom table here. There is no
   * `unit_rate` service anywhere in this catalogue and the field is not even in this
   * client's `field_mapping`, so a panel count prices nothing (§4) and the form no longer
   * asks for one. Kept for the same reason as `floorFlat`: the field exists in GHL and
   * may hold a count written before the rebrand, and a number left standing under a
   * table-priced quote reads as the basis of that quote.
   */
  conservatoryRoofPanels: 'LceoeG4hbQd0A7qtBibq',

  velux: '3epm3jxevGIioHGcm1UD',                     // contact.velux
  numberOfVelux: 'xQARdCv4WZZNnAIofFXl',             // contact.number_of_velux
  addressLine: 'j4BDpPKja4F0MIQtIEUK',               // contact.address__postal_code — holds the address
  postalCodeForBooking: 'fIQ5QdUtw2khceVPWDhV',      // contact.postal_code_for_booking
  buildingType: 'afNhrw8V36ArViyUpIt6',              // contact.building_type
  typeOfCleaningRequired: 'XlI9UclC1r4aNwOcvCxZ',    // contact.type_of_cleaning_required

  /**
   * The eight per-service price fields (§4). One field per service key, and every one of
   * them read back from this location.
   *
   * This client sells on a 6- and 12-weekly cycle; there is no `contact.4weekly` or
   * `contact.8weekly` here and no 8-weekly service in the catalogue at all. The two
   * one-off cleans are always the same number as each other — 2 x the *external* 6-weekly
   * total, surcharges included in the doubling — and are still written to two separate
   * fields, because that is where the bot reads each of them from.
   */
  price6Weekly: 'w5vTLUcRmMwEunmZaLS6',              // contact.6weekly
  price12Weekly: 'fVzLeRzE6fRjHQPMVCNU',             // contact.12weekly
  oneOffExternalWindow: 'eQrYeuPJavBWg9Q3y0Ud',      // contact.oneoff
  oneOffInternalWindow: 'SCiXU4BhlWW0MlMeQmGF',      // contact.ad_hoc_internal_window_cleaning
  gutterClearance: 'qsAn6YOS61ZRJSUoP3qE',           // contact.full_gutter_clearance
  /**
   * contact.fascia_soffit_and_gutter_clean — the live field key, kept verbatim.
   *
   * The service is `fascia_soffit_clean` here and it does NOT include gutter clearance:
   * fascia and gutter are two independent tables with different numbers, which cross by a
   * pound on a detached 4-bed (§5). The field name is the location's own history, not a
   * claim about what is in the price.
   */
  fasciaSoffitGutterClean: 'Q7LUiMAvFKW5Ufz2jOaS',
  conservatoryRoofExternal: '3KMJNQAgE3ymgpMBmV2z',  // contact.conservatory_roof_cleaning
  conservatoryRoofInternal: 'WX37p483kZPOKg2i6Mj1',  // contact.con_roof

  firstCleanPrice: 'ywbgI0vRhsYqUYJpgOVV',           // contact.first_clean_price
  regularPrice: 'f2F8kSZB8O3vO6HuHDc8',              // contact.regular_price
  monthlyValue: 'JAvMcj1m21MNGmRyFEaz',              // contact.monthly_value
  yearlyValue: 'OWkwY2jp90rRY2QEEMme',               // contact.yearly_value
  bookingCompletionDate: 'yhbj1ydNVBTwowYgxcNd',     // contact.booking_completion_date
  bookedServicesArray: 'obIAoKsu3YoomgcbCw75',       // contact.booked_services_array
  bookedServices: 'DU0xRlJOZuH0wnmvbdog',            // contact.booked_services — CHECKBOX

  customerIssue: '60zghn5WjnAH4mxtVZoL',             // contact.customer_issue
  webformToken: '2IdXjWiIu72kyusEXaCA',              // contact.webform_token
  referrer: 'kTLbW8o4VKBm1swAqddW',                  // contact.referrer

  // No appointment day/time fields: the form no longer asks. The round decides which day
  // a property is cleaned, so a slot picked in the form was a promise the schedule had
  // not agreed to.
} as const

/**
 * `ghlField` on a priced row names where that price belongs (`contact.6weekly`). The spec
 * says read it from the response rather than hard-coding, so a price-book change cannot
 * silently send a price to the wrong field — this resolves that name to the field id we
 * write by. All eight of this client's service fields are here (§4).
 */
const FIELD_ID_BY_GHL_NAME: Record<string, string> = {
  'contact.6weekly': FIELD.price6Weekly,
  'contact.12weekly': FIELD.price12Weekly,
  'contact.oneoff': FIELD.oneOffExternalWindow,
  'contact.ad_hoc_internal_window_cleaning': FIELD.oneOffInternalWindow,
  'contact.full_gutter_clearance': FIELD.gutterClearance,
  'contact.fascia_soffit_and_gutter_clean': FIELD.fasciaSoffitGutterClean,
  'contact.conservatory_roof_cleaning': FIELD.conservatoryRoofExternal,
  'contact.con_roof': FIELD.conservatoryRoofInternal,
}

/**
 * Where each row lands when the API priced it but did not name a field.
 *
 * Complete rather than partial on purpose: a ninth service key added to `ServiceKey` then
 * fails to compile here instead of quietly having nowhere to be written.
 */
const FALLBACK_FIELD_BY_KEY: Record<ServiceKey, string> = {
  ext_window_6weekly: FIELD.price6Weekly,
  ext_window_12weekly: FIELD.price12Weekly,
  ext_window_oneoff: FIELD.oneOffExternalWindow,
  int_window_oneoff: FIELD.oneOffInternalWindow,
  full_gutter_clearance: FIELD.gutterClearance,
  fascia_soffit_clean: FIELD.fasciaSoffitGutterClean,
  conservatory_roof_external: FIELD.conservatoryRoofExternal,
  conservatory_roof_internal: FIELD.conservatoryRoofInternal,
}

/**
 * Exact option strings on the `booked_services` checkbox — these must match GHL verbatim.
 * A value that is not an exact option is dropped as silently as a bad field id.
 *
 * All eight were verified byte-exact against this location's live picklist on 2026-09-02
 * and are reproduced in §4. They are NOT the `serviceLabel` strings a quote returns
 * ("Gutter clearance", "Fascia and soffit clean"): those are a different set of words for
 * the same services, and mixing the two fails silently.
 *
 * `oneOffExternal` and `oneOffInternal` are options here that nothing below selects — the
 * quote screen sells a subscription plus add-ons and does not offer a one-off clean
 * (`offeredServiceKeys` in `pricing.ts` says why). They are listed so `check:ghl` proves
 * all eight strings still match the picklist, which is what §14 asks for before go-live,
 * and so the day one-offs are sold there is nothing to guess at.
 */
export const CHECKLIST = {
  freq6: '6 weekly external window cleaning',
  freq12: '12 weekly external window cleaning',
  oneOffExternal: 'one off external window cleaning',
  oneOffInternal: 'one off internal window cleaning',
  gutter: 'gutter clearance',
  fascia: 'fascia and soffit clean',
  conservatoryExternal: 'conservatory roof cleaning external',
  conservatoryInternal: 'conservatory roof cleaning internal',
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

/** Mirrors the old payload's `typeOfHouse`: the sub-kind when there is one. */
function typeOfHouse(snap: Snapshot): string {
  const t = snap.residentialType
  if (!t) return ''
  if (t === 'bungalow') return snap.bungalowKind || 'bungalow'
  if (t === 'townhouse') return snap.townhouseKind || 'townhouse'
  return String(t)
}

/**
 * The conservatory answer, from whichever branch asked it.
 *
 * It is not only a surcharge flag: it gates both roof services on the API side too. Any
 * answer but yes and both rows come back `not_applicable` — the *this-turn* flavour,
 * which is a fact about this answer rather than about the property type (§8b). So a roof
 * add-on flag that survived a "yes" being changed to a "no" has no price behind it, and
 * must not be recorded as booked either.
 */
function hasConservatoryAnswer(snap: Snapshot): boolean {
  return yes(snap.propertyDetails?.hasConservatory) || yes(snap.largeUnusualAddress?.hasConservatory)
}

/** A price we can write, or null when this row has no number to write. */
type AddonPrices = {
  gutter: number | null
  fascia: number | null
  roofExternal: number | null
  roofInternal: number | null
}

/**
 * Add-on prices for the CRM, read straight off the API's table.
 *
 * Same rows `buildCalcResult` reads for the quote page, so the contact and the screen can
 * never show different numbers. A row the API declined to price — or no table at all —
 * yields null and writes nothing: there is no second price book to ask, and a 0 sitting
 * on a contact reads as "free" to every workflow that renders it.
 *
 * The internal roof clean returns the external number verbatim (`same_as_service`, and
 * that table carries no `add` object on any cell, §4) — it is still READ from its own row
 * rather than copied from the external one, because "always equal" is a fact about
 * today's price book, not a contract.
 */
function addonPrices(table: PriceTable | null): AddonPrices {
  return {
    gutter: priceOf(table, 'full_gutter_clearance'),
    fascia: priceOf(table, 'fascia_soffit_clean'),
    roofExternal: priceOf(table, 'conservatory_roof_external'),
    roofInternal: priceOf(table, 'conservatory_roof_internal'),
  }
}

function scheduledPrice(quote: CalcResult | null | undefined, label: string): number {
  return quote?.schedule?.find((s) => s.label === label)?.price ?? 0
}

function selectedPrice(snap: Snapshot, quote: CalcResult | null | undefined): number {
  const freq = snap.residentialFrequency?.frequency
  if (freq === 6 || freq === 12) return scheduledPrice(quote, frequencyLabel(freq))
  return 0
}

/**
 * transform: `monthly_value` / `yearly_value` used to be computed inside a workflow.
 * Cleans per year is floor(52 / interval) — 8 at 6-weekly, 4 at 12-weekly. The add-ons-only
 * case leaves the frequency null and has no recurring value at all.
 */
function recurringValue(snap: Snapshot, regular: number): { monthly: number; yearly: number } {
  const freq = snap.residentialFrequency?.frequency
  if (freq !== 6 && freq !== 12) return { monthly: 0, yearly: 0 }
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
 * Only a flat is refused now — every table carries a `Town house` row byte-identical to
 * its `Terraced` one, so a townhouse buys both (§5). A flat has no row in either table
 * and is not classifiable under the `standard` normalisation they use, so the API refuses
 * them permanently (§8).
 *
 * Unknown kind means an early step, where nothing has been ruled out yet — so it
 * defaults to true rather than silently dropping a service the customer did pick.
 */
function ancillaryOfferedFor(snap: Snapshot): boolean {
  const kind = houseKindOf(snap)
  return kind ? supportsAncillaryServices(kind) : true
}

/** True when the two conservatory roof rows are on the table for this property. */
function roofOfferedFor(snap: Snapshot): boolean {
  const kind = houseKindOf(snap)
  // A flat is never asked about a conservatory, so a "yes" on one is an answer left over
  // from a house the customer picked before going back and changing the property type.
  if (kind && !supportsUplifts(kind)) return false
  return hasConservatoryAnswer(snap)
}

/**
 * The rows this property can be sold at all.
 *
 * Deliberately NOT `offeredServiceKeys`, which answers a different question — what the
 * quote SCREEN puts in front of the customer. The two one-off cleans are priced for every
 * property (their root is `ext_window_6weekly`, which prices flats, so they survive the
 * flat fence too, §8) and belong on the contact whether or not the screen sells them;
 * filing them under "not offered" would blank two fields the bot quotes from.
 */
function applicableServiceKeys(snap: Snapshot): Set<ServiceKey> | null {
  const kind = houseKindOf(snap)
  if (!kind) return null

  const keys: ServiceKey[] = [...WINDOW_KEYS, ...ONEOFF_KEYS]
  if (supportsAncillaryServices(kind)) keys.push(...ANCILLARY_KEYS)
  if (roofOfferedFor(snap)) keys.push(...ROOF_KEYS)
  return new Set(keys)
}

/** The human-readable line per booked service, joined into `booked_services_array`. */
function bookedServicesText(snap: Snapshot, quote: CalcResult | null | undefined, prices: AddonPrices): string {
  // Gutter and fascia are priced for every house type but never for a flat, and both roof
  // rows hang on the conservatory answer. A flag surviving a change to either answer must
  // not put the service on the CRM record the booking guard reads back.
  const offersAncillary = ancillaryOfferedFor(snap)
  const offersRoof = roofOfferedFor(snap)
  const money = (n: number | null, label: string) => (n === null ? `${label} — price on request` : `${label} - £${n}`)
  const lines: string[] = []
  const freq = snap.residentialFrequency?.frequency
  const addons = snap.residentialFrequency?.addons ?? {}
  const price = selectedPrice(snap, quote)

  // `price || null` so an unpriced clean reads "price on request" rather than "£0" — the
  // team quotes from this line, and a free clean is not what we mean by it.
  if (freq === 6 || freq === 12) lines.push(money(price || null, `${freq} weekly external window clean`))

  // The API's own labels for the add-ons, so this line and the quote screen call each
  // service the same thing (§4).
  if (offersAncillary && addons.gutterClear) {
    lines.push(money(prices.gutter, LABEL_BY_SERVICE_KEY.full_gutter_clearance))
  }
  if (offersAncillary && addons.fasciaClean) {
    lines.push(money(prices.fascia, LABEL_BY_SERVICE_KEY.fascia_soffit_clean))
  }
  if (offersRoof && addons.conservatoryRoofCleanExternal) {
    lines.push(money(prices.roofExternal, LABEL_BY_SERVICE_KEY.conservatory_roof_external))
  }
  if (offersRoof && addons.conservatoryRoofCleanInternal) {
    lines.push(money(prices.roofInternal, LABEL_BY_SERVICE_KEY.conservatory_roof_internal))
  }

  return lines.join(', ')
}

/** The `booked_services` checkbox selections. Option strings must match GHL exactly. */
function bookedServicesChecklist(snap: Snapshot): string[] {
  const picked: string[] = []
  const offersAncillary = ancillaryOfferedFor(snap)
  const offersRoof = roofOfferedFor(snap)
  const freq = snap.residentialFrequency?.frequency
  const addons = snap.residentialFrequency?.addons ?? {}

  if (freq === 6) picked.push(CHECKLIST.freq6)
  else if (freq === 12) picked.push(CHECKLIST.freq12)

  if (offersAncillary && addons.gutterClear) picked.push(CHECKLIST.gutter)
  if (offersAncillary && addons.fasciaClean) picked.push(CHECKLIST.fascia)
  if (offersRoof && addons.conservatoryRoofCleanExternal) picked.push(CHECKLIST.conservatoryExternal)
  if (offersRoof && addons.conservatoryRoofCleanInternal) picked.push(CHECKLIST.conservatoryInternal)

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

  const propertyKind = houseKindOf(snap)
  const clear = (id: string) => write.customFields.push({ id, field_value: '' })

  /**
   * Bedrooms band EVERY property, a flat included: the client's rule is that a flat is
   * asked its bedroom count exactly as a house is and is never asked its floor (§7). So
   * this is no longer a house-only write, and the two fields that belonged to the old
   * questions are blanked below rather than merely left alone.
   */
  const bedrooms = snap.propertyDetails?.bedrooms
  if (bedrooms) put(FIELD.numberOfBedrooms, String(bedrooms))

  /**
   * Nothing writes a flat's floor or a panel count any more. Skipping the write is not
   * enough: a contact quoted by an earlier version of this form still carries whatever it
   * wrote then, and both values would sit beside a table price looking like its basis.
   * `put` drops '' on purpose, so blanking has to bypass it.
   *
   * Only once the kind is known — an early step, commercial or large/unusual has ruled
   * nothing out yet.
   */
  if (propertyKind) {
    clear(FIELD.floorFlat)
    clear(FIELD.conservatoryRoofPanels)
  }

  /**
   * The uplift and survey questions are asked of houses only, so a flat's answers are
   * blanked rather than skipped — a customer who answered as a house and then went back
   * and picked a flat has ALREADY had them written at the previous syncStep, and they
   * would stand forever.
   *
   * The unknown-kind case falls into the second branch and writes whatever `propertyDetails`
   * holds, exactly as before: it can never blank an answer that is simply not in yet.
   */
  if (propertyKind === 'flat') {
    clear(FIELD.loftConversion)
    clear(FIELD.extension)
    clear(FIELD.conservatory)
    clear(FIELD.velux)
    clear(FIELD.numberOfVelux)
  } else {
    // "Yes"/"No" exactly — GHL rejects raw booleans here, and the bot's booking guard
    // reads these back to re-derive the price
    const pd = snap.propertyDetails
    if (pd?.hasLoftConversion !== undefined) put(FIELD.loftConversion, yes(pd.hasLoftConversion) ? 'Yes' : 'No')
    if (pd?.hasExtension !== undefined) put(FIELD.extension, yes(pd.hasExtension) ? 'Yes' : 'No')
    if (pd?.hasConservatory !== undefined) put(FIELD.conservatory, yes(pd.hasConservatory) ? 'Yes' : 'No')

    /**
     * Loft and Velux are PRICING inputs as well as survey answers, and §6 of the client
     * doc says the opposite — it records both as declared but never charged. That section
     * predates the surcharges being implemented. Verified against the live API on
     * 2026-09-09: a loft conversion adds £2 to each window row, £6 to fascia and £5 to
     * gutter on a 3-bed semi, and each Velux adds £1 to the window rows (fascia and gutter
     * carry no `velux` key). `loft` is required — omit it and every row answers
     * `missing_inputs`.
     *
     * They are still only written here, never re-derived from: the price the API returned
     * already has both uplifts inside it, so adding anything on this side would charge
     * twice. What the bot's booking guard reads back is the answer, not a cost.
     *
     * The count is only meaningful behind a "Yes", and a count left standing under a "No"
     * would both tell the cleaner to expect roof windows that are not there and imply a
     * price that was never charged — so "No" blanks it rather than leaving the old number.
     */
    if (pd?.hasVelux !== undefined) put(FIELD.velux, yes(pd.hasVelux) ? 'Yes' : 'No')
    if (yes(pd?.hasVelux)) {
      if (typeof pd?.veluxCount === 'number') put(FIELD.numberOfVelux, String(pd.veluxCount))
    } else if (pd?.hasVelux !== undefined) {
      clear(FIELD.numberOfVelux)
    }
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
    const byName = named ? FIELD_ID_BY_GHL_NAME[named] : undefined
    // Every service key resolves through the fallback, so the price is still filed — but a
    // field name we do not recognise means the price book has been re-pointed and this map
    // has not caught up. Worth a log line rather than being discovered in the CRM.
    if (named && !byName) {
      console.warn(`[ghl] API named "${named}" for ${key}, which is not a field we know — filing under the mapped field`)
    }
    put(byName ?? FALLBACK_FIELD_BY_KEY[key], value)
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
    // A table fetched before the property type or the conservatory answer changed can
    // still carry rows this property cannot buy — gutter and fascia on a flat, a roof
    // clean where the conservatory answer is now no. Writing one hands the booking guard a
    // price for a service the customer cannot buy.
    //
    // Skipping the write is not enough, and that was the original mistake here: skipping
    // leaves whatever was written last time standing. A contact re-quoted from a house to
    // a flat kept gutter, fascia and roof prices — the flat is not even shown those rows.
    // Blank them, exactly as the property answers above are blanked, and for the reason.
    //
    // This is the only sense in which a `not_applicable` row is acted on here: a stale
    // NUMBER is removed. The verdict itself is never persisted — the roof rows come back
    // whenever the conservatory answer does (§8b).
    //
    // Only once the kind is known. Null is an early step, commercial or large/unusual,
    // where nothing has been ruled out yet and blanking would destroy an answer that is
    // simply not in yet.
    const applicable = applicableServiceKeys(snap)

    for (const key of SERVICE_KEYS) {
      if (applicable && !applicable.has(key)) {
        clear(FALLBACK_FIELD_BY_KEY[key])
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
    const offersAncillary = ancillaryOfferedFor(snap)
    const offersRoof = roofOfferedFor(snap)
    // Summing distinct returned prices is fine; re-deriving one is not. Every term is a
    // number the API gave us for its own row — nothing here is 2 x anything (§4).
    const firstClean = regular
      + (offersAncillary && addons.gutterClear ? (prices.gutter ?? 0) : 0)
      + (offersAncillary && addons.fasciaClean ? (prices.fascia ?? 0) : 0)
      + (offersRoof && addons.conservatoryRoofCleanExternal ? (prices.roofExternal ?? 0) : 0)
      + (offersRoof && addons.conservatoryRoofCleanInternal ? (prices.roofInternal ?? 0) : 0)

    // `|| null` for the same reason firstCleanPrice below uses it: `put` keeps a
    // numeric 0, and £0 in the CRM is indistinguishable from a genuinely free clean.
    put(FIELD.regularPrice, regular || null)
    // `firstClean` reaches 0 only when nothing the customer picked carried a price at all —
    // every selected row refused, which on this client means the property went to a human
    // anyway. `put` does not drop numeric 0, and a £0 first clean reads in the CRM as a
    // genuinely free job. `handleComplete` routes this to a quote request, so the field
    // stays empty until the team has a number. The raw figure is still returned below,
    // because that is what does the routing.
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
