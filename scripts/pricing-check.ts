/**
 * Checks the pricing integration — our half of it — against
 * `docs/pricing_api_poleposition.md` (in the v3-bot repo), which is the single source of
 * truth. Where this file and that doc disagree, the doc wins.
 *
 *     npm run check:pricing              # offline, no network, no key needed
 *     npm run check:pricing -- --live    # also runs §10's smoke tests for real
 *
 * There is no test runner in this project, so this is a plain script.
 *
 * WHAT THIS CAN AND CANNOT PROVE. Offline it cannot verify a single price. The price book
 * lives in the API and nowhere else, and a script that asserted prices offline would be
 * asserting a second copy of it: the exact thing this integration exists to retire.
 *
 * What it checks instead is the READING. Every number below is a fixture taken from a
 * measured response in the doc and fed back through our own code, so each assertion is
 * about what we DO with a row — which key we match it to, which branch we take, which
 * number we show — never about which number the API ought to have sent. A stale fixture
 * costs a wrong test; a local price book costs a wrong quote.
 *
 * `--live` is the other half: it replays §10's probes against the real API with the read
 * key, and every expectation there is DERIVED FROM THE DOC'S APPENDIX rather than copied
 * off the wire, so a price book that moves fails this script instead of rewriting it.
 * `/quotes` is a pure calculator — it reads no contact and writes nothing — so this stays
 * read-only however it is run.
 *
 * Three of those probes are load-bearing rather than decorative. `probe 4` is the only
 * thing that would catch the `surcharges` array being dropped from the config by a
 * `PUT` — every loft and velux uplift silently gone, prices still 200 and still
 * plausible (§7b). `probe 2b` proves `velux` really is required for every row, which is
 * the failure that would otherwise ship a form quoting nothing at all. And `probe 8`
 * proves an unanswered `outdoor_access` never discounts (§7c).
 */
import {
  ANCILLARY_KEYS,
  HOUSE_TYPE_BY_KIND,
  LABEL_BY_SERVICE_KEY,
  ONEOFF_KEYS,
  ROOF_KEYS,
  SERVICE_KEYS,
  SERVICE_KEY_BY_LABEL,
  WINDOW_KEYS,
  allInputsOf,
  cellOf,
  ghlFieldOf,
  hasSelectableRow,
  inputsKeyFor,
  isOutOfBand,
  isSelectableCell,
  isServiceKey,
  offeredServiceKeys,
  priceOf,
  pricingUnavailable,
  serviceKeyForPlan,
  yesNo,
} from '../src/lib/pricing'
import {
  EXT_CONSERVATORY_ROOF_LABEL,
  FASCIA_SOFFIT_LABEL,
  FREQUENCIES,
  GUTTER_CLEARANCE_LABEL,
  INT_CONSERVATORY_ROOF_LABEL,
  ONE_OFF_PLAN,
  frequencyLabel,
  isRecurringPlan,
  supportsAncillaryServices,
  supportsUplifts,
} from '../src/lib/costing-calc'
import {
  buildCalcResult,
  selectedServiceKeys,
  selectionIsPriced,
  withParityHold,
} from '../src/lib/price-table'
import { classifyRow } from '../api/_lib/pricingApi'
import { readFileSync } from 'node:fs'

/**
 * Credentials may live in either file. `.env.local` is Vite's convention and was the
 * only one read here; `.env` is what most people actually create, and a check that
 * silently reports "set GHL_PIT_TOKEN" at someone who plainly has is worse than no
 * check. Later files win, matching Vite's own precedence.
 */
const ENV_FILES = ['.env', '.env.local']
import type { PriceCell, PriceTable, ServiceKey } from '../src/lib/pricing'
import type { CalcInput } from '../src/lib/costing-calc'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const ok = a === e
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        expected ${e}\n        actual   ${a}`}`)
}

/** One response row, as `classifyRow` takes it. Its parameter type is not exported. */
type QuoteRow = Parameters<typeof classifyRow>[0]

const FETCHED_AT = '2026-09-09T00:00:00.000Z'

/**
 * Rows in, table out — the same loop `fetchQuoteTable` runs, minus the network.
 *
 * Every fixture below is written in the API's real response order, which leads with the
 * two DERIVED services rather than the two frequencies a reader expects (§4). That is
 * deliberate: a reader that matched on position would take the one-off's £43.50 for the
 * 4-weekly price and every assertion downstream would be quietly wrong.
 */
function tableFrom(rows: QuoteRow[]): PriceTable {
  const cells: Partial<Record<ServiceKey, PriceCell>> = {}
  let oversized = false

  for (const row of rows) {
    if (!isServiceKey(row.serviceKey)) continue
    const cell = classifyRow(row)
    cells[row.serviceKey] = cell
    // Every service in this catalogue is priced from a house x bedroom table or derived
    // from one that is, so an oversized verdict on any row is a fact about the property.
    if (cell.state === 'oversized') oversized = true
  }
  for (const key of SERVICE_KEYS) {
    if (!cells[key]) cells[key] = { state: 'unavailable', reason: 'not_returned' }
  }

  return { cells, oversized, source: 'api', fetchedAt: FETCHED_AT }
}

// The doc's own worked example: Semi Detached, 3 bed, no extension, no conservatory (§3).
const base: CalcInput = {
  kind: 'semi_detached',
  bedrooms: 3,
  hasExtension: false,
  hasConservatory: false,
  selectedPlan: 8,
  addons: {
    gutterClear: false,
    fasciaClean: false,
    conservatoryRoofCleanExternal: false,
    conservatoryRoofCleanInternal: false,
  },
}

