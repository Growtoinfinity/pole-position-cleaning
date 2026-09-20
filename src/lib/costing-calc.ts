/**
 * The vocabulary of a quote: property kinds, frequencies, service labels and the shape
 * of a priced result.
 *
 * There is deliberately NO price book here and no arithmetic that produces a price.
 * Prices live in the pricing API and nowhere else. A second copy would go stale the
 * first time someone updates the source — and a stale-but-plausible number quoted to a
 * customer is worse than no number, because the business has to honour it or explain
 * itself. When the API cannot price a row the form says so; it does not guess.
 *
 * Everything here is derived from `docs/pricing_api_poleposition.md`, which is the
 * single source of truth for this client. Where this file and that document disagree,
 * the document is right.
 *
 * Uses relative imports only (no `@/` alias) so the `api/` routes can import it under
 * the Vercel Node runtime.
 */

/**
 * The house-type rows the price tables carry.
 *
 * A flat is a row like any other here — it is banded on BEDROOMS, exactly as a house is,
 * and is never asked which floor it is on. That is the client's own rule, recorded in
 * their config's `flat_banding: "bedrooms"`, and it is why this file has no floor
 * vocabulary at all (§6).
 *
 * There is no Bungalow row in any table, and — unlike every sibling contract on this
 * API — **no `Town house` row either**. Both are resolved to one of the three base types
 * by the form before a `HouseKind` exists. A townhouse sent as "Town house" is not folded
 * to Terraced the way Kings and We Wash Everything fold it: the engine finds no row and
 * refuses with `house_type_not_in_table`, which is a dead quote rather than a wrong price
 * (§3). Keeping the value out of this union is what stops that reaching the API at all.
 */
export type HouseKind = 'terraced' | 'semi_detached' | 'detached' | 'flat'

/**
 * The two recurring window-cleaning cycles this client sells.
 *
 * Four and eight weekly — not the six and twelve of other contracts on this API. There is
 * no 6- or 12-weekly service in this catalogue at all, and sending one of those keys
 * returns a `200` carrying `reason: "unknown_service"` rather than a `400`, so the
 * mistake is silent (§3).
 */
export type Frequency = 4 | 8

export const FREQUENCIES: Frequency[] = [4, 8]

/**
 * The customer-facing name of a recurring cycle.
 *
 * "Every 4 Weekly Clean", not "4 Weekly": on its own, "4 Weekly" reads as a quantity
 * rather than a schedule, and beside a card labelled "One-off" the contrast that matters
 * is repeats-vs-once.
 *
 * NOT the CRM picklist wording. `contact.booked_services` takes "4 weekly external window
 * cleaning" exactly, and GHL drops a checkbox value that is not a byte-exact option — so
 * `CHECKLIST` in ghlFieldMap.ts owns those strings and this function must never be used
 * to build one. `scripts/pricing-check.ts` pins this against `LABEL_BY_SERVICE_KEY`, which
 * is the other place the same words appear.
 */
export function frequencyLabel(frequency: Frequency): string {
  return `Every ${frequency} Weekly Clean`
}

/**
 * The third way to buy an external window clean: once, with no cycle behind it.
 *
 * Deliberately NOT a member of `Frequency`. `Frequency` means "a recurring cycle", and
 * several things downstream are only correct because of that — `recurringValue` multiplies
 * by 52/frequency to reach an annual figure, and `contact.regular_price` names a price
 * that repeats. Widening `Frequency` to carry a one-off would make both of those silently
 * wrong for a job that happens exactly once, and nothing would flag it.
 *
 * So the union lives one level up, in `WindowPlan`, and the compiler forces every consumer
 * to say which of the two it actually means.
 */
export const ONE_OFF_PLAN = 'oneoff' as const

/** What the customer picked from the external-window-cleaning choice: a cycle, or one clean. */
export type WindowPlan = Frequency | typeof ONE_OFF_PLAN

