/**
 * Turns a `PriceTable` from the pricing API into the `CalcResult` the rest of the app
 * already consumes, so `QuoteStep`, `QuoteStepMobile`, `ghlFieldMap.ts` and the GHL
 * webhooks keep their existing contracts while the numbers change source.
 *
 * Nothing here computes a price. The only arithmetic in this file is *summing prices the
 * API returned* into a first-clean total, which is a different thing from deriving one.
 * The two one-off cleans in particular are never reconstructed from the 8-weekly figure.
 * They are `multiplier_of_service` off it at different multipliers (1.5x external, 2x
 * internal), and — measured live — the external one is front-only discounted while the
 * internal one is not, so on a 3-bed semi with no rear access the 8-weekly reads £14.50
 * while the internal clean is £58. Deriving either would be wrong by a factor of two.
 *
 * Relative imports only — `api/submission.ts` imports this under the Vercel Node runtime.
 */
import {
  FREQUENCIES,
  frequencyLabel,
  planLabel,
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
  serviceKeyForPlan,
  type PriceTable,
  type ServiceKey,
} from './pricing.js'

/**
 * Rows whose API price is known to differ from the price the client's live site shows
 * today, and which have not been signed off yet.
 *
 * Empty, and expected to stay that way: every row this form offers is published in the
 * Pole Position price book that the API itself reads (§5), so there is no second figure
 * for one to disagree with. This client has no local price book anywhere in the repo —
 * deliberately, see the note at the top of `costing-calc.ts`.
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
 * they are called. Four and eight weekly: there is no 6- or 12-weekly service in this
 * catalogue at all, and its key does not exist to be asked for (§4).
 */
const FREQUENCY_ROWS = FREQUENCIES.map((frequency) => ({
  label: frequencyLabel(frequency),
  key: serviceKeyForPlan(frequency),
}))

type Addons = NonNullable<CalcInput['addons']>
type AddonFlag = keyof Addons

/**
 * The add-on checkboxes, paired with the service each one bills, in the order the quote
 * screen lists them.
 *
 * Both conservatory roof cleans are here. `conservatory_roof_internal` is a
 * `multiplier_of_service` of the external row at 1.5x, so it is a DIFFERENT number every
 * time — but it is a separate line on a separate CRM field, so it is a separate
 * selection. Its price is read from its own row, never copied from the external one (§4).
 *
 * `fascia_soffit_clean` is this client's key; `fascia_soffit_gutter` is what the other
 * two contracts on this API call it. Sending the old one returns a `200` carrying
 * `reason: "unknown_service"` rather than a `400`, so the row would simply go unpriced
 * with nothing anywhere saying why (§4).
 */
const ADDON_ROWS: { flag: AddonFlag; key: ServiceKey }[] = [
  /**
   * The inside of the windows, and the row the section leads with — it is the only add-on
   * about the same glass the plan above it cleans. An add-on rather than a plan, which is
   * the API's own classification, and unlike the four below it has no house-type gate, so
   * a flat is offered it too.
   *
   * `ext_window_oneoff` is deliberately NOT here: it is a `WindowPlan`, the third option
   * beside 4- and 8-weekly, not something to tick alongside them. Listing it here as well
   * would let a customer buy a subscription AND a one-off external clean — two charges
   * for one visit, since the subscription's first clean is that same external clean.
   */
  { flag: 'internalWindowClean', key: 'int_window_oneoff' },
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

/** The rows the customer's plan + add-on choices actually put on the bill. */
export function selectedServiceKeys(input: CalcInput): ServiceKey[] {
  const addons = selectedAddonKeys(input)
  // No plan chosen is a real, bookable state — add-ons alone. Returning a window row
  // anyway would make `selectionIsPriced` gate submission on a price nobody asked for.
  if (input.selectedPlan === null) return addons
  return [serviceKeyForPlan(input.selectedPlan), ...addons]
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

  // The plan's own row — the 4-weekly, the 8-weekly or the one-off external clean.
  // `schedule` above stays the two RECURRING rows whatever the plan is, because it is the
  // cycle comparison the screen renders, not a record of what was bought.
  const basePrice =
    input.selectedPlan === null
      ? 0
      : (priceOf(table, serviceKeyForPlan(input.selectedPlan)) ?? 0)
  const extrasTotal = extras.reduce((sum, line) => sum + line.price, 0)

  return {
    schedule,
    extras,
    selectedPlan: input.selectedPlan,
    selectedLabel: input.selectedPlan === null ? '' : planLabel(input.selectedPlan),
    basePrice,
    total: basePrice + extrasTotal,
  }
}