console.log('\n--- the catalogue is the EIGHT services this client sells (§3) ---')
check('eight service keys, no more', SERVICE_KEYS.length, 8)
check('the fascia key is fascia_soffit_clean here', SERVICE_KEYS.includes('fascia_soffit_clean'), true)
// Sending an old key returns a 200 carrying reason "unknown_service", never a 400, so
// the mistake is silent and a UI rendering serviceLabel shows a service that does not
// exist with a blank price (§3). Refusing the key here is the only loud failure available.
check('the other clients\' fascia key is not one of ours', isServiceKey('fascia_soffit_gutter'), false)
check('there is no 6-weekly service in this catalogue', isServiceKey('ext_window_6weekly'), false)
check('there is no 12-weekly service either', isServiceKey('ext_window_12weekly'), false)
// quote_request_only: no price, ever, and /quotes answers unknown_service for it (§3).
check('pressure_washing is not a priceable key', isServiceKey('pressure_washing'), false)
check('both one-offs are keyed', ONEOFF_KEYS, ['ext_window_oneoff', 'int_window_oneoff'])
check('both conservatory roofs are keyed', ROOF_KEYS,
  ['conservatory_roof_external', 'conservatory_roof_internal'])
check('the frequencies are 4 and 8', FREQUENCIES, [4, 8])
// The UI looks rows up by label (`extras.find(e => e.label === …)`), so a frequency row
// whose label does not match `frequencyLabel` resolves to nothing and prices nothing.
check('the 4-weekly row is labelled the way the frequency is',
  LABEL_BY_SERVICE_KEY[serviceKeyForPlan(4)], frequencyLabel(4))
check('and so is the 8-weekly row',
  LABEL_BY_SERVICE_KEY[serviceKeyForPlan(8)], frequencyLabel(8))
check('labels round-trip back to their key',
  SERVICE_KEY_BY_LABEL[GUTTER_CLEARANCE_LABEL], 'full_gutter_clearance')
check('the two roof labels are distinct',
  EXT_CONSERVATORY_ROOF_LABEL === INT_CONSERVATORY_ROOF_LABEL, false)

console.log('\n--- which rows are OFFERED to the customer ---')
// Not the same question as what we ask the API: the request omits serviceKeys entirely,
// so the whole catalogue always comes back and applicability is read off the answer.
// Six without a conservatory: two cycles, two one-offs, gutter and fascia.
check('a house with no conservatory is offered 6 rows',
  offeredServiceKeys({ kind: 'semi_detached', hasConservatory: false }).length, 6)
check('a conservatory adds BOTH roof rows',
  offeredServiceKeys({ kind: 'semi_detached', hasConservatory: true }).length, 8)
// This client has NO `Town house` row: it is refused with house_type_not_in_table, not
// folded to Terraced the way the siblings fold it. The form resolves a townhouse to one
// of the three base types first, which is why 'townhouse' is not a HouseKind (§3).
check('a resolved townhouse IS offered gutter and fascia',
  offeredServiceKeys({ kind: 'terraced', hasConservatory: false }),
  [...WINDOW_KEYS, ...ONEOFF_KEYS, ...ANCILLARY_KEYS])
// A flat loses gutter, fascia and both roof cleans — four of the eight — but keeps every
// window row, the two one-offs included (§6, §8).
check('a flat is offered window cleaning only (§6)',
  offeredServiceKeys({ kind: 'flat', hasConservatory: false }), [...WINDOW_KEYS, ...ONEOFF_KEYS])
// A 'yes' left over from a house the customer picked before going back and choosing a
// flat, which is never asked the question at all.
check('a stale conservatory answer does not open the roof rows on a flat',
  offeredServiceKeys({ kind: 'flat', hasConservatory: true }), [...WINDOW_KEYS, ...ONEOFF_KEYS])

// Both one-offs are now sellable, and they enter by different doors — the API's own
// serviceCatalog categories decide which: ext_window_oneoff is "window_cleaning" (a third
// PLAN, mutually exclusive with the two cycles) and int_window_oneoff is "addon" (tickable
// alongside any plan). This assertion previously pinned the OPPOSITE — that neither was
// offered — which is why adding them had to start here.
check('both one-offs are offered on a house',
  offeredServiceKeys({ kind: 'detached', hasConservatory: true })
    .filter((key) => (ONEOFF_KEYS as string[]).includes(key)), ONEOFF_KEYS)
// And to a flat, unlike gutter/fascia/roof: they are multiplier_of_service off the
// 8-weekly row, which prices a flat, so there is no Flat row for them to be missing from.
check('both one-offs are offered to a flat too',
  offeredServiceKeys({ kind: 'flat', hasConservatory: false })
    .filter((key) => (ONEOFF_KEYS as string[]).includes(key)), ONEOFF_KEYS)
check('the external one-off is the plan row for ONE_OFF_PLAN',
  serviceKeyForPlan(ONE_OFF_PLAN), 'ext_window_oneoff')
check('a recurring plan still maps to its own cycle row',
  [serviceKeyForPlan(4), serviceKeyForPlan(8)], ['ext_window_4weekly', 'ext_window_8weekly'])
// The whole point of WindowPlan being separate from Frequency: nothing per-year may be
// computed for a one-off, because it does not recur.
check('a one-off is not a recurring plan', isRecurringPlan(ONE_OFF_PLAN), false)
check('both cycles are', [isRecurringPlan(4), isRecurringPlan(8)], [true, true])
check('and "no plan chosen" is not', isRecurringPlan(null), false)
check('houses support ancillary services', supportsAncillaryServices('terraced'), true)
check('flats do not', supportsAncillaryServices('flat'), false)
check('and a flat is never surcharged (§6)', supportsUplifts('flat'), false)

console.log('\n--- what we SEND ---')
// SEVEN requiredInputs, six of them all-or-nothing: miss any one and EVERY row answers
// missing_inputs, including rows whose own table carries no surcharge for it, because
// requiredInputs is global rather than per service (§3).
check('a house sends all six gates',
  allInputsOf(base),
  { house_type: 'Semi Detached', bedrooms: 3, extension: 'No', conservatory: 'No',
    loft: 'No', velux: 'No' })
check('a loft conversion travels as the exact string',
  allInputsOf({ ...base, hasLoftConversion: true }).loft, 'Yes')
// A GATE, not a count: this client charges once for the property (§3).
check('velux travels as a Yes/No gate',
  allInputsOf({ ...base, hasVelux: true }).velux, 'Yes')
check('no velux sends an explicit No',
  allInputsOf({ ...base, hasVelux: false }).velux, 'No')