/** The three cards the quote screen offers, in the order it offers them. */
export const WINDOW_PLANS: WindowPlan[] = [...FREQUENCIES, ONE_OFF_PLAN]

/**
 * Narrows a plan to a recurring cycle. Use this before any per-year or per-month figure —
 * a one-off has no cycle to divide 52 by.
 */
export function isRecurringPlan(plan: WindowPlan | null | undefined): plan is Frequency {
  return plan === 4 || plan === 8
}

/**
 * The card label — the service's full name, the same one the breakdown and the CRM line
 * use (`EXT_WINDOW_ONEOFF_LABEL`).
 *
 * It was "One-off" until 2026-09-20, which was shorter than its two neighbours but left
 * the card saying only how often, never what. Beside "Every 4 Weekly Clean" that reads as
 * a one-off of the same thing the cycles clean — which happens to be true here, and would
 * quietly stop being true the day a second one-off service joins the set. The length is
 * carried by `text-balance` on the card and by the description under it.
 */
export function planLabel(plan: WindowPlan): string {
  return plan === ONE_OFF_PLAN ? EXT_WINDOW_ONEOFF_LABEL : frequencyLabel(plan)
}

/**
 * Service labels, copied from the `serviceLabel` strings the API returns (§4).
 *
 * These are NOT the `booked_service_option` picklist strings the CRM checkbox takes —
 * those live in `CHECKLIST` in `api/_lib/ghlFieldMap.ts` and are different text. Mixing
 * the two is silent: GHL drops a checkbox value that is not an exact option.
 */
export const EXT_CONSERVATORY_ROOF_LABEL = 'Conservatory roof clean (external)'
export const INT_CONSERVATORY_ROOF_LABEL = 'Conservatory roof clean (internal)'
export const GUTTER_CLEARANCE_LABEL = 'Gutter clearance'
/** `fascia_soffit_clean` here, not the `fascia_soffit_gutter` other contracts use (§4). */
export const FASCIA_SOFFIT_LABEL = 'Fascia and soffit clean'
export const EXT_WINDOW_ONEOFF_LABEL = 'One-off external window clean'
export const INT_WINDOW_ONEOFF_LABEL = 'Internal window clean'

/**
 * Gutter clearance, fascia/soffit and both conservatory roof cleans have no `Flat` row
 * in their tables, and a flat is not classifiable under the `standard` normalisation
 * those four services use. The API answers them `not_applicable` for a flat, permanently
 * — no input the customer can supply will ever price them (§6).
 *
 * Every house type IS priced for them. A townhouse reaches here already resolved to one
 * of the three base types, because this client has no `Town house` row (§3).
 */
export function supportsAncillaryServices(kind: HouseKind): boolean {
  return kind !== 'flat'
}

/**
 * Whether the four surcharges can move THIS property's price.
 *
 * The five `Flat` cells of both window tables carry no `add` object at all, so every
 * surcharge is 0 for a flat whatever the customer answers (§6).
 *
 * This is NOT a decision about what to ask. The questions are asked of every property,
 * flat included, because `requiredInputs` is global: omit `loft` or `velux` and a flat is
 * refused exactly as a house is (§3). This gates which SERVICES are offered — a flat is
 * never shown a conservatory roof clean — not which questions are put.
 */
export function supportsUplifts(kind: HouseKind): boolean {
  return kind !== 'flat'
}

/**
 * Everything the pricing API needs to know about the property.
 *
 * This client declares SEVEN `requiredInputs`, and six of them are all-or-nothing:
 * `house_type`, `bedrooms`, `extension`, `conservatory`, `loft`, `velux`. Miss any one
 * and EVERY row answers `missing_inputs` — including rows whose own table carries no
 * surcharge for it at all, because `requiredInputs` is global rather than per service.
 * A form that collects five of the six prices nothing (§3).
 *
 * `hasVelux` is a BOOLEAN here, not a count. This client charges once for the property
 * and never asks the customer to count their windows; there is no `number_of_velux`
 * input, no `floor_level` and no `conservatory_roof_panels` (§3).
 *
 * `hasOutdoorAccess` is the seventh and behaves unlike the others: it is not a surcharge,
 * and it is the one input that is SAFE to omit — an unanswered access question prices at
 * the full rate rather than refusing. That is the safe direction, and it is also why a
 * form that forgets the field silently never offers the front-only price to anyone (§7c).
 */
