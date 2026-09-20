/**
 * Proves the three inbound normalisation rules against a table of the shapes callers send.
 *
 * These rules are the endpoint's whole tolerance for messy input, and every one of them
 * decides something a customer can then be charged: whether a house is priced with a loft
 * conversion, how many Velux windows are added at £1 each, whether a lead is filed as
 * residential at all. A rule that quietly changes meaning is not a compile error and would
 * not fail a typecheck, so it gets a table instead.
 *
 *   npm run check:inbound
 *
 * Offline and side-effect free: no network, no GHL, no Supabase. Exits non-zero on the
 * first disagreement, and prints every case either way so a change of behaviour is visible
 * in the diff of the output rather than only in the count.
 */
import {
  normaliseHearAboutUs,
  normalisePropertyType,
  normaliseVelux,
  HEAR_ABOUT_US_MAX_LENGTH,
} from '../api/_lib/inboundFields.js'
import { validate } from '../api/prefill.js'

let failures = 0
let checks = 0

function record(name: string, passed: boolean, detail: string) {
  checks += 1
  if (passed) {
    console.log(`  ok    ${name}  ->  ${detail}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${name}  ->  ${detail}`)
  }
}

function show(value: unknown): string {
  return value === undefined ? 'absent' : JSON.stringify(value)
}

// ── Rule C: Velux ────────────────────────────────────────────────────────────
//
// Read this table as the contract. Left of the arrow is what a caller posts; right of it
// is the pair written to `contact.velux` and `contact.number_of_velux`.
/**
 * Rule C — the Velux GATE. This client does not count Velux windows.
 *
 * `velux` is a boolean surcharge charged once for the property; there is no
 * `number_of_velux` in its `field_mapping` and nothing upstream reads a count (§3). A
 * count is still accepted, because callers reading an older CRM hold one and it still
 * decides the gate — it is simply not carried any further.
 */
console.log('\nRule C — Velux gate')

const veluxCases: Array<{
  velux?: unknown
  count?: unknown
  expect: 'yes' | 'no' | null | 'error'
  why: string
}> = [
  // The gate used as designed, with and without a count beside it.
  { velux: 'yes', count: 3, expect: 'yes', why: 'yes + count' },
  { velux: 'Yes', count: '3', expect: 'yes', why: 'casing and a string count' },
  { velux: true, count: 2, expect: 'yes', why: 'boolean gate' },
  { velux: 'no', expect: 'no', why: 'no is complete on its own' },
  // `false` and `0` are answers, and both are falsy. A presence test that reads either as
  // silence turns "no Velux" into "not asked" — which then prices the same but records
  // nothing on the contact. This pair is here to keep that regression caught.
  { velux: false, expect: 'no', why: 'boolean no' },
  { velux: false, count: 4, expect: 'no', why: 'boolean no discards a count' },

  /**
   * A bare "yes" is a COMPLETE answer, and this is the case the rewrite exists for.
   *
   * It used to be a 400 demanding a count, inherited from a sibling contract that prices
   * per window. On this client that refused the only shape its own form can produce — the
   * form asks a Yes/No question and has no count field — so a caller mirroring the form
   * was rejected for sending exactly the right thing.
   */
  { velux: 'yes', expect: 'yes', why: 'a bare yes needs no count here' },
  { velux: true, expect: 'yes', why: 'a bare boolean yes, likewise' },

  // An explicit gate wins outright; a count riding along is discarded, not argued with.
  { velux: 'no', count: 4, expect: 'no', why: 'no wins over a stale count' },
  { velux: 'yes', count: 0, expect: 'yes', why: 'yes wins over a stale zero' },

  // The gate carrying a count instead of a word — the shape the rule exists for.
  { velux: 'none', expect: 'no', why: 'none -> No' },
  { velux: '1', expect: 'yes', why: 'a number is a yes' },
  { velux: 3, expect: 'yes', why: 'JSON number reads as a yes' },
  { velux: '0', expect: 'no', why: 'nought windows is none, not yes' },
  { velux: 0, expect: 'no', why: 'numeric zero is none' },

  // A count with no gate is its own gate.
  { count: 4, expect: 'yes', why: 'count alone implies yes' },
  { count: 0, expect: 'no', why: 'zero count alone implies no' },

  // Two fields both claiming to be counts and disagreeing is a mapping bug, not an
  // ambiguity — unlike an explicit gate beside a count, which is just a stale field.
  { velux: '3', count: 3, expect: 'yes', why: 'both numeric and agreeing' },
  { velux: '3', count: 5, expect: 'error', why: 'two counts that disagree' },

  // Nothing said at all.
  { expect: null, why: 'not answered' },
  { velux: '', count: '', expect: null, why: 'empty strings are not answers' },

  // Refusals.
  { velux: 'maybe', expect: 'error', why: 'unreadable gate' },
  { velux: 'yes', count: -1, expect: 'error', why: 'negative count' },
  { velux: 'yes', count: 2.5, expect: 'error', why: 'fractional count' },
  { velux: 'yes', count: '3abc', expect: 'error', why: 'count with trailing junk' },

  // "n/a" says the question did not apply. That is not the same claim as "no roof windows",
  // so it is refused rather than turned into a positive No.
  { velux: 'n/a', expect: 'error', why: 'n/a is not an answer' },
  { velux: 'nil', expect: 'error', why: 'only "none" is the documented word' },

  // The same value must read the same way whichever serialiser produced it, and a
  // mis-mapped number must be caught rather than read as a confident "yes".
  { count: 1e21, expect: 'error', why: 'unsafe integer as a JSON number' },
  { count: '1000000000000000000000', expect: 'error', why: 'the same value as a string' },
  { count: 101, expect: 'error', why: 'past the sanity bound' },
  { count: 100, expect: 'yes', why: 'at the sanity bound' },
  { velux: 5000, expect: 'error', why: 'a mis-mapped number in the gate' },
]

