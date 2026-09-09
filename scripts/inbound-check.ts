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
console.log('\nRule C — Velux gate and count')

const veluxCases: Array<{
  velux?: unknown
  count?: unknown
  expect: { velux: 'yes' | 'no'; count: number } | null | 'error'
  why: string
}> = [
  // The pair used as designed.
  { velux: 'yes', count: 3, expect: { velux: 'yes', count: 3 }, why: 'yes + count' },
  { velux: 'Yes', count: '3', expect: { velux: 'yes', count: 3 }, why: 'casing and a string count' },
  { velux: true, count: 2, expect: { velux: 'yes', count: 2 }, why: 'boolean gate' },
  { velux: 'no', expect: { velux: 'no', count: 0 }, why: 'no is complete on its own' },
  // `false` and `0` are answers, and both are falsy. A presence test that reads either as
  // silence turns "no Velux" into "not asked" — which then prices the same but records
  // nothing on the contact. This pair is here to keep that regression caught.
  { velux: false, expect: { velux: 'no', count: 0 }, why: 'boolean no' },
  { velux: false, count: 4, expect: { velux: 'no', count: 0 }, why: 'boolean no discards a count' },
  { velux: true, expect: 'error', why: 'boolean yes still needs a count' },

  // A "no" discards any count riding along with it.
  { velux: 'no', count: 4, expect: { velux: 'no', count: 0 }, why: 'no wins over a stale count' },

  // The gate carrying the count — the shape the rule exists for.
  { velux: 'none', expect: { velux: 'no', count: 0 }, why: 'none -> No, 0' },
  { velux: '1', expect: { velux: 'yes', count: 1 }, why: 'a number is a yes' },
  { velux: 3, expect: { velux: 'yes', count: 3 }, why: 'JSON number moves over' },
  { velux: '6', expect: { velux: 'yes', count: 6 }, why: 'string number moves over' },
  { velux: '0', expect: { velux: 'no', count: 0 }, why: 'nought windows is none, not yes-with-0' },
  { velux: 0, expect: { velux: 'no', count: 0 }, why: 'numeric zero is none' },

  // A count with no gate is its own gate.
  { count: 4, expect: { velux: 'yes', count: 4 }, why: 'count alone implies yes' },
  { count: 0, expect: { velux: 'no', count: 0 }, why: 'zero count alone implies no' },

  // Agreement between the two fields is fine; disagreement is a mapping bug.
  { velux: '3', count: 3, expect: { velux: 'yes', count: 3 }, why: 'both present and agreeing' },
  { velux: '3', count: 5, expect: 'error', why: 'gate and count disagree' },

  // Nothing said at all.
  { expect: null, why: 'not answered' },
  { velux: '', count: '', expect: null, why: 'empty strings are not answers' },

  // Refusals.
  { velux: 'yes', expect: 'error', why: 'yes with no count cannot be priced' },
  { velux: 'maybe', expect: 'error', why: 'unreadable gate' },
  { velux: 'yes', count: -1, expect: 'error', why: 'negative count' },
  { velux: 'yes', count: 2.5, expect: 'error', why: 'fractional count' },
  { velux: 'yes', count: true, expect: 'error', why: 'boolean is not a count' },
  { velux: 'yes', count: '3abc', expect: 'error', why: 'count with trailing junk' },

  // "n/a" says the question did not apply. That is not the same claim as "no roof windows",
  // so it is refused rather than turned into a positive No.
  { velux: 'n/a', expect: 'error', why: 'n/a is not an answer' },
  { velux: 'nil', expect: 'error', why: 'only "none" is the documented word' },

  // The same value must read the same way whichever serialiser produced it, and a
  // mis-mapped number must not be priced at a pound a window.
  { count: 1e21, expect: 'error', why: 'unsafe integer as a JSON number' },
  { count: '1000000000000000000000', expect: 'error', why: 'the same value as a string' },
  { count: 101, expect: 'error', why: 'past the sanity bound' },
  { count: 100, expect: { velux: 'yes', count: 100 }, why: 'at the sanity bound' },
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
  const same =
    c.expect === null
      ? got === null
      : got !== null && got.velux === c.expect.velux && got.count === c.expect.count
  record(label, same, `${got === null ? 'not answered' : `${got.velux}, ${got.count}`}  (${c.why})`)
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
  {
    name: 'velux as a bare number moves to the count',
    body: withContact({ ...house, velux: '4' }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.veluxCount === 4 && v.value.propertyDetails.hasVelux === 'yes'
        ? null
        : 'expected 4 velux and a yes gate',
  },
  {
    name: 'velux "none" prices as zero',
    body: withContact({ ...house, velux: 'none' }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.veluxCount === 0 && v.value.propertyDetails.hasVelux === 'no'
        ? null
        : 'expected no velux',
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
      v.ok && v.value.calcInput.veluxCount === 2 && !v.value.assumed.includes('velux')
        ? null
        : 'expected the hasVelux alias to be read',
  },
  {
    name: 'an empty velux beside a hasVelux of no, with a count riding along',
    body: withContact({ ...house, velux: '', hasVelux: 'no', veluxCount: 4 }),
    expect: 'accept',
    check: (v) =>
      v.ok && v.value.calcInput.veluxCount === 0 && v.value.propertyDetails.hasVelux === 'no'
        ? null
        : 'expected the No to win and discard the count',
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
