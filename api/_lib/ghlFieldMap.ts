/**
 * Turns a form snapshot into the GHL contact payload.
 *
 * This replaces the old webhook body. Field ids were verified against contacts the
 * previous webhook flow created, so values land exactly where the workflows already
 * expect them — see the four `transform:` notes for logic that used to live inside a
 * GHL workflow and now has to happen here.
 *
 * `docs/pricing_api_poleposition.md` is the single source of truth for what this client
 * sells and what each row means; section references below point into it.
 */
import {
  EXT_WINDOW_ONEOFF_LABEL,
  frequencyLabel,
  INT_WINDOW_ONEOFF_LABEL,
  isRecurringPlan,
  ONE_OFF_PLAN,
  supportsAncillaryServices,
  supportsUplifts,
  type CalcResult,
  type HouseKind,
} from '../../src/lib/costing-calc.js'
import { toE164Phone } from '../../src/lib/phone.js'
import { houseKindFor } from '../../src/lib/property-kind.js'
import { normalisePropertyType } from './inboundFields.js'
import {
  ANCILLARY_KEYS,
  ghlFieldOf,
  LABEL_BY_SERVICE_KEY,
  ONEOFF_KEYS,
  priceOf,
  QUOTE_REQUEST_SERVICE,
  ROOF_KEYS,
  SERVICE_KEYS,
  WINDOW_KEYS,
  type PriceTable,
  type ServiceKey,
} from '../../src/lib/pricing.js'

/**
 * Every custom field this form writes, addressed by id.
 *
 * These are POLE POSITION CLEANING's ids (location `gTgq0KNEOclOtud3I65l`), all read back
 * from the live location and re-verified by `npm run check:ghl`, which passes with zero
 * failures. They are deliberately NOT the We Wash Everything ids this file was cloned
 * with, nor the Greenmaster ids behind those.
 *
 * That lineage is the whole hazard, and it cost a week of leads once already: an id is
 * minted PER LOCATION, a clone keeps the source id only as `originId`, and a foreign id
 * therefore looks entirely plausible while matching nothing. GHL then discards an unknown
 * custom field id *silently* rather than rejecting the write — the request returns 200 and
 * the fields simply are not there. Inherited ids are not a wrong value you can spot in the
 * CRM; they are an absent one behind a success.
 *
 * This block was in exactly that state until 2026-09-19: 41 of the 42 ids were the
 * previous client's, so every CRM write this form made was a no-op reporting success.
 * Re-read from the live location by `fieldKey` — never translated by hand — which is why
 * the pairing below is enforced by `FIELD_KEY` rather than by end-of-line comments. The
 * key is what survives a clone, so it is what `scripts/ghl-config-check.ts` re-verifies
 * these ids against. Run `npm run check:ghl` after any change here.
 */