for (const c of veluxCases) {
  const result = normaliseVelux(c.velux, c.count)
  const label = `velux=${show(c.velux)} count=${show(c.count)}`

  if (c.expect === 'error') {
    record(label, !result.ok, result.ok ? `accepted as ${JSON.stringify(result.value)}` : 'rejected')
    continue
  }
  if (!result.ok) {
    record(label, false, `rejected: ${result.error}`)
    continue
  }
  const got = result.value
  const same = c.expect === null ? got === null : got !== null && got.velux === c.expect
  record(label, same, `${got === null ? 'not answered' : got.velux}  (${c.why})`)
}

// ── Rule B: property type ────────────────────────────────────────────────────
console.log('\nRule B — an empty property type read off the house type')

const propertyTypeCases: Array<{
  propertyType?: unknown
  houseType?: unknown
  expect: 'residential' | 'commercial' | null | 'error'
  why: string
}> = [
  { houseType: 'terraced', expect: 'residential', why: 'empty + a house type' },
  { houseType: 'semi_detached', expect: 'residential', why: 'empty + semi' },
  { houseType: 'detached', expect: 'residential', why: 'empty + detached' },
  { houseType: 'flat', expect: 'residential', why: 'empty + flat' },
  { houseType: 'townhouse', expect: 'residential', why: 'empty + townhouse' },
  { houseType: 'bungalow', expect: 'residential', why: 'empty + bungalow' },
  { propertyType: '', houseType: 'Semi-Detached', expect: 'residential', why: 'label casing and a dash' },
  { propertyType: '   ', houseType: 'semi detached', expect: 'residential', why: 'spaced label' },

  // A stated answer is never overwritten.
  { propertyType: 'residential', houseType: 'detached', expect: 'residential', why: 'stated' },
  { propertyType: 'commercial', houseType: '', expect: 'commercial', why: 'commercial stands' },
  { propertyType: 'Commercial', houseType: 'terraced', expect: 'commercial', why: 'stated beats inferred' },

  // Nothing to infer from.
  { expect: null, why: 'both empty' },
  { houseType: 'large_unusual', expect: null, why: 'large/unusual is not a house type' },
  { houseType: 'warehouse', expect: null, why: 'unrecognised — infers nothing' },

  { propertyType: 'domestic', expect: 'error', why: 'not one of the two values' },

  // A value of the wrong TYPE is a mapping bug, not an empty box. Reading it as empty is
  // how a commercial property gets inferred into a residential price band.
  { propertyType: { value: 'commercial' }, expect: 'error', why: 'an object is not silence' },
  { propertyType: ['commercial'], houseType: 'detached', expect: 'error', why: 'nor is an array' },
  { propertyType: true, houseType: 'detached', expect: 'error', why: 'nor is a boolean' },
]

