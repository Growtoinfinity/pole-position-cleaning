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
 * See docs/prefilled-quote-links.md.
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
import { FLAT_FLOORS, type CalcInput, type FlatFloor } from '../src/lib/costing-calc.js'
import { STEP_REACHED } from '../src/lib/form-steps.js'

type Json = Record<string, unknown>

/**
 * The step the link lands on. `residentialQuote` is the desktop id; the browser swaps in
 * the mobile screen on a narrow viewport by itself, so one value covers both.
 */
const LANDING_STEP = 'residentialQuote'

/** Property types this endpoint accepts, as the form's own `residentialType` values. */
const RESIDENTIAL_TYPES = ['terraced', 'semi_detached', 'detached', 'townhouse', 'flat', 'bungalow']

/** A bungalow is priced as its base type, so the caller has to say which. */
const BUNGALOW_KINDS = ['terraced', 'semi_detached', 'detached']

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
}

function asTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Accepts true/false as well as "yes"/"no", since callers post both. */
function asYesNo(value: unknown): 'yes' | 'no' | null {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  const text = asTrimmed(value).toLowerCase()
  return text === 'yes' || text === 'no' ? text : null
}

type Validated = {
  contactId: string | null
  contactData: Json
  residentialType: string
  bungalowKind: string | null
  propertyDetails: Json
  bookingDetails: Json | null
  calcInput: CalcInput
}

/**
 * Rejects rather than guesses.
 *
 * A prefilled link goes to a named customer with prices already on it, so a wrong
 * assumption here is a wrong price in their inbox — far worse than a 400 the caller sees
 * straight away. Every message names the field and what it expects.
 */
