/**
 * Checks the pricing integration — our half of it — against
 * `docs/pricing-api-wewasheverything.md`, which is the single source of truth.
 *
 *     npm run check:pricing              # offline, no network, no key needed
 *     npm run check:pricing -- --live    # also runs §15's smoke tests for real
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
 * `--live` is the other half: it replays §15's cases against the real API with the read
 * key and compares. `/quotes` is a pure calculator — it reads no contact and writes
 * nothing — so this stays read-only however it is run.
 *
 * Two of those live cases are load-bearing rather than decorative. `test 4` is the only
 * thing that would catch the `surcharges` array being dropped from the config by a
 * `PUT` — every loft and velux uplift silently gone, prices still 200 and still
 * plausible (§16). And `test 5b` proves `loft` really is required, which is the failure
 * that would otherwise ship a form quoting nothing at all.
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
  serviceKeyForFrequency,
  yesNo,
} from '../src/lib/pricing'
import {
  EXT_CONSERVATORY_ROOF_LABEL,
  FASCIA_SOFFIT_LABEL,
  FREQUENCIES,
  GUTTER_CLEARANCE_LABEL,
  INT_CONSERVATORY_ROOF_LABEL,
  frequencyLabel,
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
 * two DERIVED services rather than the two frequencies a reader expects (§3). That is
 * deliberate: a reader that matched on position would take the one-off's £46 for the
 * 6-weekly price and every assertion downstream would be quietly wrong.
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
  selectedFrequency: 12,
  addons: {
    gutterClear: false,
    fasciaClean: false,
    conservatoryRoofCleanExternal: false,
    conservatoryRoofCleanInternal: false,
  },
}

console.log('\n--- the catalogue is the EIGHT services this client sells (§4) ---')
check('eight service keys, no more', SERVICE_KEYS.length, 8)
check('the fascia key is fascia_soffit_clean here', SERVICE_KEYS.includes('fascia_soffit_clean'), true)
// Sending an old key returns a 200 carrying reason "unknown_service", never a 400, so
// the mistake is silent and a UI rendering serviceLabel shows a service that does not
// exist with a blank price (§4). Refusing the key here is the only loud failure available.
check('the other clients\' fascia key is not one of ours', isServiceKey('fascia_soffit_gutter'), false)
check('there is no 8-weekly service in this catalogue', isServiceKey('ext_window_8weekly'), false)
check('there is no 4-weekly service either', isServiceKey('ext_window_4weekly'), false)
check('both one-offs are keyed', ONEOFF_KEYS, ['ext_window_oneoff', 'int_window_oneoff'])
check('both conservatory roofs are keyed', ROOF_KEYS,
  ['conservatory_roof_external', 'conservatory_roof_internal'])
check('the frequencies are 6 and 12', FREQUENCIES, [6, 12])
// The UI looks rows up by label (`extras.find(e => e.label === …)`), so a frequency row
// whose label does not match `frequencyLabel` resolves to nothing and prices nothing.
check('the 6-weekly row is labelled the way the frequency is',
  LABEL_BY_SERVICE_KEY[serviceKeyForFrequency(6)], frequencyLabel(6))
check('and so is the 12-weekly row',
  LABEL_BY_SERVICE_KEY[serviceKeyForFrequency(12)], frequencyLabel(12))
check('labels round-trip back to their key',
  SERVICE_KEY_BY_LABEL[GUTTER_CLEARANCE_LABEL], 'full_gutter_clearance')
check('the two roof labels are distinct',
  EXT_CONSERVATORY_ROOF_LABEL === INT_CONSERVATORY_ROOF_LABEL, false)

console.log('\n--- which rows are OFFERED to the customer ---')
// Not the same question as what we ask the API: the request omits serviceKeys entirely,
// so the whole catalogue always comes back and applicability is read off the answer.
check('a house with no conservatory is offered 4 rows',
  offeredServiceKeys({ kind: 'semi_detached', hasConservatory: false }).length, 4)
check('a conservatory adds BOTH roof rows',
  offeredServiceKeys({ kind: 'semi_detached', hasConservatory: true }).length, 6)
// Every table carries a `Town house` row byte-identical to its `Terraced` one (§5), so
// townhouses buy gutters and fascia here. They did not under the previous contract.
check('a townhouse IS offered gutter and fascia (§5)',
  offeredServiceKeys({ kind: 'townhouse', hasConservatory: false }),
  [...WINDOW_KEYS, ...ANCILLARY_KEYS])
check('a flat is offered window cleaning only (§8)',
  offeredServiceKeys({ kind: 'flat', hasConservatory: false }), WINDOW_KEYS)
// A 'yes' left over from a house the customer picked before going back and choosing a
// flat, which is never asked the question at all.
check('a stale conservatory answer does not open the roof rows on a flat',
  offeredServiceKeys({ kind: 'flat', hasConservatory: true }), WINDOW_KEYS)
// Priced and returned on every call, deliberately not offered on the quote screen: they
// are an alternative to a subscription, not an add-on to one.
check('neither one-off is offered alongside the frequency choice',
  offeredServiceKeys({ kind: 'detached', hasConservatory: true })
    .some((key) => (ONEOFF_KEYS as string[]).includes(key)), false)
check('townhouses support ancillary services', supportsAncillaryServices('townhouse'), true)
check('flats do not', supportsAncillaryServices('flat'), false)
check('and a flat is never surcharged (§5)', supportsUplifts('flat'), false)

console.log('\n--- what we SEND ---')
// SIX inputs, not the four §6 of the doc implies. `loft` and `number_of_velux` became
// real pricing inputs after that section was written, and `loft` is REQUIRED — a house
// sent without it gets `missing_inputs` on all eight rows, so the customer sees no quote
// at all. Verified against the live API on 2026-09-09; `GET /config` is the authority.
check('a house sends all six inputs, loft and velux included',
  allInputsOf(base),
  { house_type: 'Semi Detached', bedrooms: 3, extension: 'No', conservatory: 'No',
    loft: 'No', number_of_velux: 0 })
check('a loft conversion travels as the exact string',
  allInputsOf({ ...base, hasLoftConversion: true }).loft, 'Yes')
check('a velux count travels as a number, not a flag',
  allInputsOf({ ...base, veluxCount: 6 }).number_of_velux, 6)
// 0 and "absent" mean the same thing to the API, so the explicit 0 reads as an answer.
check('no velux sends an explicit 0',
  allInputsOf({ ...base, veluxCount: undefined }).number_of_velux, 0)
// The number 1 is a re-ask, not a yes; "yeah" and "yep" are re-asks too. Booleans or the
// exact strings, or the row comes back missing_inputs (§6).
check('extension and conservatory are the exact strings',
  allInputsOf({ ...base, hasExtension: true, hasConservatory: true }).extension, 'Yes')
check('yesNo says No, not false', yesNo(false), 'No')
check('a townhouse sends the table\'s own row name', HOUSE_TYPE_BY_KIND.townhouse, 'Town house')
// A flat bands on BEDROOMS here — the client's own rule, in `flat_banding` (§7). Sending
// floor_level is the documented trap, not the fix: the engine would read it as a bedroom
// column and quote a 3-bed first-floor flat at the ONE-bedroom price, ok:true,
// oversized:false, with nothing in the response to flag it.
check('a flat sends its bedrooms, like a house (§7)',
  allInputsOf({ ...base, kind: 'flat' }), { house_type: 'Flat', bedrooms: 3 })
check('a flat sends NO floor_level',
  'floor_level' in allInputsOf({ ...base, kind: 'flat' }), false)
// Sending No for a question the customer was never shown is inventing an answer.
check('a flat sends no extension or conservatory either',
  Object.keys(allInputsOf({ ...base, kind: 'flat' })).sort(), ['bedrooms', 'house_type'])
// No unit_rate service exists in this config and the field is not in field_mapping;
// sending a panel count prices nothing (§4).
check('nothing ever sends a panel count',
  Object.keys(allInputsOf({ ...base, hasConservatory: true })).sort(),
  ['bedrooms', 'conservatory', 'extension', 'house_type', 'loft', 'number_of_velux'])

console.log('\n--- reading a row: oversized -> ok -> reason, in that order (§9) ---')
check('oversized wins even with a real-looking price',
  classifyRow({ ok: true, price: 37, serviceKey: 'ext_window_6weekly', oversized: true }),
  { state: 'oversized' })
check('unclassifiable is oversized with an empty missing[]',
  classifyRow({ ok: false, oversized: true, missing: [], reason: 'invalid_house_type' }),
  { state: 'oversized' })
check('missing inputs name what to collect',
  classifyRow({ ok: false, reason: 'missing_inputs', missing: ['extension', 'conservatory'] }),
  { state: 'not_priceable', reason: 'missing_inputs', missing: ['extension', 'conservatory'] })
// The reason code does NOT distinguish the two producers of not_applicable. Only the
// message does, which makes it a fragile discriminator and one to treat as such (§9b).
check('"not available for this property type" is permanent (§8)',
  classifyRow({ ok: false, reason: 'not_applicable', missing: [],
    message: 'this service is not available for this property type' }),
  { state: 'not_applicable', permanent: true })
check('"does not apply to this property" is only true this turn (§9b)',
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
  classifyRow({ ok: true, price: 23, serviceKey: 'ext_window_6weekly', ghlField: 'contact.6weekly' }),
  { state: 'priced', price: 23, ghlField: 'contact.6weekly' })
check('only a priced row is selectable — there is no on-visit state now',
  [
    isSelectableCell({ state: 'priced', price: 23 }),
    isSelectableCell({ state: 'not_applicable', permanent: false }),
    isSelectableCell({ state: 'not_priceable', reason: 'missing_inputs', missing: [] }),
    isSelectableCell({ state: 'oversized' }),
    isSelectableCell({ state: 'unavailable', reason: 'unauthorized' }),
  ],
  [true, false, false, false, false])

console.log('\n--- out of band, decided before any call (§9, §10) ---')
check('6 bedrooms is a custom quote', isOutOfBand({ ...base, bedrooms: 6 }), true)
check('5 bedrooms is priceable', isOutOfBand({ ...base, bedrooms: 5 }), false)
check('no answer is not zero bedrooms', isOutOfBand({ ...base, bedrooms: undefined }), true)
// The engine cannot flag an oversized flat at all — a Flat row carries floorLevel rather
// than bedrooms, so its bedrooms > band walk has nothing to compare (§10). The form
// deciding it is the only guard there is.
check('a 6-bedroom FLAT is out of band too', isOutOfBand({ ...base, kind: 'flat', bedrooms: 6 }), true)

console.log('\n--- the cache key holds only what moves a price ---')
check('frequency does not change the key',
  inputsKeyFor({ ...base, selectedFrequency: 6 }) === inputsKeyFor({ ...base, selectedFrequency: 12 }), true)
check('add-ons do not change the key',
  inputsKeyFor({ ...base, addons: { ...base.addons, gutterClear: true } }) === inputsKeyFor(base), true)
check('bedrooms DOES change the key',
  inputsKeyFor({ ...base, bedrooms: 4 }) === inputsKeyFor(base), false)
check('so does the conservatory answer, which gates two rows (§9b)',
  inputsKeyFor({ ...base, hasConservatory: true }) === inputsKeyFor(base), false)

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures. Measured responses, transcribed from the doc, in response order.
// ─────────────────────────────────────────────────────────────────────────────

/** §15 test 2 / §3: Semi Detached, 3 bed, extension No, conservatory No. */
const HOUSE_ROWS: QuoteRow[] = [
  { ok: true, price: 46, serviceKey: 'ext_window_oneoff', ghlField: 'contact.oneoff', oversized: false },
  { ok: true, price: 46, serviceKey: 'int_window_oneoff', ghlField: 'contact.ad_hoc_internal_window_cleaning', oversized: false },
  { ok: true, price: 23, serviceKey: 'ext_window_6weekly', ghlField: 'contact.6weekly', oversized: false },
  { ok: true, price: 33, serviceKey: 'ext_window_12weekly', ghlField: 'contact.12weekly', oversized: false },
  { ok: true, price: 99, serviceKey: 'fascia_soffit_clean', ghlField: 'contact.fascia_soffit_and_gutter_clean', oversized: false },
  { ok: true, price: 99, serviceKey: 'full_gutter_clearance', ghlField: 'contact.full_gutter_clearance', oversized: false },
  { ok: false, price: null, serviceKey: 'conservatory_roof_external', oversized: false,
    reason: 'not_applicable', message: 'this service does not apply to this property', missing: [] },
  { ok: false, price: null, serviceKey: 'conservatory_roof_internal', oversized: false,
    reason: 'not_applicable', message: 'this service does not apply to this property', missing: [] },
]