export const FIELD = {
  howDidYouHearAboutUs: '6LlJYZWSH6lmgkGxZOuu',      // contact.how_did_you_hear_about_us
  typeOfProperty: 'D02sjkOcKFrj9NfzLGf9',            // contact.tyoe_of_property (GHL's own typo)
  typeOfHouse: 'NGhxVEVsk7mk8l2okhWT',               // contact.type_of_house
  numberOfBedrooms: 'ScN67vj76W7wQYqofkKK',          // contact.number_of_bedrooms


  loftConversion: 'mV7lq23zw8TF5TWDoURY',            // contact.do_you_have_a_loft_conversion
  extension: 'LBaw008vCwk0sT88GhIv',                 // contact.extension
  conservatory: 'pl6n8Y4hWtqA3FNKdGXX',              // contact.conservatory

  /**
   * contact.number_of_conservatory_panel — carried, never written with a value.
   *
   * Conservatory roof cleaning is priced from a house x bedroom table here. There is no
   * `unit_rate` service anywhere in this catalogue and the field is not even in this
   * client's `field_mapping`, so a panel count prices nothing (§4) and the form no longer
   * asks for one. Kept because the field exists in this location and
   * may hold a count written before the rebrand, and a number left standing under a
   * table-priced quote reads as the basis of that quote.
   */
  conservatoryRoofPanels: 'wlZZFxW2TjB8fOgDJvrr',

  velux: 'BgirXsrQhzhE7nwQb4Vf',                     // contact.velux
  outdoorAccess: 'bl7QGQVYgPakFBFB9BuK',             // contact.outdoor_access
  /**
   * contact.number_of_velux — carried, never written with a value.
   *
   * Velux is a yes/no gate on this client and there is no count anywhere in the price.
   * The field exists in the location as a leftover from the sub-account clone, is not in
   * this client's `field_mapping`, and nothing reads it (§3). Kept for the same reason as
   * the panel count: it may hold a number written before the rebrand, and a count standing
   * beside a gate-priced quote reads as the basis of that quote.
   */
  numberOfVelux: 'PzjkCDMoqYfne5dsyyYk',
  addressLine: 'YQ8KqXk59oJHrwSnnExI',               // contact.address__postal_code — holds the address
  postalCodeForBooking: 'aDjz4XiKl7D3o3WZNv35',      // contact.postal_code_for_booking
  buildingType: 'izmmNCyZ951LMga1DWdg',              // contact.building_type
  typeOfCleaningRequired: 'xM4TwQlkWN4cTmsrFkDm',    // contact.type_of_cleaning_required

  /**
   * The eight per-service price fields (§3).
   *
   * This client sells on a 4- and 8-weekly cycle — there is no `contact.6weekly` or
   * `contact.12weekly` here. The two one-off cleans are DIFFERENT numbers from each
   * other (1.5x and 2x the 8-weekly), and are written to two separate fields because
   * that is where the bot reads each of them from. Both are now sellable from the quote
   * screen as well: the external one-off is the third plan, the internal one an add-on.
   */
  price4Weekly: 'BUVPB7UimJLaw4rDFhra',              // contact.4weekly
  price8Weekly: 'da9feUPFlKTD4aJgvf7m',              // contact.8weekly
  oneOffExternalWindow: 'cwnCANgf6pyHSiWZjAGx',      // contact.oneoff
  oneOffInternalWindow: 'q4uNbwFmmRM1Ij2S7H86',      // contact.ad_hoc_internal_window_cleaning
  gutterClearance: '6hYO6vPztj6vd1762wML',           // contact.full_gutter_clearance
  /**
   * contact.fascia_soffit_and_gutter_clean — the live field key, kept verbatim.
   *
   * The service is `fascia_soffit_clean` here and it does NOT include gutter clearance:
   * fascia and gutter are two independent tables with different numbers, which cross by a
   * pound on a detached 4-bed (§5). The field name is the location's own history, not a
   * claim about what is in the price.
   */
  fasciaSoffitGutterClean: 'Pcl7p3dvkdNJxb2fVlNo',
  conservatoryRoofExternal: 'YJkY1H4Tvq3rkG9UY4Px',  // contact.conservatory_roof_cleaning
  conservatoryRoofInternal: 'gMyBloo6lm41edArOaQq',  // contact.con_roof

  firstCleanPrice: 'V2jtw0qHiJEaML4ZNVwQ',           // contact.first_clean_price
  regularPrice: '5LlaJyy431bzjtBUpnxu',              // contact.regular_price
  monthlyValue: 'UiV4ICP0TdqVHMIMZRoS',              // contact.monthly_value
  yearlyValue: 'KJmKyMoi4d1i6KJ0GBqr',               // contact.yearly_value
  bookingCompletionDate: 'ZndWy9G27eOUTRke91k4',     // contact.booking_completion_date
  bookedServicesArray: 'nnP8AD9WLRgxxAuUY6Qf',       // contact.booked_services_array
  bookedServices: 'P78vyhXXqOViYDjRk1U9',            // contact.booked_services — CHECKBOX

  /**
   * contact.quote_request_array — the manual-quote counterpart of
   * `booked_services_array` (§4).
   *
   * A booking fills the booked-services pair; a lead the form cannot price does not, and
   * without this the team opens a "quote requested" opportunity with nothing on it saying
   * what was actually asked for. The two branches that land here are commercial premises
   * and large/unusual properties — neither reaches the quote screen at all, so neither
   * has a service list to write.
   */
  quoteRequestArray: 'NAdsHxcq2NeAnYIMGMIj',         // contact.quote_request_array

  /**
   * contact.quote_requested — CHECKBOX, and its only option is "Pressure Washing".
   *
   * The structured counterpart of `quote_request_array`, and the pair works exactly as
   * `booked_services` / `booked_services_array` does: one is prose for a human to read,
   * one is a picklist for a workflow to filter on. A quote-request automation cannot
   * segment on free text, which is why both are written rather than just the readable one.
   */
  quoteRequested: 'lsZA9eJwwZvjn5iICaOb',            // contact.quote_requested — CHECKBOX

  customerIssue: 'CmaNk9LxB1EOS6cdvwFD',             // contact.customer_issue
  webformToken: 'r8pVJnoTXmsI5S87fNFV',              // contact.webform_token
  referrer: 'DOXswsTxCEaZXMM2C91B',                  // contact.referrer

  // No appointment day/time fields: the form no longer asks. The round decides which day
  // a property is cleaned, so a slot picked in the form was a promise the schedule had
  // not agreed to.
} as const

