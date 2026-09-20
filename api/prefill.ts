/**
 * Mints a ready-to-quote link for a customer whose details you already hold.
 *
 * POST the contact and the property, get back a URL. Opening it lands the customer
 * straight on the quote page with real prices, and they can book from there. Nobody
 * re-types what you already knew.
 *
 *   POST /api/prefill
 *   Authorization: Bearer $PREFILL_API_KEY
 *
 * Server-to-server only. It writes a CRM contact and mints a URL carrying a live quote,
 * so it is authenticated with a shared key and never called from the browser — a key in
 * browser JavaScript is a key every visitor can lift out of dev tools.
 *
 * It is a composition, not a second pipeline: the same `resolveQuote` the form uses, the
 * same `pushToCrm`, the same `submissions` row and the same `?token=` resume that the
 * "continue where you left off" email already relies on. That is deliberate — a parallel
 * path that built quotes its own way would drift from the form within a release.
 *
 * The caller-facing contract is docs/prefill-api-reference.md — request shape, response
 * shape, every status code and what a caller should do with each. That is the document to
 * change when this file changes. docs/prefilled-quote-links.md is the generic procedure
 * this endpoint was built from, kept for whoever builds the same thing for another company;
 * it is not a description of what this route does today.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  getSupabaseAdmin,
  ghlLocationId,
  isSupabaseConfigured,
  SUBMISSIONS_TABLE,
  type SubmissionRow,
} from './_lib/supabaseServer.js'
import { resolveQuote } from './_lib/quoteSource.js'
import { pushToCrm } from './submission.js'
import { houseKindFor } from '../src/lib/property-kind.js'
import { hasSelectableRow, pricingUnavailable } from '../src/lib/pricing.js'
import type { CalcInput } from '../src/lib/costing-calc.js'
import { STEP_REACHED } from '../src/lib/form-steps.js'
import {
  firstPresent,
  isPresent,
  normaliseHearAboutUs,
  normalisePropertyType,
  normaliseVelux,
  yesNoOf,
  type VeluxAnswer,
} from './_lib/inboundFields.js'

type Json = Record<string, unknown>

/**
 * The step the link lands on. `residentialQuote` is the desktop id; the browser swaps in
 * the mobile screen on a narrow viewport by itself, so one value covers both.
 */
const LANDING_STEP = 'residentialQuote'

/** House types this endpoint accepts, as the form's own `residentialType` values. */
const RESIDENTIAL_TYPES = ['terraced', 'semi_detached', 'detached', 'townhouse', 'flat', 'bungalow']

/** A bungalow is priced as its base type, so the caller has to say which. */
const BUNGALOW_KINDS = ['terraced', 'semi_detached', 'detached']

/**
 * A townhouse is resolved to its base type before pricing — this client has NO `Town house`
 * row and refuses one outright (§3) — so this changes no
 * number. It is accepted so that `contact.type_of_house` reads the same for a townhouse
 * however the record was created: the browser form asks the question and writes the
 * sub-kind, and without this the endpoint would write the bare word "townhouse" for the
 * same property. A field that means two things depending on which door the lead came
 * through cannot be reported on.
 */
const TOWNHOUSE_KINDS = ['terraced', 'semi_detached', 'detached']

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
}

function asTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * A GHL contact id: 20-odd URL-safe characters, no punctuation.
 *
 * Shape-checked rather than taken on trust because of what a wrong one costs. A malformed
 * id is written onto the submissions row, and `pushToCrm` then updates "that exact contact"
 * and skips the create-or-match entirely — so the lead is quoted against a record that does
 * not exist, and nothing anywhere reports a failure. Checking the shape does not prove the
 * contact is real; it does catch the mapping bugs that send an email address, a UUID with
 * dashes or a whole JSON blob into this field.
 */
const CONTACT_ID_PATTERN = /^[A-Za-z0-9_-]{15,32}$/

