/**
 * Turns a `PriceTable` from the pricing API into the `CalcResult` the rest of the app
 * already consumes, so `QuoteStep`, `QuoteStepMobile`, `ghlFieldMap.ts` and the GHL
 * webhooks keep their existing contracts while the numbers change source.
 *
 * Nothing here computes a price. The only arithmetic in this file is *summing prices the
 * API returned* into a first-clean total, which is a different thing from deriving one.
 * In particular the two one-off cleans are never reconstructed from the 6-weekly figure:
 * the API doubles the surcharges along with the base, so a one-off is 2 x (base + ext +
 * cons), not 2 x base + ext + cons (§4, §5).
 *
 * Relative imports only — `api/submission.ts` imports this under the Vercel Node runtime.
 */
import {
  FREQUENCIES,
  frequencyLabel,
  type CalcExtraLine,
  type CalcInput,
  type CalcResult,
} from './costing-calc.js'
import {
  cellOf,
  isSelectableCell,
  LABEL_BY_SERVICE_KEY,
  offeredServiceKeys,
  priceOf,
  serviceKeyForFrequency,
  type PriceTable,
  type ServiceKey,
} from './pricing.js'

/**
 * Rows whose API price is known to differ from the price the client's live site shows
 * today, and which have not been signed off yet.
 *
 * Empty, and expected to stay that way: every row this form offers is published in the
 * We Wash Everything price book that the API itself reads (§5), so there is no second
 * figure for one to disagree with. This client has no local price book anywhere in the
 * repo — deliberately, see the note at the top of `costing-calc.ts`.
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

/**
 * The two recurring rows, in the order both quote screens print them.
 *
 * Derived from `FREQUENCIES` rather than written out, so this and the placeholder
 * schedule `emptyResult` builds can never disagree about how many rows there are or what
 * they are called. Six and twelve weekly: there is no 8-weekly service in this
 * catalogue at all, and its key does not exist to be asked for (§4).
 */
const FREQUENCY_ROWS = FREQUENCIES.map((frequency) => ({
  label: frequencyLabel(frequency),
  key: serviceKeyForFrequency(frequency),
}))

type Addons = NonNullable<CalcInput['addons']>
type AddonFlag = keyof Addons

/**
 * The add-on checkboxes, paired with the service each one bills, in the order the quote
 * screen lists them.
 *
 * Both conservatory roof cleans are here. `conservatory_roof_internal` is a
 * `same_as_service` of the external row and comes back as exactly the same number every
 * time — but it is a separate line on a separate CRM field, so it is a separate
 * selection. Its price is read from its own row, never copied from the external one (§4).
 *
 * `fascia_soffit_clean` is this client's key; `fascia_soffit_gutter` is what the other
 * two contracts on this API call it. Sending the old one returns a `200` carrying
 * `reason: "unknown_service"` rather than a `400`, so the row would simply go unpriced
 * with nothing anywhere saying why (§4).
 */
const ADDON_ROWS: { flag: AddonFlag; key: ServiceKey }[] = [
  { flag: 'gutterClear', key: 'full_gutter_clearance' },
  { flag: 'fasciaClean', key: 'fascia_soffit_clean' },
  { flag: 'conservatoryRoofCleanExternal', key: 'conservatory_roof_external' },
  { flag: 'conservatoryRoofCleanInternal', key: 'conservatory_roof_internal' },
]

/**
 * The add-on rows this property actually puts on the bill: ticked, and offered to it.
 *
 * The "offered" half is not belt and braces. A customer who ticks gutter clearance on a
 * semi, then goes back and changes the property to a flat, leaves a tick behind for a
 * service that flat can never buy — four of its eight rows are permanently
 * `not_applicable` (§8) — and the same happens to both roof rows when a conservatory
 * answer flips back to no (§9b). Billing a row the screen no longer renders would
 * disable a submit button with nothing on the page to click to fix it.
 *
 * `offeredServiceKeys` is the same gate the quote screen draws from, so what is billed
 * and what is shown cannot drift apart.
 */
function selectedAddonKeys(input: CalcInput): ServiceKey[] {
  const addons: Addons = input.addons ?? {}
  const offered = new Set(offeredServiceKeys(input))

  return ADDON_ROWS.filter(({ flag, key }) => addons[flag] === true && offered.has(key)).map(
    ({ key }) => key,
  )
}

/** The rows the customer's frequency + add-on choices actually put on the bill. */
export function selectedServiceKeys(input: CalcInput): ServiceKey[] {
  return [serviceKeyForFrequency(input.selectedFrequency), ...selectedAddonKeys(input)]
}

/**
 * True when every row the customer actually selected carries a real price — the gate on
 * submitting a quote, and on trusting the totals below.
 *
 * `oversized` is tested first and before anything else looks at a price, because an
 * over-band property answers `ok: true` with a real-looking figure that is simply the
 * five-bedroom rate; the flag is the only thing that says so (§9).
 *
 * After that a row qualifies only if it is `priced`. There is no "confirm it on the
 * visit" state left to accept: that existed for a customer who could not count their
 * conservatory roof panels, and this client prices roof cleaning from a house x bedroom
 * table with no panel count anywhere in it (§4).
 */
export function selectionIsPriced(table: PriceTable | null, input: CalcInput): boolean {
  if (!table || table.oversized) return false

  return selectedServiceKeys(input).every((key) => isSelectableCell(cellOf(table, key)))
}

/**
 * Builds the `CalcResult`.
 *
 * Every number here comes straight from the table — nothing is rounded, adjusted or
 * re-derived, which is the whole point of the migration.
 *
 * A row with no price contributes nothing to the total rather than a zero: a missing
 * price must never read as "free". The `?? 0` on the schedule and base rows is a
 * placeholder, not a price — callers gate on `selectionIsPriced` before showing a total,
 * and the screens render each slot through `usePriceDisplay` rather than printing these
 * numbers raw.
 */
export function buildCalcResult(table: PriceTable, input: CalcInput): CalcResult {
  const schedule = FREQUENCY_ROWS.map(({ label, key }) => ({
    label,
    price: priceOf(table, key) ?? 0,
  }))

  const extras: CalcExtraLine[] = []
  for (const key of selectedAddonKeys(input)) {
    const cell = cellOf(table, key)
    // Not priced is not a line. `not_applicable` will never carry a number, whether it is
    // the structural kind or this turn's (§8, §9b); `not_priceable`, `unavailable` and
    // `oversized` carry none today. None of the five is something to promise on the
    // visit — every add-on in this catalogue is priced from a house x bedroom table, so
    // there is nothing left to measure at the property (§5).
    if (cell.state !== 'priced') continue
    extras.push({ label: LABEL_BY_SERVICE_KEY[key], price: cell.price })
  }

  const basePrice = priceOf(table, serviceKeyForFrequency(input.selectedFrequency)) ?? 0
  const extrasTotal = extras.reduce((sum, line) => sum + line.price, 0)

  return {
    schedule,
    extras,
    selectedFrequency: input.selectedFrequency,
    selectedLabel: frequencyLabel(input.selectedFrequency),
    basePrice,
    total: basePrice + extrasTotal,
  }
}