/**
 * What each id above is supposed to BE — the same `contact.*` keys the comments carry, in a
 * form a program can check.
 *
 * The docblock on `FIELD` has always said `check:ghl` re-verifies these ids against their
 * field keys. It could not: the keys lived only in end-of-line comments, so the script could
 * assert that an id existed in the location and no more. An id that existed but pointed at
 * the wrong field — the exact result of transposing two lines while reading them back from a
 * new sub-account — passed silently, and the write then landed a bedroom count in, say, the
 * postcode field. That is worse than a discarded write, because it looks like data.
 *
 * `Record<keyof typeof FIELD, string>` is what keeps this honest: adding an id above without
 * naming its key here fails to compile, so the pair cannot drift the way an id and a comment
 * beside it can.
 */
export const FIELD_KEY: Record<keyof typeof FIELD, string> = {
  howDidYouHearAboutUs: 'contact.how_did_you_hear_about_us',
  typeOfProperty: 'contact.tyoe_of_property',
  typeOfHouse: 'contact.type_of_house',
  numberOfBedrooms: 'contact.number_of_bedrooms',
  loftConversion: 'contact.do_you_have_a_loft_conversion',
  extension: 'contact.extension',
  conservatory: 'contact.conservatory',
  conservatoryRoofPanels: 'contact.number_of_conservatory_panel',
  velux: 'contact.velux',
  outdoorAccess: 'contact.outdoor_access',
  numberOfVelux: 'contact.number_of_velux',
  addressLine: 'contact.address__postal_code',
  postalCodeForBooking: 'contact.postal_code_for_booking',
  buildingType: 'contact.building_type',
  typeOfCleaningRequired: 'contact.type_of_cleaning_required',
  price4Weekly: 'contact.4weekly',
  price8Weekly: 'contact.8weekly',
  oneOffExternalWindow: 'contact.oneoff',
  oneOffInternalWindow: 'contact.ad_hoc_internal_window_cleaning',
  gutterClearance: 'contact.full_gutter_clearance',
  fasciaSoffitGutterClean: 'contact.fascia_soffit_and_gutter_clean',
  conservatoryRoofExternal: 'contact.conservatory_roof_cleaning',
  conservatoryRoofInternal: 'contact.con_roof',
  firstCleanPrice: 'contact.first_clean_price',
  regularPrice: 'contact.regular_price',
  monthlyValue: 'contact.monthly_value',
  yearlyValue: 'contact.yearly_value',
  bookingCompletionDate: 'contact.booking_completion_date',
  bookedServicesArray: 'contact.booked_services_array',
  bookedServices: 'contact.booked_services',
  quoteRequestArray: 'contact.quote_request_array',
  quoteRequested: 'contact.quote_requested',
  customerIssue: 'contact.customer_issue',
  webformToken: 'contact.webform_token',
  referrer: 'contact.referrer',
}

/**
 * `ghlField` on a priced row names where that price belongs (`contact.6weekly`). The spec
 * says read it from the response rather than hard-coding, so a price-book change cannot
 * silently send a price to the wrong field — this resolves that name to the field id we
 * write by. All eight of this client's service fields are here (§4).
 */