export type CalcInput = {
  kind: HouseKind
  /** Every property, flats included — a flat bands on bedrooms like a house. */
  bedrooms?: number
  hasExtension?: boolean
  hasConservatory?: boolean
  hasLoftConversion?: boolean
  /** A yes/no gate, not a count — this client charges once per property. */
  hasVelux?: boolean
  /**
   * False means the cleaner cannot get round the back without the customer being home.
   * The three external window services are then priced `max(0.5 x full, 14.00)`;
   * everything else keeps its full price. Undefined means unanswered, which never
   * discounts (§7c).
   */
  hasOutdoorAccess?: boolean
  /**
   * A cycle, a single clean, or NOTHING — a customer may buy add-ons alone.
   *
   * Nullable on purpose. It used to be required, so the add-ons-only case was passed a
   * `?? 4` fallback at each call site and the stored quote came back carrying a
   * `basePrice`, a `total` and a `selectedLabel` for a 4-weekly round the customer never
   * picked. Null says "none chosen" once, here, instead of every caller inventing one.
   */
  selectedPlan: WindowPlan | null
  addons?: {
    conservatoryRoofCleanExternal?: boolean
    conservatoryRoofCleanInternal?: boolean
    gutterClear?: boolean
    fasciaClean?: boolean
    /**
     * `int_window_oneoff` — cleaning the inside of the windows.
     *
     * A genuine add-on rather than an alternative plan, which is the API's own
     * classification (`category: "addon"`, against `"window_cleaning"` for the external
     * one-off), and it is why this is a flag while the external one-off is a `WindowPlan`.
     * Someone on a 4-weekly external round can sensibly want their insides done once.
     *
     * Priced at 2x the FULL 8-weekly rate. Never derive it from the 8-weekly price on
     * screen: when `outdoor_access` is "no" that figure is front-only discounted and this
     * one is not, so deriving would halve it (measured live — £58 against a £14.50
     * 8-weekly on the same 3-bed semi).
     */
    internalWindowClean?: boolean
    /**
     * Pressure washing — a quote request, not a purchase.
     *
     * Deliberately alongside the priced add-ons rather than in a structure of its own,
     * because to the customer it is the same gesture: another box on the same screen. It
     * differs only in what it produces, and every consumer that sums money must therefore
     * skip it — it has no price to contribute and never will (`QUOTE_REQUEST_SERVICE`).
     */
    pressureWashing?: boolean
  }
}

export type CalcExtraLine = {
  label: string
  price: number
}

/**
 * A quote, assembled from prices the API returned. Built by `buildCalcResult` in
 * `price-table.ts` — never computed from a local book.
 */
export type CalcResult = {
  /** The two RECURRING rows, always both, so the screen can show the cycle comparison. */
  schedule: { label: string; price: number }[]
  extras: CalcExtraLine[]
  selectedPlan: WindowPlan | null
  /** '' when no plan was chosen — never the name of one that was not. */
  selectedLabel: string
  basePrice: number
  total: number
}

/** A quote with no prices in it — what an unavailable pricing API produces. */
export function emptyResult(selectedPlan: WindowPlan | null): CalcResult {
  return {
    schedule: FREQUENCIES.map((f) => ({ label: frequencyLabel(f), price: 0 })),
    extras: [],
    selectedPlan,
    selectedLabel: selectedPlan === null ? '' : planLabel(selectedPlan),
    basePrice: 0,
    total: 0,
  }
}