check('nothing ever sends a velux COUNT',
  'number_of_velux' in allInputsOf({ ...base, hasVelux: true }), false)
// The number 1 is a re-ask, not a yes. Booleans or the exact strings, or missing_inputs.
check('extension and conservatory are the exact strings',
  allInputsOf({ ...base, hasExtension: true, hasConservatory: true }).extension, 'Yes')
check('yesNo says No, not false', yesNo(false), 'No')
// LOWERCASE, unlike the four gates, and the one input safe to omit (§7c).
check('outdoor access is lowercase yes',
  allInputsOf({ ...base, hasOutdoorAccess: true }).outdoor_access, 'yes')
check('and lowercase no',
  allInputsOf({ ...base, hasOutdoorAccess: false }).outdoor_access, 'no')
// Guessing "no" would halve a price the customer never asked to have halved.
check('an UNANSWERED access question is omitted, never inferred',
  'outdoor_access' in allInputsOf(base), false)
check('there is no townhouse house_type to send',
  'townhouse' in HOUSE_TYPE_BY_KIND, false)
// A flat bands on BEDROOMS here — the client's own rule, in flat_banding (§6).
check('a flat bands on bedrooms', allInputsOf({ ...base, kind: 'flat' }).bedrooms, 3)
check('a flat sends NO floor_level',
  'floor_level' in allInputsOf({ ...base, kind: 'flat' }), false)
// The opposite of the sibling contract: a flat sends every gate too, because
// requiredInputs is global. Omitting them refuses all eight of its rows (§3, §6).
check('a flat sends every gate, exactly as a house does',
  Object.keys(allInputsOf({ ...base, kind: 'flat' })).sort(),
  ['bedrooms', 'conservatory', 'extension', 'house_type', 'loft', 'velux'])
check('nothing ever sends a panel count',
  Object.keys(allInputsOf({ ...base, hasConservatory: true })).sort(),
  ['bedrooms', 'conservatory', 'extension', 'house_type', 'loft', 'velux'])

console.log('\n--- reading a row: oversized -> ok -> reason, in that order (§5) ---')
check('oversized wins even with a real-looking price',
  classifyRow({ ok: true, price: 37, serviceKey: 'ext_window_4weekly', oversized: true }),
  { state: 'oversized' })
check('unclassifiable is oversized with an empty missing[]',
  classifyRow({ ok: false, oversized: true, missing: [], reason: 'invalid_house_type' }),
  { state: 'oversized' })
check('missing inputs name what to collect',
  classifyRow({ ok: false, reason: 'missing_inputs', missing: ['extension', 'conservatory'] }),
  { state: 'not_priceable', reason: 'missing_inputs', missing: ['extension', 'conservatory'] })
// The reason code does NOT distinguish the two producers of not_applicable. Only the
// message does, which makes it a fragile discriminator and one to treat as such (§5).
check('"not available for this property type" is permanent (§6)',
  classifyRow({ ok: false, reason: 'not_applicable', missing: [],
    message: 'this service is not available for this property type' }),
  { state: 'not_applicable', permanent: true })
check('"does not apply to this property" is only true this turn (§5)',
  classifyRow({ ok: false, reason: 'not_applicable', missing: [],
    message: 'this service does not apply to this property' }),
  { state: 'not_applicable', permanent: false })
// Getting this wrong the safe way costs one extra re-quote. Getting it wrong the other
// way hides two sellable services forever and nobody ever finds out.
check('an unrecognised message fails safe, as NOT permanent',
  classifyRow({ ok: false, reason: 'not_applicable', missing: [] }),
  { state: 'not_applicable', permanent: false })
check('an unknown service key is a refusal, not a price',
  classifyRow({ ok: false, reason: 'unknown_service', missing: [],
    serviceKey: 'fascia_soffit_gutter' }),
  { state: 'not_priceable', reason: 'unknown_service', missing: [] })
check('a priced row carries the field it belongs in',
  classifyRow({ ok: true, price: 23, serviceKey: 'ext_window_4weekly', ghlField: 'contact.4weekly' }),
  { state: 'priced', price: 23, ghlField: 'contact.4weekly' })
check('only a priced row is selectable — there is no on-visit state now',
  [
    isSelectableCell({ state: 'priced', price: 23 }),
    isSelectableCell({ state: 'not_applicable', permanent: false }),
    isSelectableCell({ state: 'not_priceable', reason: 'missing_inputs', missing: [] }),
    isSelectableCell({ state: 'oversized' }),
    isSelectableCell({ state: 'unavailable', reason: 'unauthorized' }),
  ],
  [true, false, false, false, false])

console.log('\n--- out of band, decided before any call (§5) ---')
check('6 bedrooms is a custom quote', isOutOfBand({ ...base, bedrooms: 6 }), true)
check('5 bedrooms is priceable', isOutOfBand({ ...base, bedrooms: 5 }), false)
check('no answer is not zero bedrooms', isOutOfBand({ ...base, bedrooms: undefined }), true)
// The Flat row runs 1 to 5 bands exactly as a house does (§6), so this is the same guard
// for the same reason: catching it here means never making the call at all.
check('a 6-bedroom FLAT is out of band too', isOutOfBand({ ...base, kind: 'flat', bedrooms: 6 }), true)

console.log('\n--- the cache key holds only what moves a price ---')
check('frequency does not change the key',
  inputsKeyFor({ ...base, selectedPlan: 4 }) === inputsKeyFor({ ...base, selectedPlan: 8 }), true)
check('add-ons do not change the key',
  inputsKeyFor({ ...base, addons: { ...base.addons, gutterClear: true } }) === inputsKeyFor(base), true)
check('bedrooms DOES change the key',
  inputsKeyFor({ ...base, bedrooms: 4 }) === inputsKeyFor(base), false)
check('so does the conservatory answer, which gates two rows (§5)',
  inputsKeyFor({ ...base, hasConservatory: true }) === inputsKeyFor(base), false)

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures. Measured responses, transcribed from the doc, in response order.
// ─────────────────────────────────────────────────────────────────────────────

