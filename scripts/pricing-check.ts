/**
 * Checks the pricing logic against the worked example in the v3 bot spec.
 *
 * No test runner in this project, so this is a plain script:
 *
 *     npm run check:pricing
 *
 * Worth re-running whenever the price book or the API contract moves.
 */
import { buildCalcResult, withParityHold, selectionIsPriced } from '../src/lib/price-table'
import { offeredServiceKeys, allInputsOf, inputsKeyFor, isOutOfBand } from '../src/lib/pricing'
import { classifyRow } from '../api/_lib/pricingApi'
import type { PriceTable } from '../src/lib/pricing'
import type { CalcInput } from '../src/lib/costing-calc'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const ok = a === e
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        expected ${e}\n        actual   ${a}`}`)
}

// The spec's worked example: Semi Detached, 3 bed, no extension, no conservatory.
const base: CalcInput = {
  kind: 'semi_detached',
  bedrooms: 3,
  hasExtension: false,
  hasConservatory: false,
  conservatoryRoofPricing: null,
  selectedFrequency: 8,
  addons: {
    gutterClear: false,
    fasciaClean: false,
    conservatoryRoofCleanExternal: false,
  },
}

// Exactly what the API returns for it, per the spec.
const apiTable: PriceTable = {
  cells: {
    ext_window_4weekly: { state: 'priced', price: 24 },
    ext_window_8weekly: { state: 'priced', price: 26 },
    full_gutter_clearance: { state: 'priced', price: 120 },
    fascia_soffit_gutter: { state: 'priced', price: 120 },
  },
  oversized: false,
  source: 'api',
  fetchedAt: '2026-08-18T00:00:00.000Z',
}

console.log('\n--- which rows are OFFERED to the customer ---')
// Not the same question as what we ask the API: the request omits serviceKeys entirely,
// so the whole catalogue always comes back and applicability is read off the answer.
check('a house with no conservatory is offered 4 rows',
  offeredServiceKeys({ kind: 'semi_detached', hasConservatory: false }).length, 4)
check('a conservatory adds the roof row',
  offeredServiceKeys({ kind: 'semi_detached', hasConservatory: true }).length, 5)
check('a townhouse is offered no gutter or fascia row',
  offeredServiceKeys({ kind: 'townhouse', hasConservatory: false }).length, 2)
check('a flat is offered window cleaning only',
  offeredServiceKeys({ kind: 'flat', hasConservatory: false }).length, 2)

console.log('\n--- one inputs object for the whole table ---')
check('the four house inputs travel together',
  allInputsOf(base),
  { house_type: 'Semi Detached', bedrooms: 3, extension: 'No', conservatory: 'No' })
check('a known panel count rides along',
  allInputsOf({
    ...base, hasConservatory: true, conservatoryRoofPricing: { status: 'count', panelCount: 8 },
  }),
  { house_type: 'Semi Detached', bedrooms: 3, extension: 'No', conservatory: 'Yes',
    conservatory_roof_panels: 8 })
check('"not sure" sends no count rather than 0',
  'conservatory_roof_panels' in allInputsOf({
    ...base, hasConservatory: true, conservatoryRoofPricing: { status: 'unknown' },
  }), false)

console.log('\n--- reading a row: order matters ---')
check('oversized wins even with a real-looking price',
  classifyRow({ ok: true, price: 34, serviceKey: 'ext_window_8weekly', oversized: true }),
  { state: 'oversized' })
check('unclassifiable is oversized with an empty missing[]',
  classifyRow({ ok: false, oversized: true, missing: [], reason: 'invalid_house_type' }),
  { state: 'oversized' })
check('missing inputs name what to collect',
  classifyRow({ ok: false, reason: 'missing_inputs', missing: ['extension', 'conservatory'] }),
  { state: 'not_priceable', reason: 'missing_inputs', missing: ['extension', 'conservatory'] })
check('not_applicable is its own state, not a gap to fill',
  classifyRow({ ok: false, reason: 'not_applicable', missing: [] }),
  { state: 'not_applicable' })
