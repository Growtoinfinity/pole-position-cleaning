/**
 * The three normalisation rules a third party's answers pass through on the way in.
 *
 * A caller integrating against `/api/prefill` is not filling in our form. It is reading a
 * CRM, a spreadsheet or its own database, where the same fact has been written more than
 * one way over the years, and posting whatever it found. So the endpoint's job is to say
 * exactly which shapes it will accept and turn each of them into the ONE shape the rest of
 * the pipeline understands — rather than either rejecting a caller for a formatting choice
 * or, far worse, silently pricing a value it misread.
 *
 * They live here rather than inside the route for two reasons. The route already rejects
 * rather than guesses, and these rules are the opposite instinct — they accept broadly and
 * then commit to one reading — so keeping them apart makes it obvious which is which. And
 * every one of them is a rule about a GHL contact field, not about this endpoint, so the
 * day a second caller or a second route needs the same thing there is one copy to reach
 * for. A second copy of the Velux rule is how a property gets priced for three roof
 * windows and recorded as having none.
 *
 * All three are pure and total: they answer, or they say why they cannot, and they never
 * throw.
 */

/** Booleans, `"Yes"`, `"yes"`, `" YES "` — callers post all of them. */
export function yesNoOf(value: unknown): 'yes' | 'no' | null {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase()
  if (text === 'yes' || text === 'true' || text === 'y') return 'yes'
  if (text === 'no' || text === 'false' || text === 'n') return 'no'
  return null
}

function trimmed(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/**
 * Did the caller answer this at all?
 *
 * "Present" is not "truthy", and the difference is the whole point: `false` and `0` are
 * both answers, and both are falsy. It is also not "not undefined", because a caller
 * mapping an empty CRM cell sends `""`, which is silence rather than an answer.
 *
 * A non-answer that gets read as an answer — or the reverse — is how a boolean `false`
 * Velux gate once became "not answered" instead of "no".
 */
export function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  return true
}

/**
 * The first of several spellings of the same question that the caller actually answered.
 *
 * Aliases exist because the same fact has more than one name — `velux` and the older
 * `hasVelux`, `propertyType` and the CRM's own `type_of_property` — and a caller mapping
 * from a database very often populates one and leaves the other as an empty string rather
 * than omitting it.
 *
 * `??` cannot express this. It falls through on null and undefined only, so `""` counts as
 * an answer and masks the populated field beside it. That is not a style preference: it is
 * how `{ propertyType: "", type_of_property: "commercial" }` came to be read as a
 * residential property and quoted on a domestic price band.
 */
export function firstPresent(...values: unknown[]): unknown {
  return values.find(isPresent)
}

/**
 * A whole count of 0 or more, from a JSON number OR the string a spreadsheet export gives.
 *
 * `Number()` is not enough on its own: it reads `true` as 1, `[4]` as 4 and `''` as 0, so
 * a caller that posts a boolean into a count field would be quoted for one Velux window it
 * never mentioned. Only the two shapes a count is actually written in are accepted.
 */
function countOf(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN

  if (!Number.isSafeInteger(parsed) || parsed < 0) return null

  /**
   * An upper bound, kept even though this client never prices the count.
   *
   * It no longer guards a quote — a count only decides a Yes/No gate here (Rule C), and
   * every number above zero decides it the same way. What it still does is catch the
   * mapping bug: a postcode, a phone number or a price in pence landing in this field is
   * certainly not a roof-window count, and a 400 naming the field sends the caller to the
   * real problem rather than recording a "yes" derived from their postcode.
   *
   * Both branches go through the same guard on purpose. They used to differ — the string
   * branch checked `isSafeInteger` and the number branch did not — so `"1e21"` was refused
   * and the JSON number `1e21` sailed through, which is the same value read two ways
   * depending on the caller's serialiser.
   */
  return parsed <= MAX_VELUX_COUNT ? parsed : null
}

/** Far above any real roof and far below any plausible mis-mapping. */
export const MAX_VELUX_COUNT = 100

export type Normalised<T> = { ok: true; value: T } | { ok: false; error: string }

// ─────────────────────────────────────────────────────────────────────────────
// Rule A — "How did you hear about us?" is optional, and unconstrained
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The form's own six answers. Reproduced from `ContactStep`, and deliberately NOT enforced.
 *
 * `contact.how_did_you_hear_about_us` was read back from the live location on 2026-09-10 as
 * dataType TEXT carrying no `picklistOptions` at all — it is free text, so GHL stores
 * whatever arrives and there is no option list for an off-list value to be dropped from.
 * The only field in this location that does drop off-list values is the `booked_services`
 * CHECKBOX, which is why that one is matched byte-exact and this one is not.
 *
 * So a caller may send its own vocabulary ("PPC", "Google Ads", a campaign id) and it will
 * land intact. This list exists to be published in the caller docs as the vocabulary the
 * form itself produces, so an integrator can choose to match it and keep one set of
 * attribution values across both intake paths. Matching is worth doing and is not required.
 */