/** §15 test 3: Detached, 4 bed, extension Yes, conservatory Yes. All eight priced. */
const SURCHARGED_ROWS: QuoteRow[] = [
  { ok: true, price: 82, serviceKey: 'ext_window_oneoff', oversized: false },
  { ok: true, price: 82, serviceKey: 'int_window_oneoff', oversized: false },
  { ok: true, price: 41, serviceKey: 'ext_window_6weekly', oversized: false },
  { ok: true, price: 57, serviceKey: 'ext_window_12weekly', oversized: false },
  { ok: true, price: 133, serviceKey: 'fascia_soffit_clean', oversized: false },
  { ok: true, price: 134, serviceKey: 'full_gutter_clearance', oversized: false },
  { ok: true, price: 119, serviceKey: 'conservatory_roof_external', oversized: false },
  { ok: true, price: 119, serviceKey: 'conservatory_roof_internal', oversized: false },
]

console.log('\n--- the ordinary house: six priced, two refused this turn (§15 test 2) ---')
const houseTable = tableFrom(HOUSE_ROWS)
check('the table is not oversized', houseTable.oversized, false)
// Rows arrived derived-first. Matching on position would read the one-off's 46 here.
check('rows are matched on serviceKey, never on position (§3)',
  [priceOf(houseTable, 'ext_window_6weekly'), priceOf(houseTable, 'ext_window_12weekly')], [23, 33])
