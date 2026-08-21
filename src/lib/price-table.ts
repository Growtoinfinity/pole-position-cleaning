/**
 * Turns a `PriceTable` from the pricing API into the `CalcResult` the rest of the app
 * already consumes, so `QuoteStep`, `QuoteStepMobile`, `ghlFieldMap.ts` and the GHL
 * webhooks keep their existing contracts while the numbers change source.
 *
 * Relative imports only — `api/submission.ts` imports this under the Vercel Node runtime.
 */
import {
  frequencyLabel,
  supportsAncillaryServices,
  type CalcExtraLine,
  type CalcInput,
  type CalcResult,
} from './costing-calc.js'
import {
  cellOf,
  LABEL_BY_SERVICE_KEY,
  priceOf,
  serviceKeyForFrequency,
  type PriceTable,
  type ServiceKey,
} from './pricing.js'

/**
 * Rows whose API price is known to differ from the price the live site shows today, and
 * which have not been signed off yet.
 *
 * Empty as of the updated spec: every row the form still offers is published in the
 * Greenmaster live price book, so there is nothing left holding. Where the old site's
 * figure differed it came from its own `2 × the 8-weekly price` rule, which is exactly
 * the local arithmetic this migration exists to retire — the API is the single source of
 * truth, so its number stands.
 *
 * The mechanism is kept because the next price-book change will want it: add a key here
 * to render that row "price on request" instead of letting a number move under a
 * customer, and clear it (or set `PRICING_PARITY_APPROVED=all`) once signed off.
 */
export const PARITY_UNRESOLVED: ServiceKey[] = []

/** Applies the parity hold. `approved` comes from `PRICING_PARITY_APPROVED`. */
export function withParityHold(table: PriceTable, approved: string | undefined): PriceTable {
  if (approved === 'all') return table

  const signedOff = new Set((approved ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  const held = PARITY_UNRESOLVED.filter((key) => !signedOff.has(key))
  if (!held.length) return table

  const cells = { ...table.cells }
  for (const key of held) {
    if (cells[key]?.state === 'priced') {
      cells[key] = { state: 'not_priceable', reason: 'parity_unresolved', missing: [] }
    }
  }
  return { ...table, cells }
}

const FREQUENCY_ROWS: { label: string; key: ServiceKey }[] = [
  { label: frequencyLabel(4), key: 'ext_window_4weekly' },
  { label: frequencyLabel(8), key: 'ext_window_8weekly' },
]

/**
 * True when every row the customer actually selected carries a real price — the gate on
 * submitting a quote, and on trusting the totals below.
 */
export function selectionIsPriced(table: PriceTable | null, input: CalcInput): boolean {
  if (!table || table.oversized) return false

  const selected = selectedServiceKeys(input)
  return selected.every((key) => {
    const cell = cellOf(table, key)
    // `not_applicable` cannot be satisfied by anything the customer does, so a selection
    // resting on one is not priceable — the row should not have been offered at all.
    return cell.state === 'priced' || cell.state === 'on_visit'
  })
}

/** The rows the customer's frequency + add-on choices actually put on the bill. */
export function selectedServiceKeys(input: CalcInput): ServiceKey[] {
  const keys: ServiceKey[] = [serviceKeyForFrequency(input.selectedFrequency)]
  const addons = input.addons ?? {}

  // Gutter and fascia exist for three house types only; a townhouse or flat is never
  // offered them, so a stale selection must not put an unpriceable row on the bill.
  if (supportsAncillaryServices(input.kind)) {
    if (addons.gutterClear) keys.push('full_gutter_clearance')
    if (addons.fasciaClean) keys.push('fascia_soffit_gutter')
  }
  // The roof add-on is only offered when the property has a conservatory.
  if (input.hasConservatory && addons.conservatoryRoofCleanExternal) {
    keys.push('conservatory_roof_external')
  }

  return keys
}

/**
 * Builds the `CalcResult`.
 *
 * Every number here comes straight from the table — nothing is rounded, adjusted or
 * re-derived, which is the whole point of the migration. The one arithmetic this does
 * perform is *summing distinct returned prices* into a first-clean total, which is a
 * different thing from recomputing one.
 *
 * A row with no price contributes nothing to the total rather than a zero: a missing
 * price must never read as "free". Callers gate on `selectionIsPriced` before showing
 * a total at all.
 */
export function buildCalcResult(table: PriceTable, input: CalcInput): CalcResult {
  const schedule = FREQUENCY_ROWS.map(({ label, key }) => ({
    label,
    price: priceOf(table, key) ?? 0,
  }))

  const extras: CalcExtraLine[] = []
  const addons = input.addons ?? {}

  const pushExtra = (selected: boolean | undefined, key: ServiceKey) => {
    if (!selected) return
    const cell = cellOf(table, key)
    const label = LABEL_BY_SERVICE_KEY[key]

    if (cell.state === 'priced') {
      extras.push({ label, price: cell.price })
      return
    }
    // The service does not apply to this property — omit the line rather than promising
    // to confirm a price on a visit for something that will never be quoted.
    if (cell.state === 'not_applicable') return
    // "I'm not sure how many panels" — and anything else without a number — is shown
    // as confirmed on visit rather than as £0.
    extras.push({ label, price: 0, pricedOnVisit: true })
  }

  if (supportsAncillaryServices(input.kind)) {
    pushExtra(addons.gutterClear, 'full_gutter_clearance')
    pushExtra(addons.fasciaClean, 'fascia_soffit_gutter')
  }
  if (input.hasConservatory) {
    pushExtra(addons.conservatoryRoofCleanExternal, 'conservatory_roof_external')
  }

  const selectedKey = serviceKeyForFrequency(input.selectedFrequency)
  const basePrice = priceOf(table, selectedKey) ?? 0
  const selectedLabel = frequencyLabel(input.selectedFrequency)

  const extrasCashTotal = extras.reduce(
    (sum, line) => sum + (line.pricedOnVisit ? 0 : line.price),
    0,
  )

  return {
    schedule,
    extras,
    selectedFrequency: input.selectedFrequency,
    selectedLabel,
    basePrice,
    total: basePrice + extrasCashTotal,
  }
}
