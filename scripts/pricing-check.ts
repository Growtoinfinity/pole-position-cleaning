/**
 * Checks the pricing logic against the worked example in the v3 bot spec.
 *
 * No test runner in this project, so this is a plain script:
 *
 *     npm run check:pricing
 *
 * Worth re-running whenever the price book or the API contract moves — in particular
 * when Q3 in `docs/pricing-api-integration.md` is answered and `PARITY_UNRESOLVED`
 * is cleared.
 */
import { buildCalcResult, withParityHold, selectionIsPriced } from '../src/lib/price-table'
import { selectServiceKeys, inputsFor, inputsKeyFor, isOutOfBand } from '../src/lib/pricing'
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
    conservatoryRoofCleanInternal: false,
    adHocInternalClean: false,
  },
}

// Exactly what the API returns for it, per the spec.
const apiTable: PriceTable = {
  cells: {
    ext_window_6weekly: { state: 'priced', price: 24 },
    ext_window_8weekly: { state: 'priced', price: 26 },
    ext_window_12weekly: { state: 'priced', price: 32 },
    ext_window_oneoff: { state: 'priced', price: 50 },
    int_window_oneoff: { state: 'priced', price: 48 },
    full_gutter_clearance: { state: 'priced', price: 120 },
    fascia_soffit_gutter: { state: 'priced', price: 120 },
  },
  oversized: false,
  killSwitch: false,
  source: 'api',
  fetchedAt: '2026-08-18T00:00:00.000Z',
}

console.log('\n--- service selection ---')
check('no conservatory => 7 rows, no roof', selectServiceKeys(base).length, 7)
check('with panel count => 9 rows', selectServiceKeys({
  ...base, hasConservatory: true, conservatoryRoofPricing: { status: 'count', panelCount: 8 },
}).length, 9)
check('conservatory but "not sure" => 7 rows', selectServiceKeys({
  ...base, hasConservatory: true, conservatoryRoofPricing: { status: 'unknown' },
}).length, 7)

console.log('\n--- inputs are scoped per service ---')
check('window row gets the 4 house inputs',
  inputsFor('ext_window_6weekly', base),
  { house_type: 'Semi Detached', bedrooms: 3, extension: 'No', conservatory: 'No' })
check('gutters ALSO get all 4 house inputs',
  Object.keys(inputsFor('full_gutter_clearance', base) ?? {}).sort(),
  ['bedrooms', 'conservatory', 'extension', 'house_type'])
check('roof row gets ONLY the panel count',
  inputsFor('conservatory_roof_external', {
    ...base, hasConservatory: true, conservatoryRoofPricing: { status: 'count', panelCount: 8 },
  }),
  { conservatory_roof_panels: 8 })
check('roof row with no count is never sent upstream',
  inputsFor('conservatory_roof_external', {
    ...base, hasConservatory: true, conservatoryRoofPricing: { status: 'unknown' },
  }), null)

console.log('\n--- out of band ---')
check('6 bedrooms is a custom quote', isOutOfBand({ ...base, bedrooms: 6 }), true)
check('5 bedrooms is priceable', isOutOfBand({ ...base, bedrooms: 5 }), false)

console.log('\n--- cache key ignores what does not move a price ---')
check('frequency does not change the key',
  inputsKeyFor({ ...base, selectedFrequency: 6 }) === inputsKeyFor({ ...base, selectedFrequency: 12 }), true)
check('add-ons do not change the key',
  inputsKeyFor({ ...base, addons: { ...base.addons, gutterClear: true } }) === inputsKeyFor(base), true)
check('bedrooms DOES change the key',
  inputsKeyFor({ ...base, bedrooms: 4 }) === inputsKeyFor(base), false)

console.log('\n--- parity hold (Q3: 48 vs 52) ---')
const held = withParityHold(apiTable, undefined)
check('int_window_oneoff is withheld by default',
  held.cells.int_window_oneoff, { state: 'not_priceable', reason: 'parity_unresolved', missing: [] })
check('other rows are untouched', held.cells.ext_window_8weekly, { state: 'priced', price: 26 })
check('approving it releases the price',
  withParityHold(apiTable, 'all').cells.int_window_oneoff, { state: 'priced', price: 48 })

console.log('\n--- CalcResult built from the API table ---')
const withGutters: CalcInput = {
  ...base, selectedFrequency: 8, addons: { ...base.addons, gutterClear: true },
}
const result = buildCalcResult(apiTable, withGutters)
check('schedule carries all four frequencies verbatim',
  result.schedule, [
    { label: '6-weekly', price: 24 },
    { label: '8-weekly', price: 26 },
    { label: '12-weekly', price: 32 },
    { label: 'One-off', price: 50 },
  ])
check('basePrice is the selected frequency', result.basePrice, 26)
check('only selected add-ons appear in extras',
  result.extras, [{ label: 'Ad Hoc Gutter Clearance', price: 120 }])
check('total sums returned prices (26 + 120)', result.total, 146)
check('selection is priced', selectionIsPriced(apiTable, withGutters), true)

console.log('\n--- a withheld row blocks submission rather than showing a wrong number ---')
const withInternal: CalcInput = {
  ...base, addons: { ...base.addons, adHocInternalClean: true },
}
const heldResult = buildCalcResult(held, withInternal)
check('withheld row renders as on-visit, never as 52',
  heldResult.extras, [{ label: 'Ad Hoc Internal Window Clean', price: 0, pricedOnVisit: true }])
check('withheld row contributes 0 to the total, not 52', heldResult.total, 26)
check('selection is NOT priced, so the form blocks submit',
  selectionIsPriced(held, withInternal), false)

console.log('\n--- oversized ---')
const oversized: PriceTable = { ...apiTable, oversized: true }
check('oversized never counts as priced', selectionIsPriced(oversized, base), false)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
process.exit(failures === 0 ? 0 : 1)