check('the price belongs where the row says it does',
  ghlFieldOf(houseTable, 'ext_window_6weekly'), 'contact.6weekly')
check('both roof rows are hidden, but only for this turn (§9b)',
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
  ...base, selectedFrequency: 12, addons: { ...base.addons, gutterClear: true },
}
const result = buildCalcResult(houseTable, withGutters)
check('the schedule carries both frequencies verbatim',
  result.schedule, [{ label: '6 Weekly', price: 23 }, { label: '12 Weekly', price: 33 }])
check('basePrice is the selected frequency', result.basePrice, 33)
check('only selected add-ons appear in extras',
  result.extras, [{ label: GUTTER_CLEARANCE_LABEL, price: 99 }])
check('the total sums returned prices (33 + 99)', result.total, 132)
check('and the selection can be submitted', selectionIsPriced(houseTable, withGutters), true)

console.log('\n--- what a stale tick bills (§9b) ---')
// A customer who ticks the conservatory roof clean and then goes back and answers "no
// conservatory" leaves a tick behind on a row the screen no longer renders and the API
// now refuses. Billing it would disable the submit button with nothing on the page left
// to click, so the row is dropped from the bill rather than blocking it.
const staleRoofTick: CalcInput = {
  ...base, addons: { ...base.addons, conservatoryRoofCleanExternal: true },
}
check('a row this property is not offered is not billed',
  selectedServiceKeys(staleRoofTick), ['ext_window_12weekly'])