const FIELD_ID_BY_GHL_NAME: Record<string, string> = {
  'contact.4weekly': FIELD.price4Weekly,
  'contact.8weekly': FIELD.price8Weekly,
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
  ext_window_4weekly: FIELD.price4Weekly,
  ext_window_8weekly: FIELD.price8Weekly,
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
  freq4: '4 weekly external window cleaning',
  freq8: '8 weekly external window cleaning',
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

/**
 * Delegates to the shared resolver rather than keeping a second copy. The copy that used
 * to live here had already drifted: it returned 'townhouse', a house type this client has
 * no row for and refuses outright, and it ignored `townhouseKind` entirely (§3).
 */
function houseKindOf(snap: Snapshot): HouseKind | null {
  return houseKindFor(snap.residentialType, snap.bungalowKind, snap.townhouseKind)
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
 * which is a fact about this answer rather than about the property type (§9b). So a roof
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
  internalWindow: number | null
}

/**
 * Add-on prices for the CRM, read straight off the API's table.
 *
 * Same rows `buildCalcResult` reads for the quote page, so the contact and the screen can
 * never show different numbers. A row the API declined to price — or no table at all —
 * yields null and writes nothing: there is no second price book to ask, and a 0 sitting
 * on a contact reads as "free" to every workflow that renders it.
 *
 * The internal roof clean is 1.5x the external (`multiplier_of_service` — NOT the
 * `same_as_service` a sibling contract uses, so the two are different numbers), and
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
    internalWindow: priceOf(table, 'int_window_oneoff'),
  }
}

function scheduledPrice(quote: CalcResult | null | undefined, label: string): number {
  return quote?.schedule?.find((s) => s.label === label)?.price ?? 0
}

/**
 * What the customer's chosen plan costs — a cycle's price, or the one-off's.
 *
 * 4 or 8 are this client's only two cycles. This read 6/12 after the rebrand, a branch
 * that can never be true, so every customer's selected price came back 0: regular_price
 * and first_clean_price went unwritten, and because api/submission.ts gates the booking
 * confirmation on first_clean_price, EVERY plain window-clean booking was demoted to a
 * quote request (§4, "two traps cost money").
 *
 * The one-off is read from the TABLE rather than from `quote.schedule`, because the
 * schedule only ever carries the two recurring rows. Its own row is the only place that
 * price exists.
 */
function selectedPrice(
  snap: Snapshot,
  quote: CalcResult | null | undefined,
  table: PriceTable | null,
): number {
  const plan = snap.residentialFrequency?.plan
  if (plan === ONE_OFF_PLAN) return priceOf(table, 'ext_window_oneoff') ?? 0
  if (plan === 4 || plan === 8) return scheduledPrice(quote, frequencyLabel(plan))
  return 0
}

/**
 * transform: `monthly_value` / `yearly_value` used to be computed inside a workflow.
 * Cleans per year is 52 / interval — 13 at 4-weekly, 6.5 at 8-weekly. NOT floored: an
 * 8-weekly round really is six and a half visits a year, and flooring it to 6 undercounts
 * the annual value by about 8%. The add-ons-only
 * case leaves the frequency null and has no recurring value at all.
 */
function recurringValue(snap: Snapshot, regular: number): { monthly: number; yearly: number } {
  const plan = snap.residentialFrequency?.plan

  /**
   * Only a RECURRING plan has an annual value. A one-off happens once, and an
   * add-ons-only selection has no plan at all — both correctly yield nothing here, which
   * is why `isRecurringPlan` narrows rather than a truthiness test.
   *
   * This guard used to read `if (freq !== 6 && freq !== 12) return {0, 0}`. With
   * Frequency = 4 | 8 that condition is ALWAYS true, so both fields came back 0 for every
   * customer and `put` dropped them — monthly_value and yearly_value were never written
   * at all. It survived the earlier sweep of dead 6/12 branches because it is the
   * inverted form: the others read `=== 6 || === 12` and were caught by searching for
   * those.
   */
  if (!isRecurringPlan(plan)) return { monthly: 0, yearly: 0 }

  // NOT floored. An 8-weekly round really is 6.5 visits a year, and Math.floor took it to
  // 6 — undercounting the annual value by about 8% and contradicting the note above this
  // function, which has always said "NOT floored".
  const yearly = (52 / plan) * regular
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
 * Only a flat is refused. A townhouse arrives already resolved to a base type, because
 * this client has no `Town house` row at all (§3), and that base type is treated like
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
 * property (their root is `ext_window_8weekly`, which prices flats, so they survive the
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

/**
 * What a customer asked for that this form cannot put a price on, for
 * `contact.quote_request_array`.
 *
 * Three branches reach this and they carry different answers, so the text is assembled
 * per branch rather than from a shared shape. Returns '' when the customer asked for
 * nothing unpriced, which `put` drops — this field must stay empty on a lead whose whole
 * order was quoted, or the team cannot tell the two kinds of opportunity apart.
 *
 * The residential branch is NOT mutually exclusive with a booking, and that is the
 * difference from the two below it. A customer can book a window clean AND ask for a
 * pressure-washing quote in the same submission; that is a booking that also carries a
 * quote request, not a third kind of lead. Only a submission with nothing priced in it at
 * all becomes a quote request outright — `handleComplete` draws that line, not this.
 */
function quoteRequestText(snap: Snapshot): string {
  const lines: string[] = []

  if (snap.residentialFrequency?.addons?.pressureWashing) {
    lines.push(`${QUOTE_REQUEST_SERVICE.label} — priced on survey`)
  }

  const business = snap.businessDetails
  if (business?.businessName || business?.buildingType) {
    lines.push('Commercial premises — priced on survey')
    if (business.businessName) lines.push(`Business: ${business.businessName}`)
    if (business.buildingType) lines.push(`Building type: ${business.buildingType}`)
    const types = business.cleaningTypes
    if (Array.isArray(types) && types.length) lines.push(`Cleaning required: ${types.join(', ')}`)
  }

  // Large/unusual is the one residential branch with no priced kind at all, so the
  // property answers it did give are the whole of what the team has to work from.
  if (snap.largeUnusualAddress) {
    lines.push('Large or unusual property — priced on survey')
    const pd = snap.propertyDetails
    if (typeof pd?.bedrooms === 'number') lines.push(`Bedrooms: ${pd.bedrooms}`)
    if (pd?.hasLoftConversion !== undefined) lines.push(`Loft conversion: ${yes(pd.hasLoftConversion) ? 'Yes' : 'No'}`)
    if (pd?.hasExtension !== undefined) lines.push(`Extension: ${yes(pd.hasExtension) ? 'Yes' : 'No'}`)
    if (pd?.hasConservatory !== undefined) lines.push(`Conservatory: ${yes(pd.hasConservatory) ? 'Yes' : 'No'}`)
    if (pd?.hasVelux !== undefined) {
      lines.push(
        `Velux windows: ${yes(pd.hasVelux) ? 'Yes' : 'No'}`,
      )
    }
  }

  return lines.join('\n')
}

/** The human-readable line per booked service, joined into `booked_services_array`. */
function bookedServicesText(
  snap: Snapshot,
  quote: CalcResult | null | undefined,
  prices: AddonPrices,
  table: PriceTable | null,
): string {
  // Gutter and fascia are priced for every house type but never for a flat, and both roof
  // rows hang on the conservatory answer. A flag surviving a change to either answer must
  // not put the service on the CRM record the booking guard reads back.
  const offersAncillary = ancillaryOfferedFor(snap)
  const offersRoof = roofOfferedFor(snap)
  const money = (n: number | null, label: string) => (n === null ? `${label} — price on request` : `${label} - £${n}`)
  const lines: string[] = []
  const plan = snap.residentialFrequency?.plan
  const addons = snap.residentialFrequency?.addons ?? {}
  const price = selectedPrice(snap, quote, table)

  // `price || null` so an unpriced clean reads "price on request" rather than "£0" — the
  // team quotes from this line, and a free clean is not what we mean by it.
  // Same dead 6/12 branch as selectedPrice: booked_services correctly listed
  // "4 weekly external window cleaning" while booked_services_array carried only the
  // add-ons — exactly the silent half-write §4 warns about.
  if (plan === 4 || plan === 8) {
    lines.push(money(price || null, `${plan} weekly external window clean`))
  } else if (plan === ONE_OFF_PLAN) {
    lines.push(money(price || null, EXT_WINDOW_ONEOFF_LABEL))
  }

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
  // No offered-gate: the internal window clean has no house-type restriction, so unlike
  // the four above there is no answer a customer can change that withdraws it.
  if (addons.internalWindowClean) {
    lines.push(money(prices.internalWindow, INT_WINDOW_ONEOFF_LABEL))
  }

  return lines.join(', ')
}

/** The `booked_services` checkbox selections. Option strings must match GHL exactly. */
function bookedServicesChecklist(snap: Snapshot): string[] {
  const picked: string[] = []
  const offersAncillary = ancillaryOfferedFor(snap)
  const offersRoof = roofOfferedFor(snap)
  const plan = snap.residentialFrequency?.plan
  const addons = snap.residentialFrequency?.addons ?? {}

  if (plan === 4) picked.push(CHECKLIST.freq4)
  else if (plan === 8) picked.push(CHECKLIST.freq8)
  // The picklist has carried this option since the location was cloned, with nothing
  // selecting it — the quote screen had no way to sell a one-off. Now it has.
  else if (plan === ONE_OFF_PLAN) picked.push(CHECKLIST.oneOffExternal)

  if (offersAncillary && addons.gutterClear) picked.push(CHECKLIST.gutter)
  if (offersAncillary && addons.fasciaClean) picked.push(CHECKLIST.fascia)
  if (offersRoof && addons.conservatoryRoofCleanExternal) picked.push(CHECKLIST.conservatoryExternal)
  if (offersRoof && addons.conservatoryRoofCleanInternal) picked.push(CHECKLIST.conservatoryInternal)
  if (addons.internalWindowClean) picked.push(CHECKLIST.oneOffInternal)

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
  /**
   * `contact.tyoe_of_property` and `contact.type_of_house` are written as a pair, and the
   * first is inferred from the second when it is missing.
   *
   * The browser form always knows its own `propertyType` — it is the branch the customer
   * picked — so this changes nothing for a hand-filled quote. It matters for every other
   * way a snapshot can reach here: `/api/prefill` takes a caller's record, and a record
   * kept somewhere other than this form very often holds the kind of home without the
   * higher-level classification, because that box is the answer to a question only this
   * form asks. Writing the house type and leaving the pair half-empty would leave the CRM
   * unable to segment residential from commercial on leads that are plainly residential.
   *
   * The inference runs in one direction only and only from a house type this form prices.
   * `normalisePropertyType` is the single copy of that rule; see it for why an unknown
   * house type infers nothing rather than defaulting.
   */
  const houseType = typeOfHouse(snap)
  const propertyType = normalisePropertyType(snap.propertyType ?? contact.propertyType, houseType)
  put(FIELD.typeOfProperty, propertyType.ok ? propertyType.value : null)

  // ── the property ──
  put(FIELD.typeOfHouse, houseType)

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
     * Loft and Velux are PRICING inputs as well as survey answers (§7a), and both are
     * REQUIRED: `requiredInputs` is global here, so omitting either answers
     * `missing_inputs` on every row — including rows whose own table carries no
     * surcharge for it.
     *
     * They are still only written here, never re-derived from: the price the API returned
     * already has every uplift inside it, so adding anything on this side would charge
     * twice. What the bot's booking guard reads back is the answer, not a cost.
     *
     * Velux is a GATE and nothing else. This client charges once for the property however
     * many roof windows it has, and has no `number_of_velux` input — the CRM field of
     * that name is a leftover from the sub-account clone, is not in this client's
     * `field_mapping`, and nothing reads it (§3). It is deliberately not written: a count
     * standing beside a table-priced quote reads as the basis of that quote, and there is
     * no count in the price.
     */
    if (pd?.hasVelux !== undefined) {
      put(FIELD.velux, yes(pd.hasVelux) ? 'Yes' : 'No')
    }

    /**
     * The access answer, which is not a surcharge but does change what was quoted: "no"
     * prices the three external window rows at `max(0.5 x full, 14.00)` (§7c). Writing it
     * is what lets anyone opening the contact see WHY a window price is half the book
     * rate — without it a front-only quote is indistinguishable from a mispriced one.
     */
    if (pd?.hasOutdoorAccess !== undefined) {
      put(FIELD.outdoorAccess, yes(pd.hasOutdoorAccess) ? 'Yes' : 'No')
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

  // ── the manual-quote branches ──
  //
  // The counterpart of `booked_services_array`, and it exists for the same reason: the
  // team quotes from a line of prose, not from a scatter of fields. Neither of these
  // customers ever reaches the quote screen, so neither has a booked service to list —
  // what they have is the handful of answers that decide the price by hand.
  //
  // Written only when the branch is actually reached. `put` drops an empty string, so a
  // lead that asked for nothing unpriced never touches this field and a commercial lead
  // never gets a half-filled one.
  put(FIELD.quoteRequestArray, quoteRequestText(snap))

  /**
   * The structured half of the same answer, for the workflows that filter on it.
   *
   * Written from the same flag the prose is, so the two cannot disagree — and CLEARED
   * rather than skipped when the customer has made a selection that does not include it.
   * Skipping is what leaves a stale "Pressure Washing" standing on a contact who ticked it,
   * went back and unticked it: `put` drops an empty array, so without the `clear` the
   * previous answer would survive the correction and the team would quote a job nobody
   * asked for. This is the same blank-don't-skip rule the stale prices below follow.
   *
   * Gated on `residentialFrequency` — the object the quote step submits — because only
   * then has the customer actually answered this question. Clearing it earlier would wipe
   * an answer that simply has not been given yet.
   */
  if (snap.residentialFrequency) {
    const quoteRequested = snap.residentialFrequency?.addons?.pressureWashing
    if (quoteRequested) put(FIELD.quoteRequested, [QUOTE_REQUEST_SERVICE.option])
    else clear(FIELD.quoteRequested)
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
    // whenever the conservatory answer does (§9b).
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
  // the quote step. `selectedPrice` is 0 until then, and a 0 written here is
  // indistinguishable in the CRM from a genuine £0 — the bot would quote a first clean of
  // nothing to someone who has picked nothing. The gate is `residentialFrequency`, the
  // object that step submits, not `.plan` inside it: the add-ons-only case leaves the
  // latter null while still being a real choice.
  if (quote && snap.residentialFrequency) {
    const planPrice = selectedPrice(snap, quote, table)
    const addons = snap.residentialFrequency?.addons ?? {}
    const offersAncillary = ancillaryOfferedFor(snap)
    const offersRoof = roofOfferedFor(snap)
    // Summing distinct returned prices is fine; re-deriving one is not. Every term is a
    // number the API gave us for its own row — nothing here is 2 x anything (§4).
    const firstClean = planPrice
      + (addons.internalWindowClean ? (prices.internalWindow ?? 0) : 0)
      + (offersAncillary && addons.gutterClear ? (prices.gutter ?? 0) : 0)
      + (offersAncillary && addons.fasciaClean ? (prices.fascia ?? 0) : 0)
      + (offersRoof && addons.conservatoryRoofCleanExternal ? (prices.roofExternal ?? 0) : 0)
      + (offersRoof && addons.conservatoryRoofCleanInternal ? (prices.roofInternal ?? 0) : 0)

    /**
     * `regular_price` is the price that REPEATS, so only a recurring plan has one.
     *
     * A one-off is deliberately left blank rather than written with its own price. The
     * field feeds the bot's "your regular clean is £x" line and the pipeline's recurring
     * revenue; putting a single clean's price there would promise a customer a round they
     * did not buy, and count them as recurring revenue they do not represent.
     * `first_clean_price` still carries the real figure, so the booking routes correctly
     * and the team can see what was actually sold.
     *
     * `|| null` for the same reason firstCleanPrice below uses it: `put` keeps a
     * numeric 0, and £0 in the CRM is indistinguishable from a genuinely free clean.
     */
    const recurringPrice = isRecurringPlan(snap.residentialFrequency?.plan) ? planPrice : 0
    put(FIELD.regularPrice, recurringPrice || null)
    // `firstClean` reaches 0 only when nothing the customer picked carried a price at all —
    // every selected row refused, which on this client means the property went to a human
    // anyway. `put` does not drop numeric 0, and a £0 first clean reads in the CRM as a
    // genuinely free job. `handleComplete` routes this to a quote request, so the field
    // stays empty until the team has a number. The raw figure is still returned below,
    // because that is what does the routing.
    put(FIELD.firstCleanPrice, firstClean || null)
    firstCleanPrice = firstClean

    const { monthly, yearly } = recurringValue(snap, recurringPrice)
    put(FIELD.monthlyValue, monthly || null)
    put(FIELD.yearlyValue, yearly || null)

    put(FIELD.bookedServicesArray, bookedServicesText(snap, quote, prices, table))
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