for (const c of propertyTypeCases) {
  const result = normalisePropertyType(c.propertyType, c.houseType)
  const label = `propertyType=${show(c.propertyType)} houseType=${show(c.houseType)}`

  if (c.expect === 'error') {
    record(label, !result.ok, result.ok ? `accepted as ${result.value}` : 'rejected')
    continue
  }
  if (!result.ok) {
    record(label, false, `rejected: ${result.error}`)
    continue
  }
  record(label, result.value === c.expect, `${result.value ?? 'not answered'}  (${c.why})`)
}

// ── Rule A: how did you hear about us ────────────────────────────────────────
console.log('\nRule A — attribution is optional and unconstrained')

const hearCases: Array<{ value?: unknown; expect: string | null | 'error'; why: string }> = [
  { expect: null, why: 'absent' },
  { value: null, expect: null, why: 'explicit null' },
  { value: '', expect: null, why: 'empty string is not an answer' },
  { value: '   ', expect: null, why: 'whitespace is not an answer' },
  { value: 'Google', expect: 'Google', why: "one of the form's own values" },
  { value: '  Checkatrade  ', expect: 'Checkatrade', why: 'trimmed' },
  { value: 'Google Ads — brand campaign', expect: 'Google Ads — brand campaign', why: 'off-list is kept' },
  { value: 'x'.repeat(HEAR_ABOUT_US_MAX_LENGTH), expect: 'x'.repeat(HEAR_ABOUT_US_MAX_LENGTH), why: 'at the limit' },
  { value: 'x'.repeat(HEAR_ABOUT_US_MAX_LENGTH + 1), expect: 'error', why: 'past the limit' },
  { value: { source: 'Google' }, expect: 'error', why: 'an object is a mapping bug' },
]

for (const c of hearCases) {
  const result = normaliseHearAboutUs(c.value)
  const shown = typeof c.value === 'string' && c.value.length > 30 ? `"${c.value.length} chars"` : show(c.value)
  const label = `hearAboutUs=${shown}`

  if (c.expect === 'error') {
    record(label, !result.ok, result.ok ? `accepted as ${show(result.value)}` : 'rejected')
    continue
  }
  if (!result.ok) {
    record(label, false, `rejected: ${result.error}`)
    continue
  }
  const got = result.value
  const same = got === c.expect
  const detail = got === null ? 'not answered' : got.length > 30 ? `"${got.length} chars"` : `"${got}"`
  record(label, same, `${detail}  (${c.why})`)
}

// ── The request contract ─────────────────────────────────────────────────────
//
// The three rules above are field-level. These are the route's own two decisions, and both
// are refusals — the cases where the endpoint would rather answer a caller than price a
// property on an answer nobody gave.
console.log('\nRequest contract — what /api/prefill accepts and refuses')

const house = {
  type: 'semi_detached',
  bedrooms: 3,
  hasExtension: 'no',
  hasConservatory: 'no',
  hasLoftConversion: 'no',
}
const withContact = (property: Record<string, unknown>, contact: Record<string, unknown> = {}) => ({
  contact: { contactId: 'Biim699orwEQTIo2bf83', ...contact },
  property,
})