check('so the stale tick does not deadlock the submit',
  selectionIsPriced(houseTable, staleRoofTick), true)

console.log('\n--- surcharges, and the doubling that catches everyone (§4, §15 test 3) ---')
const surcharged = tableFrom(SURCHARGED_ROWS)
check('the 6-weekly carries its uplifts (29 + 2 + 10)',
  priceOf(surcharged, 'ext_window_6weekly'), 41)
// 2 x (base + ext + cons), not 2 x base + ext + cons. The naive re-derivation gives 70,
// and it looks entirely plausible next to the real 82. Read `price`; never re-derive.
check('a one-off is 2 x the WHOLE 6-weekly total, not 2 x its base',
  priceOf(surcharged, 'ext_window_oneoff'), 82)
check('the two one-offs are always the same number',
  priceOf(surcharged, 'ext_window_oneoff') === priceOf(surcharged, 'int_window_oneoff'), true)
// The two tables cross once the uplifts land, by a single pound, and only here. Any code
// assuming one of them is always the larger breaks on exactly this property (§5).
check('gutter exceeds fascia by one pound on this property',
  [priceOf(surcharged, 'fascia_soffit_clean'), priceOf(surcharged, 'full_gutter_clearance')],
  [133, 134])
// Not one of that table's 20 cells carries an `add` object (§5).
check('neither uplift moves either roof price',
  ROOF_KEYS.map((key) => priceOf(surcharged, key)), [119, 119])