/** §4's verified response / §10 probe 2: Semi Detached, 3 bed, every gate No. */
const HOUSE_ROWS: QuoteRow[] = [
  { ok: true, price: 43.5, serviceKey: 'ext_window_oneoff', ghlField: 'contact.oneoff', oversized: false },
  { ok: true, price: 58, serviceKey: 'int_window_oneoff', ghlField: 'contact.ad_hoc_internal_window_cleaning', oversized: false },
  { ok: true, price: 26, serviceKey: 'ext_window_4weekly', ghlField: 'contact.4weekly', oversized: false },
  { ok: true, price: 29, serviceKey: 'ext_window_8weekly', ghlField: 'contact.8weekly', oversized: false },
  { ok: true, price: 100, serviceKey: 'fascia_soffit_clean', ghlField: 'contact.fascia_soffit_and_gutter_clean', oversized: false },
  { ok: true, price: 125, serviceKey: 'full_gutter_clearance', ghlField: 'contact.full_gutter_clearance', oversized: false },
  { ok: false, price: null, serviceKey: 'conservatory_roof_external', oversized: false,
    reason: 'not_applicable', message: 'this service does not apply to this property', missing: [] },
  { ok: false, price: null, serviceKey: 'conservatory_roof_internal', oversized: false,
    reason: 'not_applicable', message: 'this service does not apply to this property', missing: [] },
]

/** §10 probe 4: Detached, 4 bed, all FOUR gates Yes. All eight priced. */
const SURCHARGED_ROWS: QuoteRow[] = [
  { ok: true, price: 129, serviceKey: 'ext_window_oneoff', oversized: false },
  { ok: true, price: 172, serviceKey: 'int_window_oneoff', oversized: false },
  { ok: true, price: 83, serviceKey: 'ext_window_4weekly', oversized: false },
  { ok: true, price: 86, serviceKey: 'ext_window_8weekly', oversized: false },
  { ok: true, price: 184, serviceKey: 'fascia_soffit_clean', oversized: false },
  { ok: true, price: 230, serviceKey: 'full_gutter_clearance', oversized: false },
  { ok: true, price: 100, serviceKey: 'conservatory_roof_external', oversized: false },
  { ok: true, price: 150, serviceKey: 'conservatory_roof_internal', oversized: false },
]

console.log('\n--- the ordinary house: six priced, two refused this turn (§10 probe 2) ---')
const houseTable = tableFrom(HOUSE_ROWS)
check('the table is not oversized', houseTable.oversized, false)
// Rows arrived derived-first. Matching on position would read the one-off's 43.50 here.
check('rows are matched on serviceKey, never on position (§4)',
  [priceOf(houseTable, 'ext_window_4weekly'), priceOf(houseTable, 'ext_window_8weekly')], [26, 29])
check('the price belongs where the row says it does',
  ghlFieldOf(houseTable, 'ext_window_4weekly'), 'contact.4weekly')
check('both roof rows are hidden, but only for this turn (§5)',
  ROOF_KEYS.map((key) => cellOf(houseTable, key)),
  [{ state: 'not_applicable', permanent: false }, { state: 'not_applicable', permanent: false }])
check('six of eight priced is the ORDINARY answer, not a degraded one',
  SERVICE_KEYS.filter((key) => cellOf(houseTable, key).state === 'priced').length, 6)
check('the customer has rows to pick', hasSelectableRow(houseTable, base), true)
// not_applicable is the API telling us something real about the property. It must never
// route to the "pricing is unavailable" screen, which is about US.
check('and that is not an outage', pricingUnavailable(houseTable, base), false)

console.log('\n--- the quote, built from returned numbers only ---')
const withGutters: CalcInput = {
  ...base, selectedPlan: 8, addons: { ...base.addons, gutterClear: true },
}
const result = buildCalcResult(houseTable, withGutters)
check('the schedule carries both frequencies verbatim',
  result.schedule,
  [{ label: 'Every 4 Weekly Clean', price: 26 }, { label: 'Every 8 Weekly Clean', price: 29 }])
check('basePrice is the selected frequency', result.basePrice, 29)
check('only selected add-ons appear in extras',
  result.extras, [{ label: GUTTER_CLEARANCE_LABEL, price: 125 }])
check('the total sums returned prices (29 + 125)', result.total, 154)
check('and the selection can be submitted', selectionIsPriced(houseTable, withGutters), true)

console.log('\n--- what a stale tick bills (§5) ---')
// A customer who ticks the conservatory roof clean and then goes back and answers "no
// conservatory" leaves a tick behind on a row the screen no longer renders and the API
// now refuses. Billing it would disable the submit button with nothing on the page left
// to click, so the row is dropped from the bill rather than blocking it.
const staleRoofTick: CalcInput = {
  ...base, addons: { ...base.addons, conservatoryRoofCleanExternal: true },
}
check('a row this property is not offered is not billed',
  selectedServiceKeys(staleRoofTick), ['ext_window_8weekly'])
check('so the stale tick does not deadlock the submit',
  selectionIsPriced(houseTable, staleRoofTick), true)

console.log('\n--- four surcharges, and the multipliers that catch everyone (§7, §10 probe 4) ---')
const surcharged = tableFrom(SURCHARGED_ROWS)
// FOUR uplifts, not two: 35 + ext 10 + cons 16 + loft 12 + velux 10. A consumer that
// itemises only ext and cons shows £61 of lines against an £83 total (§7b).
check('the 4-weekly carries all four uplifts (35 + 10 + 16 + 12 + 10)',
  priceOf(surcharged, 'ext_window_4weekly'), 83)
// 1.5 x (base + every surcharge), not 1.5 x base. The naive re-derivation gives 57, and
// it looks entirely plausible next to the real 129. Read `price`; never re-derive.
check('a one-off is 1.5 x the WHOLE 8-weekly total, not 1.5 x its base',
  priceOf(surcharged, 'ext_window_oneoff'), 129)