check('a priced row carries the field it belongs in',
  classifyRow({ ok: true, price: 24, serviceKey: 'ext_window_4weekly', ghlField: 'contact.4weekly' }),
  { state: 'priced', price: 24, ghlField: 'contact.4weekly' })

console.log('\n--- out of band ---')
check('6 bedrooms is a custom quote', isOutOfBand({ ...base, bedrooms: 6 }), true)
check('5 bedrooms is priceable', isOutOfBand({ ...base, bedrooms: 5 }), false)

console.log('\n--- cache key ignores what does not move a price ---')
check('frequency does not change the key',
  inputsKeyFor({ ...base, selectedFrequency: 4 }) === inputsKeyFor({ ...base, selectedFrequency: 8 }), true)
check('add-ons do not change the key',
  inputsKeyFor({ ...base, addons: { ...base.addons, gutterClear: true } }) === inputsKeyFor(base), true)
check('bedrooms DOES change the key',
  inputsKeyFor({ ...base, bedrooms: 4 }) === inputsKeyFor(base), false)

console.log('\n--- parity hold (nothing held: every offered row is in the live price book) ---')
const held = withParityHold(apiTable, undefined)
check('nothing is withheld by default now',
  held.cells.ext_window_4weekly, { state: 'priced', price: 24 })
check('other rows are untouched', held.cells.ext_window_8weekly, { state: 'priced', price: 26 })

console.log('\n--- CalcResult built from the API table ---')
const withGutters: CalcInput = {
  ...base, selectedFrequency: 8, addons: { ...base.addons, gutterClear: true },
}
const result = buildCalcResult(apiTable, withGutters)
check('schedule carries both frequencies verbatim',
  result.schedule, [
    { label: '4 Weekly', price: 24 },
    { label: '8 Weekly', price: 26 },
  ])
check('basePrice is the selected frequency', result.basePrice, 26)
check('only selected add-ons appear in extras',
  result.extras, [{ label: 'Gutter Clearance', price: 120 }])
check('total sums returned prices (26 + 120)', result.total, 146)
check('selection is priced', selectionIsPriced(apiTable, withGutters), true)

console.log('\n--- a row with no number blocks submission rather than showing a wrong one ---')
const withRoofClean: CalcInput = {
  ...base,
  hasConservatory: true,
  conservatoryRoofPricing: { status: 'count', panelCount: 8 },
  addons: { ...base.addons, conservatoryRoofCleanExternal: true },
}
const unpriced: PriceTable = {
  ...apiTable,
  cells: {
    ...apiTable.cells,
    conservatory_roof_external: { state: 'unavailable', reason: 'timeout' },
  },
}
const unpricedResult = buildCalcResult(unpriced, withRoofClean)
check('an unpriced row renders as on-visit, never as a guess',
  unpricedResult.extras,
  [{ label: 'Conservatory Roof Clean - External', price: 0, pricedOnVisit: true }])
check('an unpriced row contributes 0 to the total', unpricedResult.total, 26)
check('selection is NOT priced, so the form blocks submit',
  selectionIsPriced(unpriced, withRoofClean), false)

console.log('\n--- a not_applicable row is omitted, not offered on-visit ---')
const notApplicable: PriceTable = {
  ...apiTable,
  cells: { ...apiTable.cells, conservatory_roof_external: { state: 'not_applicable' } },
}
const roofInput: CalcInput = {
  ...base,
  hasConservatory: true,
  addons: { ...base.addons, conservatoryRoofCleanExternal: true },
}
check('the line is dropped entirely', buildCalcResult(notApplicable, roofInput).extras, [])
check('and it cannot satisfy a selection',
  selectionIsPriced(notApplicable, roofInput), false)

console.log('\n--- oversized ---')
const oversized: PriceTable = { ...apiTable, oversized: true }
check('oversized never counts as priced', selectionIsPriced(oversized, base), false)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
process.exit(failures === 0 ? 0 : 1)