const detachedWithFascia: CalcInput = {
  ...base,
  kind: 'detached',
  bedrooms: 4,
  hasExtension: true,
  hasConservatory: true,
  selectedFrequency: 6,
  addons: { ...base.addons, fasciaClean: true },
}
check('the fascia line reads the returned number',
  buildCalcResult(surcharged, detachedWithFascia).extras,
  [{ label: FASCIA_SOFFIT_LABEL, price: 133 }])

console.log('\n--- oversized: a real-looking number that is the 5-bedroom rate (§9) ---')
// Detached 9-bed. Every row comes back ok:true — including both conservatory roofs at
// 139 for a property that just said it has no conservatory, because above five bedrooms
// the applicability gate switches off entirely (§9b). None of it is displayable.
const oversizedTable = tableFrom(
  SERVICE_KEYS.map((key) => ({ ok: true, price: 139, serviceKey: key, oversized: true })),
)
check('the whole table is suppressed', oversizedTable.oversized, true)
check('and no row offers a number to show', priceOf(oversizedTable, 'ext_window_6weekly'), null)
check('nothing is selectable, so the journey routes to a human',
  hasSelectableRow(oversizedTable, base), false)
check('and nothing can be submitted', selectionIsPriced(oversizedTable, base), false)
check('which is not the same as pricing being down',
  pricingUnavailable(oversizedTable, base), false)

console.log('\n--- a flat, today (§7, §15 test 7) ---')
// The config says a flat bands on bedrooms; the engine bands on floors and demands
// floor_level. The form will not send it — sending it quotes the ONE-bedroom price for a
// 3-bed first-floor flat, ok:true, with nothing in the response to flag it — so every
// window row answers missing_inputs and the customer reaches a human instead of a wrong
// number. When §7 is fixed properly these four rows price from the bedrooms we already
// send, and this fixture is what will change.
const flat: CalcInput = { ...base, kind: 'flat' }
const flatTable = tableFrom([
  ...WINDOW_KEYS.concat(ONEOFF_KEYS).map((key): QuoteRow => ({
    ok: false, price: null, serviceKey: key, oversized: false,
    reason: 'missing_inputs', message: 'still needed: floor_level', missing: ['floor_level'],
  })),
  ...ANCILLARY_KEYS.concat(ROOF_KEYS).map((key): QuoteRow => ({
    ok: false, price: null, serviceKey: key, oversized: false, reason: 'not_applicable',
    message: 'this service is not available for this property type', missing: [],
  })),
])
check('the four rows a flat cannot buy are hidden FOREVER (§8)',
  ANCILLARY_KEYS.concat(ROOF_KEYS).map((key) => cellOf(flatTable, key)),
  new Array(4).fill({ state: 'not_applicable', permanent: true }))
check('the window rows ask a question rather than guessing',
  cellOf(flatTable, 'ext_window_6weekly'),
  { state: 'not_priceable', reason: 'missing_inputs', missing: ['floor_level'] })
check('nothing is selectable, so the flat goes to a custom quote',
  hasSelectableRow(flatTable, flat), false)