// 1.5x and 2x of the same 8-weekly: the two one-offs are NOT interchangeable here, and
// presenting either as the other misquotes by £43 on this property (§3).
check('the internal one-off is 2 x the 8-weekly, the external 1.5 x — never equal',
  [priceOf(surcharged, 'ext_window_oneoff'), priceOf(surcharged, 'int_window_oneoff')],
  [129, 172])
// Separate tables with separate uplifts — gutter carries no velux amount and fascia's
// band-4 uplifts are different again. Neither is derivable from the other.
check('gutter and fascia are read, never derived from each other',
  [priceOf(surcharged, 'fascia_soffit_clean'), priceOf(surcharged, 'full_gutter_clearance')],
  [184, 230])
// The roof table carries no `add` object at all, so all four uplifts land as 0 and the
// internal roof is simply 1.5 x the external (§7a).
check('no uplift moves either roof price; the internal is 1.5 x the external',
  ROOF_KEYS.map((key) => priceOf(surcharged, key)), [100, 150])
const detachedWithFascia: CalcInput = {
  ...base,
  kind: 'detached',
  bedrooms: 4,
  hasExtension: true,
  hasConservatory: true,
  selectedPlan: 4,
  addons: { ...base.addons, fasciaClean: true },
}
check('the fascia line reads the returned number',
  buildCalcResult(surcharged, detachedWithFascia).extras,
  [{ label: FASCIA_SOFFIT_LABEL, price: 184 }])

console.log('\n--- oversized: a real-looking number that is the 5-bedroom rate (§5) ---')
// Detached 6-bed. Every row comes back ok:true — including both conservatory roofs, at
// 110 and 165, for a property that just said it has no conservatory, because above five
// bedrooms the applicability gate switches off entirely (§5). None of it is displayable,
// so the number itself is irrelevant and one stand-in serves every row.
const oversizedTable = tableFrom(
  SERVICE_KEYS.map((key) => ({ ok: true, price: 110, serviceKey: key, oversized: true })),
)
check('the whole table is suppressed', oversizedTable.oversized, true)
check('and no row offers a number to show', priceOf(oversizedTable, 'ext_window_4weekly'), null)
check('nothing is selectable, so the journey routes to a human',
  hasSelectableRow(oversizedTable, base), false)
check('and nothing can be submitted', selectionIsPriced(oversizedTable, base), false)
check('which is not the same as pricing being down',
  pricingUnavailable(oversizedTable, base), false)

console.log('\n--- a flat: window rows priced on BEDROOMS, four rows gone forever (§6) ---')
// §6's measured 2-bed flat. It bands on bedrooms — `flat_banding: "bedrooms"` — so there
// is no floor_level to ask for and the four window rows price from what we already send:
// 18 / 18 (bands 1 and 2 are the same price) and the two derived one-offs off the
// 8-weekly, 1.5 x 18 and 2 x 18. The other four are refused PERMANENTLY.
const FLAT_PRICES: Partial<Record<ServiceKey, number>> = {
  ext_window_4weekly: 18, ext_window_8weekly: 18, ext_window_oneoff: 27, int_window_oneoff: 36,
}
const flat: CalcInput = { ...base, kind: 'flat', bedrooms: 2 }
const flatTable = tableFrom([
  ...WINDOW_KEYS.concat(ONEOFF_KEYS).map((key): QuoteRow => ({
    ok: true, price: FLAT_PRICES[key], serviceKey: key, oversized: false,
  })),
  ...ANCILLARY_KEYS.concat(ROOF_KEYS).map((key): QuoteRow => ({
    ok: false, price: null, serviceKey: key, oversized: false, reason: 'not_applicable',
    message: 'this service is not available for this property type', missing: [],
  })),
])
check('the four rows a flat cannot buy are hidden FOREVER (§6)',
  ANCILLARY_KEYS.concat(ROOF_KEYS).map((key) => cellOf(flatTable, key)),
  new Array(4).fill({ state: 'not_applicable', permanent: true }))
check('the window rows price from the bedrooms we already sent',
  WINDOW_KEYS.map((key) => cellOf(flatTable, key)),
  [{ state: 'priced', price: 18 }, { state: 'priced', price: 18 }])
check('so a flat books itself rather than going to a human',
  hasSelectableRow(flatTable, flat), true)
// The distinction that once told the owner of an ordinary 3-bed semi that their home was
// "large or unusual" because the deployment had no API key.
check('and four refused rows are not an outage',
  pricingUnavailable(flatTable, flat), false)

console.log('\n--- when the failure really is ours (§2: every route 401s today) ---')
const downTable = tableFrom([])
check('every offered row is unavailable',
  pricingUnavailable(downTable, base), true)
check('so nothing can be booked', hasSelectableRow(downTable, base), false)
// Accepted deliberately: an API outage means no self-serve booking. The lead is not
// lost — the submission still persists and someone can call back with a price — and a
// stale-but-plausible number is worse than none.
check('and nothing can be submitted', selectionIsPriced(downTable, withGutters), false)
check('and a quote built from it carries no numbers, never a zero price',
  buildCalcResult(downTable, withGutters).total, 0)

console.log('\n--- parity hold: nothing is held, and the mechanism still works ---')
const held = withParityHold(houseTable, undefined)
check('every offered row survives untouched',
  offeredServiceKeys(base).map((key) => cellOf(held, key)),
  offeredServiceKeys(base).map((key) => cellOf(houseTable, key)))

// ─────────────────────────────────────────────────────────────────────────────
// §10, for real. Opt-in, read-only, and inert until a key exists.
//
// EVERY number below is derived from the doc's "Appendix: the price sheet" and the
// derivation is written next to it. None of it was copied off the wire: a number taken
// from the live API asserts only that the API agrees with itself, so a price book that
// moves overnight would rewrite this file's expectations instead of failing it.
// ─────────────────────────────────────────────────────────────────────────────

/** §1. The location every price in the doc was measured against. */
const DOC_LOCATION = 'gTgq0KNEOclOtud3I65l'