type Validated = {
  contactId: string | null
  contactData: Json
  residentialType: string
  bungalowKind: string | null
  townhouseKind: string | null
  propertyDetails: Json
  bookingDetails: Json | null
  calcInput: CalcInput
  /**
   * Answers the caller did not give that we filled in to be able to price at all.
   *
   * Reported back in the 200 rather than kept quiet. Every one of them is a real assertion
   * about the customer's home that we made on the caller's behalf, and the caller is the
   * only party that can tell whether it was right.
   */
  assumed: string[]
}

/**
 * Rejects rather than guesses.
 *
 * A prefilled link goes to a named customer with prices already on it, so a wrong
 * assumption here is a wrong price in their inbox — far worse than a 400 the caller sees
 * straight away. Every message names the field and what it expects.
 *
 * Exported for `npm run check:inbound`, which asserts the request contract without a
 * Supabase project, a GHL token or a pricing key — every one of which `handlePrefill`
 * needs and none of which this function touches. Not part of the HTTP surface.
 */
export function validate(body: Json): { ok: true; value: Validated } | { ok: false; error: string } {
  const contact = asRecord(body.contact)
  const property = asRecord(body.property)
  const address = asRecord(body.address)

  /**
   * Contact aliases — the same fact under the name the caller's source happens to use.
   *
   * A Facebook lead form is the case this exists for. Its answers never arrive here as a
   * form payload: GHL writes them onto a contact record and fires a workflow carrying
   * nothing but `{"contact_id": "..."}`, so a portal reacting to that lead is reading GHL
   * CONTACT FIELDS and posting what it found. Those are `full_name`, `phone_number`,
   * `how_did_you_hear_about_us` — not this endpoint's camelCase.
   *
   * So the two intake paths are normalised to one shape here rather than the caller being
   * made to translate, which is the whole point of the alias mechanism: one reading of
   * "the same fact, spelled differently", in one place.
   *
   * `firstPresent`, never `??` — a caller mapping from a database populates one name and
   * leaves the other an EMPTY STRING rather than omitting it, and `??` reads '' as an
   * answer and masks the populated field beside it.
   */
  const fullName = asTrimmed(firstPresent(contact.fullName, contact.full_name, contact.name))
  const email = asTrimmed(contact.email)
  const phone = asTrimmed(firstPresent(contact.phone, contact.phone_number))

  /**
   * The CRM contact this quote belongs to.
   *
   * Send it whenever you have it. The caller is normally reacting to something that
   * happened to a contact in the CRM — a tag, a workflow — so it already knows exactly
   * which one, and saying so is both faster and safer than making us guess.
   *
   * Without it we fall back to matching on email, which is a guess with two failure
   * modes: a contact held under a different address gets a duplicate, and a
   * phone-only contact gets one every single time because there is nothing to match on.
   * A duplicate is not a tidiness problem — the tag, the pipeline and the workflows are
   * all on the original, so the customer is quoted on a record nothing is watching.
   */
  const contactId = asTrimmed(contact.contactId) || asTrimmed(body.contactId)

  // With an id, identity is already settled and these are optional extras. Without one,
  // they are the only means of finding or creating the contact, so they are required.
  if (!contactId) {
    if (!fullName) return { ok: false, error: 'contact.fullName is required (or send contact.contactId)' }
    if (!email && !phone) {
      return {
        ok: false,
        error: 'contact.email or contact.phone is required (or send contact.contactId)',
      }
    }
  } else if (!CONTACT_ID_PATTERN.test(contactId)) {
    return {
      ok: false,
      error: 'contact.contactId is not the shape of a GHL contact id',
    }
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'contact.email is not a valid email address' }
  }

  // Rule A. Optional, unconstrained, and never written blank over an existing answer.
  const hearAboutUs = normaliseHearAboutUs(
    firstPresent(contact.hearAboutUs, contact.how_did_you_hear_about_us),
  )
  if (!hearAboutUs.ok) return { ok: false, error: hearAboutUs.error }

  const type = asTrimmed(firstPresent(property.type, property.type_of_house))

  /**
   * Rule B, applied before the house type is validated so its verdict can be reported
   * first: a caller that names a house and leaves the higher-level box empty has told us
   * this is a home, and is not made to say so twice.
   *
   * Commercial is refused rather than quoted. This form has a commercial branch, but it
   * does not lead to the quote screen — business premises are surveyed and quoted by hand,
   * so there is no price for a link to carry. Minting one anyway would send a named
   * customer a "your quote" link that opens on an enquiry form, which is worse than the
   * 400 the caller can act on.
   */
  const propertyType = normalisePropertyType(
    firstPresent(property.propertyType, property.type_of_property),
    type,
  )
  if (!propertyType.ok) return { ok: false, error: propertyType.error }
  if (propertyType.value === 'commercial') {
    return {
      ok: false,
      error:
        'property.propertyType is commercial, which this endpoint cannot price — commercial premises are quoted by hand, so route this lead to your manual-quote path',
    }
  }

  if (!RESIDENTIAL_TYPES.includes(type)) {
    return { ok: false, error: `property.type must be one of: ${RESIDENTIAL_TYPES.join(', ')}` }
  }

  let bungalowKind: string | null = null
  if (type === 'bungalow') {
    bungalowKind = asTrimmed(property.bungalowKind)
    if (!BUNGALOW_KINDS.includes(bungalowKind)) {
      return {
        ok: false,
        error: `property.bungalowKind must be one of: ${BUNGALOW_KINDS.join(', ')} when property.type is bungalow`,
      }
    }
  }

  // Optional, unlike the bungalow's: it moves no money, so a caller that does not hold it
  // is not blocked. Supplied badly it is still rejected rather than dropped.
  let townhouseKind: string | null = null
  if (type === 'townhouse' && property.townhouseKind !== undefined && property.townhouseKind !== null) {
    const supplied = asTrimmed(property.townhouseKind)
    if (supplied) {
      if (!TOWNHOUSE_KINDS.includes(supplied)) {
        return {
          ok: false,
          error: `property.townhouseKind must be one of: ${TOWNHOUSE_KINDS.join(', ')} when property.type is townhouse`,
        }
      }
      townhouseKind = supplied
    }
  }

  const kind = houseKindFor(type, bungalowKind, townhouseKind)
  if (!kind) return { ok: false, error: `property.type "${type}" has no price band` }

  const propertyDetails: Json = {}
  const assumed: string[] = []

  /**
   * Every property answers this, a flat included.
   *
   * This client's `Flat` rows are keyed by BEDROOM count exactly as its house rows are,
   * and a flat is never asked which floor it is on — the client's own rule. There is no
   * `property.floor` to send any more, and a caller still sending one is ignored rather
   * than refused: `floor_level` is not read anywhere in this catalogue (§8), so it prices
   * nothing either way.
   *
   * `Number()` is deliberately not used to read the count. It takes `true` as 1 and `[4]`
   * as 4, so a caller with a mapping bug would be quoted a one-bedroom price for a
   * boolean — the exact "guess rather than reject" this function exists to prevent. Only
   * the two shapes a bedroom count is really written in are read.
   */
  const rawBedrooms = firstPresent(property.bedrooms, property.number_of_bedrooms)
  const bedrooms =
    typeof rawBedrooms === 'number'
      ? rawBedrooms
      : typeof rawBedrooms === 'string' && /^\d+$/.test(rawBedrooms.trim())
        ? Number(rawBedrooms.trim())
        : NaN
  if (!Number.isInteger(bedrooms) || bedrooms < 1) {
    return { ok: false, error: 'property.bedrooms must be a whole number of 1 or more' }
  }
  propertyDetails.bedrooms = bedrooms

  /**
   * And a flat answers nothing else.
   *
   * Its cells carry no `add` object at all, so neither uplift could ever apply (§5), and
   * gutter clearance, fascia/soffit and both conservatory roof cleans have no `Flat` row
   * to price from — the API refuses those four permanently for a flat (§8). The form does
   * not ask a flat any of these questions, so accepting answers to them here would put
   * values on the contact that the customer was never given the chance to give.
   */
  if (kind !== 'flat') {
    const hasExtension = yesNoOf(firstPresent(property.hasExtension, property.extension))
    const hasConservatory = yesNoOf(firstPresent(property.hasConservatory, property.conservatory))
    if (!hasExtension) return { ok: false, error: 'property.hasExtension must be yes or no' }
    if (!hasConservatory) return { ok: false, error: 'property.hasConservatory must be yes or no' }
    propertyDetails.hasExtension = hasExtension
    propertyDetails.hasConservatory = hasConservatory
    // No panel count is asked for and none is read. Conservatory roof cleaning is priced
    // from a house x bedroom table here — there is no `unit_rate` service anywhere in this
    // catalogue and `conservatory_roof_panels` is not in `field_mapping`, so sending one
    // prices nothing (§4). A caller still sending it is ignored, not rejected: that is the
    // promise this endpoint makes about fields that do not apply.
    //
    // The conservatory answer does more than add an uplift: it gates both roof services
    // outright. Answer anything but yes and the API returns them `not_applicable` for this
    // turn only (§9b) — which is why that verdict is never persisted anywhere.

    /**
     * A loft conversion is REQUIRED on a house, and this is the one place the endpoint
     * asks for something the customer's own form journey would also have asked.
     *
     * It reads as a survey question and is a pricing input: the upstream catalogue
     * declares `loft` a boolean surcharge, adds £2 to each window row, £6 to fascia and
     * £5 to gutter, and — measured against the live API — refuses to price ANY row
     * without it, answering all eight `missing_inputs: ["loft"]`.
     *
     * It used to be optional here, which sounds harmless and is not: an omitted answer
     * was sent upstream as `loft: "No"`, so a loft-converted house came back priced as
     * though it had no loft, and the customer got a link to a number they could book at.
     * There is no defensible default. Either the caller knows, or nobody should be
     * quoting this property yet.
     */
    const hasLoftConversion = yesNoOf(
      firstPresent(property.hasLoftConversion, property.do_you_have_a_loft_conversion),
    )
    if (!hasLoftConversion) {
      return {
        ok: false,
        error:
          'property.hasLoftConversion must be yes or no — it is a pricing input, and a house cannot be priced without it',
      }
    }
    propertyDetails.hasLoftConversion = hasLoftConversion

    /**
     * Rule C. The Velux answer arrives in whatever shape the caller holds it and leaves as
     * the one thing GHL keeps here: `contact.velux`, Yes or No. `normaliseVelux` documents
     * every shape it accepts, a count among them — a count still decides the gate, it is
     * simply not a pricing input on this client and is not carried any further.
     *
     * Unlike the loft answer this stays optional, and the two differ upstream in the one
     * way that matters: a missing `velux` refuses every row exactly as a missing `loft`
     * does, so SOMETHING has to be sent — but unlike the loft there is a defensible
     * default, because "No" is the answer that never discounts and never surcharges. So an
     * unanswered question is sent as the "No" it was priced as, and named in `assumed` so
     * the caller can see we answered on their behalf.
     *
     * Recording it rather than leaving the field alone is the point: a contact re-quoted
     * for a second property would otherwise keep the first one's "Yes" standing beside a
     * price calculated with a "No".
     */
    const velux = normaliseVelux(
      firstPresent(property.velux, property.hasVelux, property.number_of_velux),
      property.veluxCount,
    )
    if (!velux.ok) return { ok: false, error: velux.error }

    const answer: VeluxAnswer = velux.value ?? { velux: 'no' }
    if (!velux.value) assumed.push('velux')
    propertyDetails.hasVelux = answer.velux
  }

  /**
   * The access question — the seventh required input, and the only one that is SAFE to
   * omit.
   *
   * Answering "no" prices the three external window rows at `max(0.5 x full, 14.00)`, so
   * it moves more money than any surcharge here. Leaving it unanswered prices at the full
   * rate, which is the safe direction and why this is optional rather than required: a
   * caller that does not hold it gets an honest full-price quote rather than a 400.
   *
   * Deliberately NOT defaulted to "yes" and not listed in `assumed`. There is nothing to
   * assume — an omitted answer is not us deciding the customer has access, it is us not
   * applying a discount we were never told to apply. Sending `outdoor_access: "yes"` on
   * the caller's behalf would be a claim about their property; sending nothing is not.
   *
   * Asked of every property, a flat included. `requiredInputs` is global (§3), and the
   * live API does return the front-only price for a flat.
   */
  const outdoorAccess = firstPresent(
    property.outdoorAccess,
    property.hasOutdoorAccess,
    property.outdoor_access,
  )
  if (isPresent(outdoorAccess)) {
    const access = yesNoOf(outdoorAccess)
    if (!access) {
      return {
        ok: false,
        error: 'property.outdoorAccess must be yes or no — it decides whether the front-only price applies',
      }
    }
    propertyDetails.hasOutdoorAccess = access
  }

  // Optional. Supplying it prefills the booking screen so the customer confirms in one
  // click; leaving it out just means they type their address as usual.
  const address1 = asTrimmed(firstPresent(address.address1, address.address, address.street))
  const city = asTrimmed(firstPresent(address.city, address.town))
  const postcode = asTrimmed(
    firstPresent(address.postcode, address.postal_code, address.postalCode),
  )
  const bookingDetails =
    address1 || city || postcode ? { address1, city, postcode, additionalNotes: '' } : null

  return {
    ok: true,
    value: {
      contactId: contactId || null,
      contactData: {
        fullName,
        email,
        phone,
        // Rule A: null rather than '' when unanswered. `put` in the field map drops an
        // empty string, so both are silent — but only one of them says "not answered"
        // to the next person reading this object.
        hearAboutUs: hearAboutUs.value,
        referralName: asTrimmed(firstPresent(contact.referralName, contact.referrer)),
        // The customer never saw a consent checkbox here. The caller is asserting it
        // already holds this contact and may quote them, which is what sending the link is.
        consent: true,
        // Rule B has already settled this — either stated by the caller, or read off the
        // house type. Commercial never reaches here.
        propertyType: 'residential',
      },
      residentialType: type,
      bungalowKind,
      townhouseKind,
      propertyDetails,
      bookingDetails,
      assumed,
      calcInput: {
        kind,
        bedrooms,
        // A flat answers the surcharge questions too. `requiredInputs` is GLOBAL on this
        // client, not per service — a flat missing `loft` or `velux` is refused on all
        // eight rows exactly as a house is (§3) — so the flat shortcut that used to live
        // here returned a link to a screen with no prices on it. The surcharges still come
        // to nothing for a flat, because its cells carry no `add` object at all (§6).
        ...(kind === 'flat'
          ? {}
          : {
              hasExtension: propertyDetails.hasExtension === 'yes',
              hasConservatory: propertyDetails.hasConservatory === 'yes',
              // `loft` is REQUIRED upstream — omit it and every row comes back
              // `missing_inputs`, so the link would open on a screen with no numbers on
              // it. Validation has already refused a house without a loft answer.
              hasLoftConversion: propertyDetails.hasLoftConversion === 'yes',
              /**
               * The gate, and it is READ BACK from the validated answer rather than
               * defaulted here.
               *
               * This used to send `veluxCount`, a field `CalcInput` no longer has. It
               * type-checked because an excess property inside a spread is not flagged,
               * so it was silently dropped — and with `hasVelux` never set, EVERY
               * prefilled house was priced as having no Velux windows. A caller sending
               * `velux: "yes"` got an under-priced quote in a named customer's inbox,
               * which is the exact failure this endpoint's validation exists to prevent.
               */
              hasVelux: propertyDetails.hasVelux === 'yes',
            }),
        /**
         * Every property, flat included — and only when it was actually answered.
         *
         * `CalcInput` treats undefined as "unanswered", which prices at the full rate.
         * Sending `false` instead would claim the cleaner cannot get round the back and
         * halve three rows on the strength of a question nobody asked.
         */
        ...(propertyDetails.hasOutdoorAccess === undefined
          ? {}
          : { hasOutdoorAccess: propertyDetails.hasOutdoorAccess === 'yes' }),
        /**
         * The customer has picked nothing yet — the quote page shows every offered row and
         * they choose there — so this is NULL rather than a cycle.
         *
         * It used to be `FREQUENCIES[0]`, which put a 4-weekly base price and label into
         * the quote stored against the link before the customer had chosen anything. Null
         * says "not chosen yet", and `buildCalcResult` gives it a basePrice of 0; the
         * browser fills it in the moment they pick. The price TABLE is unaffected either
         * way — every offered row is fetched regardless of plan.
         */
        selectedPlan: null,
      },
    },
  }
}