// The distinction that once told the owner of an ordinary 3-bed semi that their home was
// "large or unusual" because the deployment had no API key.
check('and the form must not call that an outage',
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
// §15, for real. Opt-in, read-only, and inert until a key exists.
// ─────────────────────────────────────────────────────────────────────────────

/** The location §15 pins its expectations to. */
const DOC_LOCATION = 'A9cGvKBunXk003dXUmSV'

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

/**
 * Runs one of §15's smoke tests and compares every row to the doc's measured answer.
 *
 * Prices are compared, not asserted from a book: the expectations are transcribed from
 * §15 and exist to say "the number moved" loudly. If one legitimately moves, fix the
 * doc's table first and this second — never the other way round.
 */
async function liveCase(
  name: string,
  inputs: Record<string, unknown>,
  expected: Partial<Record<ServiceKey, PriceCell>>,
  apiKey: string,
  locationId: string,
): Promise<void> {
  const apiBase = process.env.PRICING_API_URL || 'https://v3-bot-production-5b9f.up.railway.app'
  let response: Response
  try {
    response = await fetch(`${apiBase}/api/v1/pricing/quotes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId, inputs }),
      signal: AbortSignal.timeout(10000),
    })
  } catch (error) {
    failures++
    console.log(`FAIL  ${name} — could not reach the API: ${error}`)
    return
  }

  if (response.status !== 200) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string }
    failures++
    // The two answers this client gives today, and they mean different things: a 401 is
    // "no key has been minted", a 422 is "the config still does not load" (§2). Neither
    // is a broken check — both are the ship checklist telling the truth.
    console.log(
      `FAIL  ${name} — ${response.status} ${body.error ?? ''}` +
        (response.status === 401
          ? '\n        No pricing credential exists for this client. Mint a READ key (§2, §3).'
          : response.status === 422
            ? `\n        ${body.message ?? ''}\n        The config does not load. Do NOT clear it by adding floor_level (§7).`
            : ''),
    )
    return
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
}

if (process.argv.includes('--live')) {
  const key = process.env.PRICING_API_KEY || fromEnvFile('PRICING_API_KEY')
  const location = process.env.GHL_LOCATION_ID || fromEnvFile('GHL_LOCATION_ID') || DOC_LOCATION

  console.log('\n--- §15 smoke tests, against the live API ---')
  if (!key) {
    failures++
    console.log(
      'FAIL  no PRICING_API_KEY (env or .env.local).\n' +
        '      This client had no pricing credential of any kind when the doc was written;\n' +
        '      mint a READ key — not a quote key — and set it server-side only (§2, §3).',
    )
  } else {
    console.log(`Location ${location}${location === DOC_LOCATION ? '' : ' — NOT the id §15 measured against'}`)
    const priced = (price: number): PriceCell => ({ state: 'priced', price })
    const thisTurn: PriceCell = { state: 'not_applicable', permanent: false }

    // The permanent flavour: a flat can never buy these four, whatever it answers (§9a).
    const forever: PriceCell = { state: 'not_applicable', permanent: true }

    // §15 test 2. Two rows refused, and that is CORRECT: conservatory is No, so there is
    // no roof to clean. Situational, not structural — `permanent: false` (§9b).
    await liveCase(
      'test 2 (Semi Detached, 3 bed, no extras)',
      { house_type: 'Semi Detached', bedrooms: 3, extension: 'No', conservatory: 'No', loft: 'No' },
      {
        ext_window_6weekly: priced(23), ext_window_12weekly: priced(33),
        ext_window_oneoff: priced(46), int_window_oneoff: priced(46),
        full_gutter_clearance: priced(99), fascia_soffit_clean: priced(99),
        conservatory_roof_external: thisTurn, conservatory_roof_internal: thisTurn,
      },
      key, location,
    )

    // §15 test 2b. The same property with a conservatory: every row moves and both roof
    // rows appear. This is the pair that proves `not_applicable` must never be cached.
    await liveCase(
      'test 2b (same, conservatory Yes)',
      { house_type: 'Semi Detached', bedrooms: 3, extension: 'No', conservatory: 'Yes', loft: 'No' },
      {
        ext_window_6weekly: priced(30), ext_window_12weekly: priced(40),
        ext_window_oneoff: priced(60), int_window_oneoff: priced(60),
        full_gutter_clearance: priced(107), fascia_soffit_clean: priced(105),
        conservatory_roof_external: priced(99), conservatory_roof_internal: priced(99),
      },
      key, location,
    )

    // §15 test 3. All eight priced, and the one-offs are 2 x (29 + 2 + 10) = 82 — the
    // multiplier doubles the surcharges too, so never re-derive one from the base.
    await liveCase(
      'test 3 (Detached, 4 bed, both extras)',
      { house_type: 'Detached', bedrooms: 4, extension: 'Yes', conservatory: 'Yes', loft: 'No' },
      {
        ext_window_6weekly: priced(41), ext_window_12weekly: priced(57),
        ext_window_oneoff: priced(82), int_window_oneoff: priced(82),
        full_gutter_clearance: priced(134), fascia_soffit_clean: priced(133),
        conservatory_roof_external: priced(119), conservatory_roof_internal: priced(119),
      },
      key, location,
    )

    // §15 test 4. All FOUR surcharges at once — the case §7 of the previous revision said
    // could not happen. 6-weekly is 29 + ext 2 + cons 10 + loft 2 + velux 3 = 46, and the
    // one-offs double the lot to 92. If this ever comes back 41/82 the surcharge array has
    // been dropped from the config by a `PUT` and every loft and velux uplift is gone.
    await liveCase(
      'test 4 (all four surcharges)',
      { house_type: 'Detached', bedrooms: 4, extension: 'Yes', conservatory: 'Yes',
        loft: 'Yes', number_of_velux: 3 },
      {
        ext_window_6weekly: priced(46), ext_window_12weekly: priced(62),
        ext_window_oneoff: priced(92), int_window_oneoff: priced(92),
        full_gutter_clearance: priced(141), fascia_soffit_clean: priced(140),
        conservatory_roof_external: priced(119), conservatory_roof_internal: priced(119),
      },
      key, location,
    )

    // §15 test 5. `number_of_velux` is optional and priced as zero when absent — the form
    // sends an explicit 0, so this proves the two are equivalent.
    await liveCase(
      'test 5 (Detached, 3 bed, velux omitted entirely)',
      { house_type: 'Detached', bedrooms: 3, extension: 'No', conservatory: 'No', loft: 'No' },
      {
        ext_window_6weekly: priced(23), ext_window_12weekly: priced(33),
        ext_window_oneoff: priced(46), int_window_oneoff: priced(46),
        full_gutter_clearance: priced(99), fascia_soffit_clean: priced(109),
        conservatory_roof_external: thisTurn, conservatory_roof_internal: thisTurn,
      },
      key, location,
    )

    // §15 test 5, second half. `loft` is NOT optional: drop it and the whole property
    // stops pricing. This is the one that would have shipped a form quoting nothing.
    await liveCase(
      'test 5b (loft omitted — nothing prices)',
      { house_type: 'Detached', bedrooms: 3, extension: 'No', conservatory: 'No' },
      {
        ext_window_6weekly: { state: 'not_priceable', reason: 'missing_inputs', missing: ['loft'] },
        full_gutter_clearance: { state: 'not_priceable', reason: 'missing_inputs', missing: ['loft'] },
      },
      key, location,
    )

    // §15 test 6. A flat, banded on BEDROOMS, with nothing else supplied at all — and the
    // other four rows refused with the PERMANENT message, which is a different fact from
    // test 2's refusal even though the reason code is identical (§9a vs §9b).
    await liveCase(
      'test 6 (a flat, bedrooms only)',
      { house_type: 'Flat', bedrooms: 3 },
      {
        ext_window_6weekly: priced(23), ext_window_12weekly: priced(33),
        ext_window_oneoff: priced(46), int_window_oneoff: priced(46),
        full_gutter_clearance: forever, fascia_soffit_clean: forever,
        conservatory_roof_external: forever, conservatory_roof_internal: forever,
      },
      key, location,
    )

    // §15 test 6b. The same flat with a floor_level and every surcharge switched on
    // returns the IDENTICAL four prices. The form sends none of this; the case exists so
    // that re-adding `floor_level` cannot quietly change a flat's price again.
    await liveCase(
      'test 6b (flat ignores floor_level and every surcharge)',
      { house_type: 'Flat', bedrooms: 3, floor_level: 5, extension: 'Yes',
        conservatory: 'Yes', loft: 'Yes', number_of_velux: 9 },
      {
        ext_window_6weekly: priced(23), ext_window_12weekly: priced(33),
        ext_window_oneoff: priced(46), int_window_oneoff: priced(46),
      },
      key, location,
    )

    // §15 test 8. Over five bedrooms every row comes back ok:true with a real-looking
    // number that is simply the 5-bedroom rate. `oversized` is the ONLY thing saying so,
    // which is why it is read before `ok`.
    await liveCase(
      'test 8 (9 bedrooms — oversized, never displayable)',
      { house_type: 'Detached', bedrooms: 9, extension: 'No', conservatory: 'No', loft: 'No' },
      {
        ext_window_6weekly: { state: 'oversized' }, ext_window_12weekly: { state: 'oversized' },
        ext_window_oneoff: { state: 'oversized' }, int_window_oneoff: { state: 'oversized' },
        full_gutter_clearance: { state: 'oversized' }, fascia_soffit_clean: { state: 'oversized' },
        conservatory_roof_external: { state: 'oversized' },
        conservatory_roof_internal: { state: 'oversized' },
      },
      key, location,
    )
  }
} else {
  console.log('\n(§15 live smoke tests skipped. Run with --live to replay them against the API.)')
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
process.exit(failures === 0 ? 0 : 1)