function fromEnvFile(name: string): string {
  const line = ENV_FILES.flatMap((file) => {
    try {
      return readFileSync(file, 'utf8').split(/\r?\n/)
    } catch {
      return []
    }
  })
    .filter((l) => l.startsWith(`${name}=`))
    .pop()
  return line ? line.slice(name.length + 1).replace(/^['"]|['"]$/g, '').trim() : ''
}

const API_BASE = process.env.PRICING_API_URL || 'https://v3-bot-production-5b9f.up.railway.app'

/**
 * Runs one of §10's smoke tests and compares every row to the price the DOC says this
 * property pays.
 *
 * If one of these ever fails, the price book moved. Fix the doc's appendix first and
 * this file second — never the other way round, and never by pasting in the number the
 * API just returned.
 */
async function liveCase(
  name: string,
  inputs: Record<string, unknown>,
  expected: Partial<Record<ServiceKey, PriceCell>>,
  apiKey: string,
  locationId: string,
  serviceKeys?: string[],
): Promise<PriceTable | null> {
  const apiBase = API_BASE
  let response: Response
  try {
    response = await fetch(`${apiBase}/api/v1/pricing/quotes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId, inputs, ...(serviceKeys ? { serviceKeys } : {}) }),
      signal: AbortSignal.timeout(10000),
    })
  } catch (error) {
    failures++
    console.log(`FAIL  ${name} — could not reach the API: ${error}`)
    return null
  }

  if (response.status !== 200) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string }
    failures++
    // A 401 is deliberately vague (§9): bad key, wrong client's key, unknown location,
    // or a key used outside its scope — all four are byte-identical, so check all four.
    console.log(
      `FAIL  ${name} — ${response.status} ${body.error ?? ''}` +
        (response.status === 401
          ? '\n        401 is the same body for a bad key, another client\'s key, an unknown\n' +
            '        location and a scope refusal. Check all four (§2, §9).'
          : `\n        ${body.message ?? ''}`),
    )
    return null
  }

  const body = (await response.json().catch(() => ({}))) as { quotes?: QuoteRow[] }
  const table = tableFrom(Array.isArray(body.quotes) ? body.quotes : [])
  for (const [serviceKey, cell] of Object.entries(expected) as [ServiceKey, PriceCell][]) {
    const actual = cellOf(table, serviceKey)
    // ghlField comes back on a priced row and belongs to the response, not to us — read
    // it, do not assert it here (§3). Compare the number and the state only.
    const trimmed = actual.state === 'priced' ? { state: actual.state, price: actual.price } : actual
    check(`${name}: ${serviceKey}`, trimmed, cell)
  }
  return table
}

/**
 * §10 probe 1. The config itself, which is where every price and every required input
 * comes from — and the only check here that would catch `requiredInputs` or the
 * `front_only` block moving out from under the twelve cases below.
 */
async function liveConfig(apiKey: string, locationId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/v1/pricing/config?locationId=${encodeURIComponent(locationId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10000) },
  ).catch(() => null)

  if (!response || response.status !== 200) {
    failures++
    console.log(`FAIL  probe 1 (config) — ${response ? response.status : 'unreachable'}`)
    return
  }

  const config = (await response.json()) as {
    pricingModel?: string
    requiredInputs?: string[]
    pricing?: { services?: Record<string, unknown>; front_only?: Record<string, unknown> }
    serviceCatalog?: { key?: string; quote_request_only?: boolean }[]
  }

  check('probe 1: pricingModel', config.pricingModel, 'matrix')
  check('probe 1: eight priceable services', Object.keys(config.pricing?.services ?? {}).length, 8)
  // The seven inputs, and the contract our sender is written against: the six gates
  // `allInputsOf` always sends, plus `outdoor_access`, which it sends only when answered.
  check('probe 1: requiredInputs is exactly what we send, plus outdoor_access (§3)',
    [...(config.requiredInputs ?? [])].sort(),
    [...Object.keys(allInputsOf(base)), 'outdoor_access'].sort())
  // Filter on the flag, never on a hardcoded name (§3). The eight that survive the
  // filter must be our eight — anything else and we are offering a row that cannot price.
  check('probe 1: the priceable catalogue is our SERVICE_KEYS, pressure_washing filtered out',
    (config.serviceCatalog ?? []).filter((e) => e.quote_request_only !== true)
      .map((e) => e.key).sort(),
    [...SERVICE_KEYS].sort())
  check('probe 1: pressure_washing is quote_request_only, so we never send it (§3)',
    (config.serviceCatalog ?? []).find((e) => e.key === 'pressure_washing')?.quote_request_only,
    true)
  // The two numbers probes 6 and 7 are derived from: halve, then floor at 14 (§7c).
  check('probe 1: front-only is half price with a £14 floor, on the three external rows',
    { multiplier: config.pricing?.front_only?.multiplier,
      minimum_charge: config.pricing?.front_only?.minimum_charge,
      applies_to: config.pricing?.front_only?.applies_to },
    { multiplier: 0.5, minimum_charge: 14,
      applies_to: ['ext_window_4weekly', 'ext_window_8weekly', 'ext_window_oneoff'] })
}

if (process.argv.includes('--live')) {
  const key = process.env.PRICING_API_KEY || fromEnvFile('PRICING_API_KEY')
  const location = process.env.GHL_LOCATION_ID || fromEnvFile('GHL_LOCATION_ID') || DOC_LOCATION

  console.log('\n--- §10 smoke tests, against the live API ---')
  if (!key) {
    failures++
    console.log(
      'FAIL  no PRICING_API_KEY (env or .env).\n' +
        '      Use the READ key — `credentials.pricing_read_key_webform` — never the admin\n' +
        '      key and never the quote key, and keep it server-side only (§2).',
    )
  } else {
    console.log(`Location ${location}${location === DOC_LOCATION ? '' : ' — NOT the id the doc measured against'}`)

    const priced = (price: number): PriceCell => ({ state: 'priced', price })
    /** Situational: no conservatory today, so no roof to clean. Re-ask and it prices (§5). */
    const thisTurn: PriceCell = { state: 'not_applicable', permanent: false }
    /** Permanent: a flat can never buy these four, whatever it answers (§6). */
    const forever: PriceCell = { state: 'not_applicable', permanent: true }
    const stillNeeded = (...missing: string[]): PriceCell =>
      ({ state: 'not_priceable', reason: 'missing_inputs', missing })
    /** There is no `Town house` row, so the engine refuses rather than folding (§3). */
    const noSuchRow: PriceCell =
      { state: 'not_priceable', reason: 'house_type_not_in_table', missing: [] }

    /**
     * The body the FORM would send for this property — `allInputsOf`, not a hand-written
     * object. A probe that hand-writes its inputs proves the API works and says nothing
     * about whether we can reach it.
     */
    const sent = (property: Partial<CalcInput>): Record<string, unknown> =>
      allInputsOf({ ...base, ...property }) as unknown as Record<string, unknown>

    // Probe 1. Config: the price book's own shape, before a single price is asserted.
    await liveConfig(key, location)

    // Probe 2. Semi Detached, 3 bed, nothing switched on, access unanswered.
    //   4weekly  26      appendix: 4weekly, Semi Detached, band 3
    //   8weekly  29      appendix: 8weekly, Semi Detached, band 3
    //   ext 1off 43.5    1.5 x 29. Half-pounds are ordinary here; nothing rounds (§4)
    //   int 1off 58      2 x 29
    //   gutter   125     appendix: gutter, Semi Detached, band 3
    //   fascia   100     appendix: fascia, Semi Detached, band 3
    //   both roofs refused, situationally — conservatory is No (§5)
    await liveCase(
      'probe 2 (Semi Detached, 3 bed, no extras)',
      sent({}),
      {
        ext_window_4weekly: priced(26), ext_window_8weekly: priced(29),
        ext_window_oneoff: priced(43.5), int_window_oneoff: priced(58),
        full_gutter_clearance: priced(125), fascia_soffit_clean: priced(100),
        conservatory_roof_external: thisTurn, conservatory_roof_internal: thisTurn,
      },
      key, location,
    )

    // Probe 2b. `requiredInputs` is GLOBAL and all-or-nothing (§3). Drop `velux` — which
    // no gutter or fascia cell even carries an amount for — and every row stops pricing.
    // This is the failure that ships a form quoting nothing at all.
    await liveCase(
      'probe 2b (velux omitted — NOTHING prices, not even gutter)',
      { house_type: 'Semi Detached', bedrooms: 3, extension: 'No', conservatory: 'No', loft: 'No' },
      {
        ext_window_4weekly: stillNeeded('velux'),
        full_gutter_clearance: stillNeeded('velux'),
        conservatory_roof_external: stillNeeded('velux'),
      },
      key, location,
    )

    // Probe 2c. The same, for `loft` — the doc's own measured example (§3).
    await liveCase(
      'probe 2c (loft omitted — nothing prices)',
      { house_type: 'Semi Detached', bedrooms: 3, extension: 'No', conservatory: 'No', velux: 'No' },
      {
        ext_window_4weekly: stillNeeded('loft'),
        full_gutter_clearance: stillNeeded('loft'),
      },
      key, location,
    )

    // Probe 3. A FLAT, banded on bedrooms, sending every gate exactly as a house does —
    // because `requiredInputs` is global, a flat missing `loft` is refused too (§3, §6).
    //   4weekly  18      appendix: 4weekly, Flat, band 2 (bands 1 and 2 are both 18)
    //   8weekly  18      appendix: 8weekly, Flat, band 2
    //   ext 1off 27      1.5 x 18
    //   int 1off 36      2 x 18
    //   gutter, fascia and both roofs: PERMANENTLY not_applicable — `standard`
    //   normalization, no Flat row, and no answer the customer gives changes it (§6)
    const flatInputs = sent({ kind: 'flat', bedrooms: 2 })
    check('probe 3: a flat sends all six gates, no floor_level, no panel count (§6)',
      Object.keys(flatInputs).sort(),
      ['bedrooms', 'conservatory', 'extension', 'house_type', 'loft', 'velux'])
    await liveCase(
      'probe 3 (a flat, 2 bed)',
      flatInputs,
      {
        ext_window_4weekly: priced(18), ext_window_8weekly: priced(18),
        ext_window_oneoff: priced(27), int_window_oneoff: priced(36),
        full_gutter_clearance: forever, fascia_soffit_clean: forever,
        conservatory_roof_external: forever, conservatory_roof_internal: forever,
      },
      key, location,
    )

    // Probe 4. All FOUR surcharges at once, Detached 4 bed. Four, not the two a consumer
    // written before 2026-09-19 knows about — if this comes back 35/38 the `surcharges`
    // array has been dropped from the config and every uplift is silently gone (§7b).
    // Detached band 4 add amounts are ext 10 / cons 16 / loft 12 / velux 10 = 48;
    // gutter and fascia carry ext / cons / loft only, NO velux.
    //   4weekly  83      35 + 48
    //   8weekly  86      38 + 48   (the doc's worked reconciliation, §7b)
    //   ext 1off 129     1.5 x 86 — the multiplier takes the surcharges with it
    //   int 1off 172     2 x 86
    //   gutter   230     180 + (14 + 16 + 20)
    //   fascia   184     130 + (16 + 18 + 20)
    //   roof ext 100     appendix: roof, Detached, band 4 — that table has no `add` at all
    //   roof int 150     1.5 x 100
    await liveCase(
      'probe 4 (Detached, 4 bed, all four surcharges)',
      sent({ kind: 'detached', bedrooms: 4, hasExtension: true, hasConservatory: true,
        hasLoftConversion: true, hasVelux: true }),
      {
        ext_window_4weekly: priced(83), ext_window_8weekly: priced(86),
        ext_window_oneoff: priced(129), int_window_oneoff: priced(172),
        full_gutter_clearance: priced(230), fascia_soffit_clean: priced(184),
        conservatory_roof_external: priced(100), conservatory_roof_internal: priced(150),
      },
      key, location,
    )

    // Probe 5. Detached 6 bed. Every row is ok:true carrying the 5-bedroom rate, and both
    // roofs price despite conservatory "No" because above the top band the applicability
    // gate stops firing (§5). `oversized` is the only thing saying so — display none of it.
    await liveCase(
      'probe 5 (6 bedrooms — oversized, never displayable)',
      sent({ kind: 'detached', bedrooms: 6 }),
      Object.fromEntries(SERVICE_KEYS.map((k) => [k, { state: 'oversized' }])),
      key, location,
    )

    // Probe 6. FRONT ONLY, the £14 floor. Terraced 1 bed, outdoor_access "no" (§7c).
    //   4weekly  14      max(0.5 x 18, 14) — half is 9, the floor wins
    //   8weekly  14      max(0.5 x 20, 14) — half is 10, the floor wins
    //   ext 1off 15      0.5 x (1.5 x 20) = 15, above the floor, so halved
    //   int 1off 40      2 x 20, FULL — internal windows are not in `applies_to`
    //   gutter   85      appendix: gutter, Terraced, band 1 — FULL
    //   fascia   70      appendix: fascia, Terraced, band 1 — FULL
    await liveCase(
      'probe 6 (front only, the £14 floor)',
      sent({ kind: 'terraced', bedrooms: 1, hasOutdoorAccess: false }),
      {
        ext_window_4weekly: priced(14), ext_window_8weekly: priced(14),
        ext_window_oneoff: priced(15), int_window_oneoff: priced(40),
        full_gutter_clearance: priced(85), fascia_soffit_clean: priced(70),
        conservatory_roof_external: thisTurn, conservatory_roof_internal: thisTurn,
      },
      key, location,
    )

    // Probe 7. FRONT ONLY, the quarter pound. Detached 3 bed, outdoor_access "no".
    //   4weekly  16      0.5 x 32
    //   8weekly  17.5    0.5 x 35
    //   ext 1off 26.25   0.5 x (1.5 x 35) = 0.5 x 52.5. The only tenant in the fleet that
    //                    returns quarters of a pound. Render it; never round it (§7c)
    //   int 1off 70      2 x 35, FULL
    //   gutter   170     FULL, fascia 120 FULL — neither is in `applies_to`
    await liveCase(
      'probe 7 (front only, the £26.25 quarter pound)',
      sent({ kind: 'detached', hasOutdoorAccess: false }),
      {
        ext_window_4weekly: priced(16), ext_window_8weekly: priced(17.5),
        ext_window_oneoff: priced(26.25), int_window_oneoff: priced(70),
        full_gutter_clearance: priced(170), fascia_soffit_clean: priced(120),
        conservatory_roof_external: thisTurn, conservatory_roof_internal: thisTurn,
      },
      key, location,
    )

    // Probe 8. The SAME property with the access question unanswered — `allInputsOf` omits
    // the key entirely rather than inferring "no" (§7c). Expect the full appendix prices
    // back: 32 / 35 / 52.50 / 70 / 170 / 120. An unanswered question must never discount,
    // and this is the probe that catches it if it ever starts to.
    const fullPrices = {
      ext_window_4weekly: priced(32), ext_window_8weekly: priced(35),
      ext_window_oneoff: priced(52.5), int_window_oneoff: priced(70),
      full_gutter_clearance: priced(170), fascia_soffit_clean: priced(120),
      conservatory_roof_external: thisTurn, conservatory_roof_internal: thisTurn,
    }
    const omitted = sent({ kind: 'detached' })
    check('probe 8: an unanswered access question is omitted, never inferred',
      'outdoor_access' in omitted, false)
    await liveCase('probe 8 (access unanswered — full price, no discount)',
      omitted, fullPrices, key, location)

    // Probe 9. Town House: a REFUSAL, not a fold to Terraced the way the siblings fold it.
    // `oversized` is false — this is not an over-band price. The form must resolve a
    // townhouse to terraced / semi / detached before it calls, which is why 'townhouse' is
    // not a HouseKind at all (§3). Nothing in the form can produce this body; it is here
    // to prove the refusal is real and still costs a sale if we ever send one.
    await liveCase(
      'probe 9 (Town House — refused, never folded)',
      { ...sent({}), house_type: 'Town House' },
      {
        ext_window_4weekly: noSuchRow, ext_window_8weekly: noSuchRow,
        ext_window_oneoff: noSuchRow, int_window_oneoff: noSuchRow,
        full_gutter_clearance: noSuchRow, fascia_soffit_clean: noSuchRow,
        conservatory_roof_external: thisTurn, conservatory_roof_internal: thisTurn,
      },
      key, location,
    )

    // Probe 10. Bungalow folds to Detached — the same six prices as probe 8, which is how
    // the doc proves the fold. A townhouse is asked which of the three it is; a bungalow
    // is not, because the engine already knows.
    await liveCase(
      'probe 10 (Bungalow == Detached)',
      { ...sent({ kind: 'detached' }), house_type: 'Bungalow' },
      fullPrices,
      key, location,
    )

    // Probe 11. `pressure_washing` is quote_request_only: it has no price and never will,
    // and asking for one answers `unknown_service` (§3). We never send it — probe 1 proves
    // the filter is the catalogue's own flag — so this asks for it deliberately, to prove
    // the row cannot reach a price cell even if someone puts it back.
    //   8weekly 35   appendix: 8weekly, Detached, band 3 — beside it, proving the request
    //                itself was fine
    const mixed = await liveCase(
      'probe 11 (pressure_washing is not priceable)',
      sent({ kind: 'detached' }),
      { ext_window_8weekly: priced(35) },
      key, location,
      ['pressure_washing', 'ext_window_8weekly'],
    )
    check('probe 11: the unknown_service row never becomes a cell',
      mixed ? 'pressure_washing' in mixed.cells : 'no table', false)

    // Probe 12 — a read key on `PUT /config` — is NOT replayed here, deliberately. The
    // doc's body is `{"pricing":{"services":{}}}`: if that key ever stopped being read-
    // scoped, the 401 this asserts would instead be a 200 that wiped the price book.
    // Verify the scope by hand, against a throwaway payload, never from a smoke test.
  }
} else {
  console.log('\n(§10 live smoke tests skipped. Run with --live to replay them against the API.)')
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
process.exit(failures === 0 ? 0 : 1)