const contractCases: Array<{
  name: string
  body: Record<string, unknown>
  expect: 'accept' | 'reject'
  check?: (v: ReturnType<typeof validate>) => string | null
}> = [
  {
    name: 'a complete house',
    body: withContact(house),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.kind === 'semi_detached' && v.value.assumed.includes('velux')
        ? null
        : 'expected semi_detached with velux assumed',
  },
  {
    name: 'a house with no loft answer',
    body: withContact({ ...house, hasLoftConversion: undefined }),
    expect: 'reject',
  },
  {
    name: 'a flat with no loft answer',
    body: withContact({ type: 'flat', bedrooms: 2 }),
    expect: 'accept',
    check: (v) => (v.ok && v.value.calcInput.kind === 'flat' ? null : 'expected a flat'),
  },
  {
    name: 'commercial, stated',
    body: withContact({ ...house, propertyType: 'commercial' }),
    expect: 'reject',
  },
  {
    name: 'property type absent, inferred residential',
    body: withContact(house),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.contactData.propertyType === 'residential' ? null : 'expected residential',
  },
  /**
   * A count in the gate opens the gate — and reaches `calcInput` as the BOOLEAN this
   * client prices on, never as a number. `CalcInput` has no `veluxCount` any more, and
   * these two assert the value that replaced it.
   */
  {
    name: 'velux as a bare number opens the gate',
    body: withContact({ ...house, velux: '4' }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.hasVelux === true && v.value.propertyDetails.hasVelux === 'yes'
        ? null
        : 'expected a yes gate',
  },
  {
    name: 'velux "none" closes the gate',
    body: withContact({ ...house, velux: 'none' }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.hasVelux === false && v.value.propertyDetails.hasVelux === 'no'
        ? null
        : 'expected no velux',
  },
  /**
   * The regression this rewrite is really for: a plain `velux: "yes"` — the only shape
   * this client's own form produces — used to be a 400 demanding a count that prices
   * nothing, and it must reach the pricing call as a true gate rather than being dropped.
   *
   * `hasVelux` was silently absent from `calcInput` for every prefilled house, because the
   * route still set the removed `veluxCount` and an excess property inside a spread is not
   * type-checked. Every prefilled house was priced as having no Velux windows.
   */
  {
    name: 'a bare velux yes reaches the pricing call as a gate',
    body: withContact({ ...house, velux: 'yes' }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.hasVelux === true && !v.value.assumed.includes('velux')
        ? null
        : 'expected hasVelux true and no assumption recorded',
  },
  {
    name: 'an unanswered velux is sent as No and declared',
    body: withContact(house),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.hasVelux === false && v.value.assumed.includes('velux')
        ? null
        : 'expected hasVelux false and velux named in assumed',
  },
  { name: 'bedrooms sent as a boolean', body: withContact({ ...house, bedrooms: true }), expect: 'reject' },
  { name: 'bedrooms sent as an array', body: withContact({ ...house, bedrooms: [4] }), expect: 'reject' },
  {
    name: 'a contactId that is an email address',
    body: withContact(house, { contactId: 'someone@example.com' }),
    expect: 'reject',
  },
  {
    name: 'a townhouse sub-kind is kept',
    body: withContact({ ...house, type: 'townhouse', townhouseKind: 'terraced' }),
    expect: 'accept',
    check: (v) => (v.ok && v.value.townhouseKind === 'terraced' ? null : 'expected terraced'),
  },
  {
    name: 'a bogus townhouse sub-kind',
    body: withContact({ ...house, type: 'townhouse', townhouseKind: 'mansion' }),
    expect: 'reject',
  },
  // ── the alias pairs ──
  //
  // Every one of these sends an EMPTY string in the preferred field and the real answer in
  // the alias beside it — the shape a caller mapping from a database produces. `??` reads
  // the empty string as an answer and masks the alias, which is how a commercial property
  // was inferred residential and a 3-Velux house priced with none. These four are the
  // regression tests for that.
  {
    name: 'an empty velux beside the deprecated hasVelux',
    body: withContact({ ...house, velux: '', hasVelux: 'yes', veluxCount: 2 }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.hasVelux === true && !v.value.assumed.includes('velux')
        ? null
        : 'expected the hasVelux alias to be read',
  },
  {
    name: 'an empty velux beside a hasVelux of no, with a count riding along',
    body: withContact({ ...house, velux: '', hasVelux: 'no', veluxCount: 4 }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.hasVelux === false && v.value.propertyDetails.hasVelux === 'no'
        ? null
        : 'expected the No to win and discard the count',
  },
  {
    name: 'an empty velux beside the GHL number_of_velux key',
    body: withContact({ ...house, velux: '', number_of_velux: 3 }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.hasVelux === true ? null : 'expected number_of_velux to be read',
  },
  // ── outdoor access — the front-only gate ──
  //
  // The seventh required input, and the only one safe to omit: unanswered prices at the
  // full rate, "no" halves the three external window rows. So the three states have to
  // stay three — an omitted answer must reach `CalcInput` as undefined and NOT as false,
  // or every caller that does not hold this field would silently half-price its leads.
  {
    name: 'outdoor access answered no',
    body: withContact({ ...house, outdoorAccess: 'no' }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.hasOutdoorAccess === false ? null : 'expected hasOutdoorAccess false',
  },
  {
    name: 'outdoor access answered yes',
    body: withContact({ ...house, outdoorAccess: true }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.hasOutdoorAccess === true ? null : 'expected hasOutdoorAccess true',
  },
  {
    name: 'outdoor access unanswered stays unanswered',
    body: withContact(house),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.hasOutdoorAccess === undefined
        ? null
        : 'expected hasOutdoorAccess to be absent, never false',
  },
  {
    name: 'outdoor access under the GHL field key',
    body: withContact({ ...house, outdoor_access: 'no' }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.hasOutdoorAccess === false ? null : 'expected the alias to be read',
  },
  {
    name: 'an unreadable outdoor access answer',
    body: withContact({ ...house, outdoorAccess: 'sometimes' }),
    expect: 'reject',
  },
  {
    name: 'a flat is asked about outdoor access too',
    body: withContact({ type: 'flat', bedrooms: 2, outdoorAccess: 'no' }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.hasOutdoorAccess === false
        ? null
        : 'expected a flat to carry the access answer',
  },

  // ── a Facebook lead, as the portal actually holds it ──
  //
  // GHL writes a Facebook lead form onto a CONTACT and fires a workflow carrying only
  // `{"contact_id": ...}`, so a portal reacting to one is reading GHL field keys and
  // posting those. Not one of the names below is this endpoint's own spelling, and the
  // whole request must still normalise.
  {
    name: 'a lead spelled entirely in GHL field keys',
    body: {
      contact: {
        contactId: 'Biim699orwEQTIo2bf83',
        full_name: 'A Lead',
        phone_number: '07700900123',
        how_did_you_hear_about_us: 'Facebook',
      },
      property: {
        type_of_house: 'detached',
        number_of_bedrooms: '4',
        extension: 'Yes',
        conservatory: 'No',
        do_you_have_a_loft_conversion: 'Yes',
        number_of_velux: 2,
        outdoor_access: 'no',
      },
      address: { postal_code: 'BH1 1AA' },
    },
    expect: 'accept',
    check: (v) => {
      if (!v.ok) return 'expected the GHL-keyed lead to validate'
      const { calcInput, contactData, bookingDetails } = v.value
      if (calcInput.kind !== 'detached') return 'type_of_house was not read'
      if (calcInput.bedrooms !== 4) return 'number_of_bedrooms was not read'
      if (calcInput.hasExtension !== true) return 'extension was not read'
      if (calcInput.hasLoftConversion !== true) return 'loft alias was not read'
      if (calcInput.hasVelux !== true) return 'number_of_velux was not read'
      if (calcInput.hasOutdoorAccess !== false) return 'outdoor_access was not read'
      if (contactData.fullName !== 'A Lead') return 'full_name was not read'
      if (contactData.hearAboutUs !== 'Facebook') return 'attribution alias was not read'
      if (bookingDetails?.postcode !== 'BH1 1AA') return 'postal_code was not read'
      return null
    },
  },
  {
    name: 'an empty propertyType beside a commercial type_of_property',
    body: withContact({ ...house, propertyType: '', type_of_property: 'commercial' }),
    expect: 'reject',
  },
  {
    name: 'an empty propertyType beside a bogus type_of_property',
    body: withContact({ ...house, propertyType: '', type_of_property: 'domestic' }),
    expect: 'reject',
  },
  {
    name: 'a propertyType that is an object',
    body: withContact({ ...house, propertyType: { value: 'commercial' } }),
    expect: 'reject',
  },
  {
    name: 'attribution omitted entirely',
    body: withContact(house, { hearAboutUs: undefined }),
    expect: 'accept',
    check: (v) => (v.ok && v.value.contactData.hearAboutUs === null ? null : 'expected null'),
  },
  {
    name: 'attribution the form could never produce',
    body: withContact(house, { hearAboutUs: 'TikTok ad #4471' }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.contactData.hearAboutUs === 'TikTok ad #4471' ? null : 'expected it kept verbatim',
  },
]

for (const c of contractCases) {
  const result = validate(c.body as Record<string, unknown>)
  if (c.expect === 'reject') {
    record(c.name, !result.ok, result.ok ? 'accepted' : `rejected: ${result.error}`)
    continue
  }
  if (!result.ok) {
    record(c.name, false, `rejected: ${result.error}`)
    continue
  }
  const problem = c.check ? c.check(result) : null
  record(c.name, problem === null, problem ?? 'accepted')
}

console.log(`\n${checks - failures}/${checks} passed`)
if (failures > 0) {
  console.error(`\n${failures} inbound normalisation case(s) disagree with the documented rule.`)
  process.exit(1)
}
console.log('All three inbound rules behave as docs/prefill-api-reference.md describes them.\n')