/**
 * The origin the link points at.
 *
 * `PUBLIC_BASE_URL` wins, so the link names the customer-facing domain rather than
 * whichever deployment answered the call — a `*.vercel.app` URL in a customer's inbox is
 * both ugly and, on a protected deployment, unopenable.
 */
function baseUrlOf(req: VercelRequest): string {
  const configured = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
  if (configured) return configured

  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '')
    .split(',')[0]
    .trim()
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0].trim()
  return host ? `${proto}://${host}` : ''
}

function authorised(req: VercelRequest): boolean {
  const expected = process.env.PREFILL_API_KEY || ''
  if (!expected) return false
  return String(req.headers.authorization ?? '') === `Bearer ${expected}`
}

export async function handlePrefill(args: {
  body: Json
  baseUrl: string
}): Promise<{ status: number; data: Json }> {
  const parsed = validate(args.body)
  if (!parsed.ok) return { status: 400, data: { ok: false, error: parsed.error } }

  const {
    contactId,
    contactData,
    residentialType,
    bungalowKind,
    townhouseKind,
    propertyDetails,
    bookingDetails,
    calcInput,
    assumed,
  } = parsed.value

  if (!isSupabaseConfigured()) {
    return { status: 503, data: { ok: false, error: 'Submission store is not configured' } }
  }

  // Priced before the row is written, so an unpriceable property is reported to the caller
  // as a 422 rather than becoming a link that opens onto an apology.
  const resolved = await resolveQuote({ input: calcInput })

  if (resolved.table?.oversized) {
    return {
      status: 422,
      data: {
        ok: false,
        error: 'This property is outside the price book and needs a manual quote',
        oversized: true,
      },
    }
  }

  const table = resolved.table

  /**
   * No prices came back, so the link would open on the "we cannot show your price" screen.
   * Better the caller learns now and retries than that it emails an empty quote.
   *
   * `source: 'local'` alone does not catch this. It means no call was made or one threw —
   * but an upstream 401, which is this client's state today with no pricing key minted
   * (§2), fills every cell `unavailable` and still reports `api`. So the table itself is
   * read, and read for the rows THIS property is offered: a flat is never offered gutter,
   * fascia or either roof clean, so their absence is not a fault (§8).
   */
  if (resolved.source === 'local' || !table || pricingUnavailable(table, calcInput)) {
    return {
      status: 503,
      data: {
        ok: false,
        error: 'The pricing service did not answer, so no link was created',
        reason: resolved.reason ?? 'no_prices_returned',
      },
    }
  }

  /**
   * The API answered, and refused every row this property would be offered.
   *
   * A different answer from the one above and it must never share a screen with it: this
   * one is the API telling us something real about the property, not us failing to reach
   * it. Either way it goes down the same manual-quote path an oversized property does,
   * rather than becoming a link to an apology.
   *
   * A flat does not land here for being a flat: it prices on bedrooms like anything else
   * (§8), and the four rows it is never offered are excluded by `offeredServiceKeys`
   * before this is asked, so their absence cannot trip it.
   */
  if (!hasSelectableRow(table, calcInput)) {
    return {
      status: 422,
      data: {
        ok: false,
        error: 'The pricing service could not price this property, so it needs a manual quote',
        oversized: false,
      },
    }
  }

  const formData = {
    currentStep: LANDING_STEP,
    contactData,
    propertyType: 'residential',
    businessDetails: null,
    residentialType,
    largeUnusualAddress: null,
    bungalowKind,
    townhouseKind,
    propertyDetails,
    residentialFrequency: null,
    residentialQuoteResult: resolved.quote,
    bookingDetails,
    // Read back by the quote screen on resume, exactly as the form's own quote step stores
    // it, so a prefilled link and a hand-filled form show the same numbers from the same
    // source rather than one of them recomputing.
    priceTable: table,
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .insert({
      location_id: ghlLocationId(),
      email: (contactData.email as string) || null,
      // Set here rather than left for the CRM push to discover, because `pushToCrm` reads
      // the contact off the row: with it, the write updates that exact contact and skips
      // the create-or-match entirely.
      ...(contactId ? { contact_id: contactId } : {}),
      step_reached: STEP_REACHED[LANDING_STEP],
      status: 'in_progress',
      form_type: 'standard',
      form_data: formData,
      quote: resolved.quote,
    })
    .select('*')
    .single()

  if (error) return { status: 500, data: { ok: false, error: error.message } }

  const row = data as SubmissionRow

  // The same CRM push the form makes at its quote step, so the contact carries the
  // property, the prices and the webform token before the customer has opened anything.
  const crm = await pushToCrm({
    row,
    snapshot: formData,
    token: row.token,
    quote: resolved.quote,
    pricingSource: resolved.source,
    priceTable: table,
  })

  /**
   * The CRM write is reported, not assumed.
   *
   * The whole loop this endpoint sits in depends on it: the caller does not send the
   * message, a GHL workflow does, rendered from `{{contact.webform_token}}`. If the
   * contact write was skipped or refused, that field is not set, the workflow has nothing
   * to render and the customer is simply never contacted — while the caller holds a 200
   * telling it the job is done. That is the one failure this route could have made
   * completely invisible, so `crm` carries the outcome and `contactId` is null when there
   * is no contact to name.
   *
   * It is still a 200. The link is real, the quote is real and the row is written, so
   * there is something for the caller to use — it just has to send the message itself.
   */
  return {
    status: 200,
    data: {
      ok: true,
      token: row.token,
      url: `${args.baseUrl}/?token=${encodeURIComponent(row.token)}`,
      contactId: crm.contactId ?? null,
      crm: {
        outcome: crm.outcome,
        tokenWritten: Boolean(crm.contactId && !crm.error),
        ...(crm.error ? { error: crm.error } : {}),
      },
      // Empty on a call that answered every question. Present either way so a caller can
      // read it without checking whether the key exists.
      assumed,
      quote: resolved.quote,
      table,
    },
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  // Terse on purpose: this endpoint creates CRM contacts, so an unauthenticated caller
  // learns nothing about why it refused.
  if (!authorised(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })

  /**
   * A body that is not a JSON object is refused by name rather than emptied.
   *
   * `asRecord` turns anything unusable into `{}`, which then fails validation on
   * `contact.fullName` — telling a caller that posted an array, or that forgot its
   * `Content-Type: application/json` header and had Vercel hand us a raw string, that a
   * field it definitely sent is missing. That sends people looking in the wrong place.
   */
  let body: Json
  try {
    const parsed = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
    if (parsed === undefined || parsed === null) {
      return res.status(400).json({
        ok: false,
        error: 'Body is empty — send a JSON object with Content-Type: application/json',
      })
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return res.status(400).json({ ok: false, error: 'Body must be a JSON object' })
    }
    body = parsed as Json
  } catch {
    return res.status(400).json({ ok: false, error: 'Body is not valid JSON' })
  }

  try {
    const { status, data } = await handlePrefill({ body, baseUrl: baseUrlOf(req) })
    return res.status(status).json(data)
  } catch (error) {
    console.error('[prefill] failed:', error)
    return res.status(500).json({ ok: false, error: 'Failed to create the quote link' })
  }
}