function validate(body: Json): { ok: true; value: Validated } | { ok: false; error: string } {
  const contact = asRecord(body.contact)
  const property = asRecord(body.property)
  const address = asRecord(body.address)

  const fullName = asTrimmed(contact.fullName)
  const email = asTrimmed(contact.email)
  const phone = asTrimmed(contact.phone)

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
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'contact.email is not a valid email address' }
  }

  const type = asTrimmed(property.type)
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

  const kind = houseKindFor(type, bungalowKind)
  if (!kind) return { ok: false, error: `property.type "${type}" has no price band` }

  const propertyDetails: Json = {}

  if (kind === 'flat') {
    // A flat is priced by the floor it is on and asked nothing else — no bedrooms, no
    // extension, no conservatory. Accepting those here would put answers into the pricing
    // call that the form never asks a flat for.
    const floor = asTrimmed(property.floor) as FlatFloor
    const floors = FLAT_FLOORS.map((entry) => entry.value)
    if (!floors.includes(floor)) {
      return {
        ok: false,
        error: `property.floor must be one of: ${floors.join(', ')} when property.type is flat`,
      }
    }
    propertyDetails.floor = floor
  } else {
    const bedrooms = Number(property.bedrooms)
    if (!Number.isInteger(bedrooms) || bedrooms < 1) {
      return { ok: false, error: 'property.bedrooms must be a whole number of 1 or more' }
    }
    propertyDetails.bedrooms = bedrooms

    const hasExtension = asYesNo(property.hasExtension)
    const hasConservatory = asYesNo(property.hasConservatory)
    if (!hasExtension) return { ok: false, error: 'property.hasExtension must be yes or no' }
    if (!hasConservatory) return { ok: false, error: 'property.hasConservatory must be yes or no' }
    propertyDetails.hasExtension = hasExtension
    propertyDetails.hasConservatory = hasConservatory

    if (hasConservatory === 'yes') {
      // The roof is priced per glazed panel. "I am not sure" is a real answer — it means
      // priced on the visit — so it is accepted rather than demanded.
      const panels = property.conservatoryRoofPanels
      if (panels === undefined || panels === null || asTrimmed(panels) === 'unknown') {
        propertyDetails.conservatoryRoof = { status: 'unknown' }
      } else {
        const count = Number(panels)
        if (!Number.isInteger(count) || count < 1) {
          return {
            ok: false,
            error:
              'property.conservatoryRoofPanels must be a whole number of 1 or more, or "unknown"',
          }
        }
        propertyDetails.conservatoryRoof = { status: 'count', panelCount: count }
      }
    }

    /**
     * Loft conversion and Velux are survey answers, not pricing inputs — nothing
     * downstream derives a number from them. So unlike the two above they are
     * OPTIONAL: a caller that omits them still gets a link carrying a correct
     * quote, and demanding them would break every integration that predates the
     * questions for no gain in accuracy. Supplied badly, though, they are still
     * rejected rather than guessed at — the rule this whole function is built on.
     */
    if (property.hasLoftConversion !== undefined && property.hasLoftConversion !== null) {
      const hasLoftConversion = asYesNo(property.hasLoftConversion)
      if (!hasLoftConversion) {
        return { ok: false, error: 'property.hasLoftConversion must be yes or no' }
      }
      propertyDetails.hasLoftConversion = hasLoftConversion
    }

    if (property.hasVelux !== undefined && property.hasVelux !== null) {
      const hasVelux = asYesNo(property.hasVelux)
      if (!hasVelux) return { ok: false, error: 'property.hasVelux must be yes or no' }
      propertyDetails.hasVelux = hasVelux

      if (hasVelux === 'yes') {
        // Answering yes without a count is accepted — the form seeds 1 and the
        // customer adjusts it on screen. A count that is present but nonsense is not.
        const raw = property.veluxCount
        if (raw === undefined || raw === null || asTrimmed(raw) === '') {
          propertyDetails.veluxCount = 1
        } else {
          const count = Number(raw)
          if (!Number.isInteger(count) || count < 1) {
            return {
              ok: false,
              error: 'property.veluxCount must be a whole number of 1 or more',
            }
          }
          propertyDetails.veluxCount = count
        }
      }
      // A "no" ships no count at all, so a stale one cannot ride along on the link.
    }
  }

  // Optional. Supplying it prefills the booking screen so the customer confirms in one
  // click; leaving it out just means they type their address as usual.
  const address1 = asTrimmed(address.address1)
  const city = asTrimmed(address.city)
  const postcode = asTrimmed(address.postcode)
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
        hearAboutUs: asTrimmed(contact.hearAboutUs),
        referralName: asTrimmed(contact.referralName),
        // The customer never saw a consent checkbox here. The caller is asserting it
        // already holds this contact and may quote them, which is what sending the link is.
        consent: true,
        propertyType: 'residential',
      },
      residentialType: type,
      bungalowKind,
      propertyDetails,
      bookingDetails,
      calcInput: {
        kind,
        ...(kind === 'flat'
          ? { floor: propertyDetails.floor as FlatFloor }
          : {
              bedrooms: propertyDetails.bedrooms as number,
              hasExtension: propertyDetails.hasExtension === 'yes',
              hasConservatory: propertyDetails.hasConservatory === 'yes',
              conservatoryRoofPricing: (propertyDetails.conservatoryRoof ??
                null) as CalcInput['conservatoryRoofPricing'],
            }),
        // The customer has picked nothing yet; the quote page shows every offered row and
        // they choose there. This only tells the price table which column to treat as the
        // default, and the browser overwrites it the moment they pick.
        selectedFrequency: 4,
      } as CalcInput,
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
    propertyDetails,
    bookingDetails,
    calcInput,
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

  if (resolved.source === 'local') {
    // No prices came back, so the link would open on the "we cannot show your price"
    // screen. Better the caller learns now and retries than that it emails an empty quote.
    return {
      status: 503,
      data: {
        ok: false,
        error: 'The pricing service did not answer, so no link was created',
        reason: resolved.reason ?? null,
      },
    }
  }

  const table = resolved.table

  const formData = {
    currentStep: LANDING_STEP,
    contactData,
    propertyType: 'residential',
    businessDetails: null,
    residentialType,
    largeUnusualAddress: null,
    bungalowKind,
    townhouseKind: null,
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

  return {
    status: 200,
    data: {
      ok: true,
      token: row.token,
      url: `${args.baseUrl}/?token=${encodeURIComponent(row.token)}`,
      contactId: crm.contactId,
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

  let body: Json
  try {
    body = typeof req.body === 'string' ? (JSON.parse(req.body || '{}') as Json) : asRecord(req.body)
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