export const HEAR_ABOUT_US_FORM_VALUES = [
  'Google',
  'Facebook',
  'Checkatrade',
  'Leaflet',
  'Van',
  'Referral',
] as const

/**
 * Rule A: attribution is optional.
 *
 * Absent, empty or whitespace are all "not answered", and answer nothing rather than
 * writing an empty string over something a previous touch already established. Anything
 * else is passed through verbatim — see above for why there is no allow-list here.
 *
 * The only limit is length, and it is a sanity bound rather than a business rule: a GHL
 * TEXT field is not the place for a kilobyte of referrer URL, and a caller that sends one
 * has a mapping bug worth hearing about now rather than discovering in the CRM later.
 */
export const HEAR_ABOUT_US_MAX_LENGTH = 255

export function normaliseHearAboutUs(value: unknown): Normalised<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== 'string' && typeof value !== 'number') {
    return { ok: false, error: 'contact.hearAboutUs must be a string' }
  }
  const text = trimmed(value)
  if (!text) return { ok: true, value: null }
  if (text.length > HEAR_ABOUT_US_MAX_LENGTH) {
    return {
      ok: false,
      error: `contact.hearAboutUs must be ${HEAR_ABOUT_US_MAX_LENGTH} characters or fewer`,
    }
  }
  return { ok: true, value: text }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule B — an empty property type, read from the house type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The house types this form prices, as `contact.type_of_house` holds them.
 *
 * `large_unusual` is deliberately absent. It is a real value of that field — the
 * large/unusual branch writes it — but it is not a house type, it is the marker for a
 * property this form will not price at all, so it must not satisfy Rule B's "the caller
 * clearly described a home" test by sitting in the same list.
 */
export const RESIDENTIAL_HOUSE_TYPES = [
  'terraced',
  'semi_detached',
  'detached',
  'townhouse',
  'flat',
  'bungalow',
] as const

export type PropertyTypeAnswer = 'residential' | 'commercial'

/**
 * Rule B: a house type implies a home.
 *
 * `contact.tyoe_of_property` (GHL's own typo, preserved character for character) holds
 * `residential` or `commercial`, and `contact.type_of_house` holds the kind of home. They
 * are two fields and a caller reading a CRM will often hold only the second — the first is
 * the answer to a question the customer was asked before the branch split, and a record
 * created some other way never went through that branch.
 *
 * Rather than refuse a caller that plainly described a semi-detached house because it left
 * the higher-level box empty, the empty box is filled from the answer that is present. The
 * inference only runs in that one direction and only from a house type this form actually
 * prices: a stated `commercial` is never overwritten, and an unrecognised house type infers
 * nothing, because inventing `residential` there would put a domestic price band on premises
 * nobody has looked at.
 */
export function normalisePropertyType(
  propertyType: unknown,
  houseType: unknown,
): Normalised<PropertyTypeAnswer | null> {
  /**
   * A value of the wrong TYPE is a mapping bug, and must not be read as an empty box.
   *
   * `trimmed` answers '' for an object, an array or a boolean, so without this an
   * accidental `{ propertyType: { value: "commercial" } }` looks exactly like "the caller
   * left it blank" — and Rule B then infers `residential` and quotes commercial premises on
   * a domestic band. Silence and nonsense have to be told apart before either is acted on.
   */
  if (isPresent(propertyType) && typeof propertyType !== 'string' && typeof propertyType !== 'number') {
    return { ok: false, error: 'property.propertyType must be a string' }
  }

  const stated = trimmed(propertyType).toLowerCase().replace(/[\s-]+/g, '_')

  if (stated) {
    if (stated === 'residential' || stated === 'commercial') {
      return { ok: true, value: stated }
    }
    return {
      ok: false,
      error: `property.propertyType must be residential or commercial when supplied, not "${trimmed(propertyType)}"`,
    }
  }

  // Empty. Rule B: read it off the house type, if that is one we recognise as a home.
  const house = trimmed(houseType).toLowerCase().replace(/[\s-]+/g, '_')
  if ((RESIDENTIAL_HOUSE_TYPES as readonly string[]).includes(house)) {
    return { ok: true, value: 'residential' }
  }

  // Nothing to infer from. The caller gets the house-type error rather than a guess.
  return { ok: true, value: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule C — the Velux gate and the Velux count
// ─────────────────────────────────────────────────────────────────────────────

export type VeluxAnswer = {
  /** `contact.velux` — the gate. Always one of the two, never a number. */
  velux: 'yes' | 'no'
}

/**
 * Rule C: whatever shape the Velux answer arrives in, one Yes/No gate comes out.
 *
 * **This client does not count Velux windows.** `velux` is a boolean surcharge charged
 * once for the property, there is no `number_of_velux` in its `field_mapping`, and nothing
 * upstream reads a count (§3). So a count is not a pricing input here, and the endpoint
 * neither requires one nor writes one.
 *
 * That is the opposite of the sibling contracts this rule was first written for, where
 * Velux prices per unit — and the difference matters more than it looks. Requiring a count
 * meant a caller sending a plain `velux: "yes"`, the only shape this client's own form can
 * produce, was refused outright with a 400 asking for a number that prices nothing.
 *
 * A count is still ACCEPTED, because callers reading an older CRM still hold one, and it
 * still decides the gate — a property with three roof windows has roof windows. It is
 * simply not carried any further.
 *
 * The shapes accepted, and what each becomes:
 *
 *   velux: "yes" / true          ->  Yes     the gate, used as designed — no count needed
 *   velux: "no" / false          ->  No
 *   velux: "none"                ->  No      the count field used as the gate
 *   velux: 3 / "3"               ->  Yes     a positive count is a yes
 *   velux: 0 / "0"               ->  No      nought windows is no windows
 *   velux absent, count: 3       ->  Yes     a count is its own gate
 *   velux absent, count: 0       ->  No
 *   both absent                  ->  null    not answered; the caller is told
 *
 * A gate and a count that contradict each other are still refused rather than reconciled.
 * `{ velux: "no", veluxCount: 4 }` is a mapping bug in the caller, and quietly picking
 * either reading would put a surcharge on a quote — or leave one off — on the strength of
 * a field the caller did not mean to send.
 */
export function normaliseVelux(rawVelux: unknown, rawCount: unknown): Normalised<VeluxAnswer | null> {
  const hasGate = isPresent(rawVelux)
  const hasCount = isPresent(rawCount)

  const count = hasCount ? countOf(rawCount) : null
  if (hasCount && count === null) {
    return { ok: false, error: 'property.veluxCount must be a whole number of 0 or more' }
  }

  /** A count, of either field, read as the gate it implies. */
  const gateForCount = (n: number): VeluxAnswer => ({ velux: n > 0 ? 'yes' : 'no' })

  if (!hasGate) {
    // A count on its own is a complete answer: any positive number means yes.
    if (!hasCount) return { ok: true, value: null }
    return { ok: true, value: gateForCount(count!) }
  }

  // The gate itself holds a number — common when the two questions are one field at source.
  const gateAsCount = countOf(rawVelux)
  if (gateAsCount !== null) {
    if (hasCount && count !== gateAsCount) {
      return {
        ok: false,
        error: `property.velux is "${trimmed(rawVelux)}" and property.veluxCount is ${count}; send the count in one field or make them agree`,
      }
    }
    return { ok: true, value: gateForCount(gateAsCount) }
  }

  const gateText = trimmed(rawVelux).toLowerCase()

  /**
   * "none" is the count field's own word for zero, and it turns up in the gate because the
   * two questions are often collapsed into one at source.
   *
   * Only that one word. "n/a" was accepted here for a while and should not have been: it
   * says the question did not apply, which is not the same claim as "this house has no
   * roof windows", and turning it into a positive "No" answers for a customer nobody
   * asked. Anything outside the documented set is refused with a message naming the set,
   * which a caller can act on — unlike a quiet reading of their data.
   */
  if (gateText === 'none') return { ok: true, value: { velux: 'no' } }

  const gate = yesNoOf(rawVelux)
  if (!gate) {
    // `trimmed` renders an object or an array as '', which would tell a caller their field
    // was empty at the exact moment we decided it was populated — the worst possible
    // diagnostic for the mapping bug this branch exists to catch.
    const shown = typeof rawVelux === 'string' || typeof rawVelux === 'number'
      ? `"${trimmed(rawVelux)}"`
      : `a ${Array.isArray(rawVelux) ? 'array' : typeof rawVelux}`
    return {
      ok: false,
      error: `property.velux must be yes, no, none, or a whole number of Velux windows, not ${shown}`,
    }
  }

  /**
   * An explicit yes or no IS the answer, and any count riding along with it is discarded.
   *
   * No contradiction check here, unlike the numeric-gate branch above, and the asymmetry
   * is deliberate. There, both fields claim to be counts and disagreeing means one of them
   * is a mapping bug worth a 400. Here the caller has answered the actual question — "does
   * this property have Velux windows" — in the field that asks it, and the count is a
   * field this client does not price, does not store and does not send anywhere. Refusing
   * a caller over a value that reaches nothing would be a 400 for its own sake.
   */
  return { ok: true, value: { velux: gate } }
}
