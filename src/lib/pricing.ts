/**
 * Vocabulary shared by the browser, the `api/` routes and the v3 bot pricing API.
 *
 * Uses relative imports only (no `@/` alias) so `api/pricing.ts` and
 * `api/submission.ts` can import it under the Vercel Node runtime, the same way
 * they already import `costing-calc` and `form-steps`.
 *
 * `docs/pricing_api_poleposition.md` is the single source of truth for every name,
 * rule and branch in this file. Section references below point into it.
 */
import {
  EXT_CONSERVATORY_ROOF_LABEL,
  EXT_WINDOW_ONEOFF_LABEL,
  FASCIA_SOFFIT_LABEL,
  GUTTER_CLEARANCE_LABEL,
  INT_CONSERVATORY_ROOF_LABEL,
  INT_WINDOW_ONEOFF_LABEL,
  ONE_OFF_PLAN,
  supportsAncillaryServices,
  supportsUplifts,
  type CalcInput,
  type HouseKind,
  type WindowPlan,
} from './costing-calc.js'

/**
 * The eight services this client's catalogue holds (§4).
 *
 * Read them from `GET /api/v1/pricing/config` rather than trusting this list where you
 * can; it is reproduced here so the form has something to typecheck against and so a
 * response row can be matched by key.
 *
 * Two names are traps for anyone who has integrated another contract on this API:
 * `fascia_soffit_clean` is `fascia_soffit_gutter` elsewhere, and there is no
 * `ext_window_4weekly` or `ext_window_8weekly` at all. Sending an old key returns a
 * `200` carrying `reason: "unknown_service"` — never a `400` — so the mistake is silent.
 */
export type ServiceKey =
  | 'ext_window_4weekly'
  | 'ext_window_8weekly'
  | 'ext_window_oneoff'
  | 'int_window_oneoff'
  | 'fascia_soffit_clean'
  | 'full_gutter_clearance'
  | 'conservatory_roof_external'
  | 'conservatory_roof_internal'

export const SERVICE_KEYS: ServiceKey[] = [
  'ext_window_4weekly',
  'ext_window_8weekly',
  'ext_window_oneoff',
  'int_window_oneoff',
  'fascia_soffit_clean',
  'full_gutter_clearance',
  'conservatory_roof_external',
  'conservatory_roof_internal',
]

/**
 * `pressure_washing` is the ninth catalogue entry and is deliberately NOT a `ServiceKey`.
 *
 * It carries `quote_request_only: true`, has no price and never will, and is not in
 * `pricing.services` at all — send it and the row comes back `unknown_service`, which
 * reads like a bug and is not. The request omits `serviceKeys` entirely, which prices the
 * eight and never mentions the ninth (§3).
 *
 * Keeping it out of `ServiceKey` is what stops it reaching the pricing call, and the
 * compiler enforces that: every price lookup, every GHL price field and every "is this
 * row priced" check is keyed by `ServiceKey`, so there is no way to ask this one for a
 * number. It is sold through `QUOTE_REQUEST_SERVICE` below instead.
 */

/**
 * The one service this form offers that it quotes by hand.
 *
 * A customer can select it, and selecting it does not produce a price — it produces a
 * quote request. That is a different OUTCOME, not a failed price: a form that picked
 * nothing but this has still been completed and still moves the pipeline, but to
 * "Quote Requested" rather than "Booked", because there is no number to book at.
 *
 * All three strings are read from the live `serviceCatalog` rather than invented, and
 * `option` is the one that has to be exact: `contact.quote_requested` is a CHECKBOX whose
 * only option is "Pressure Washing", and GHL drops a checkbox value that is not an exact
 * option as silently as it drops an unknown field id.
 */
export const QUOTE_REQUEST_SERVICE = {
  key: 'pressure_washing',
  /** `serviceCatalog[].label` — what the quote screen calls it. */
  label: 'Pressure washing',
  /** `serviceCatalog[].quote_request_option`, byte-exact against the live picklist. */
  option: 'Pressure Washing',
} as const

/** The two recurring window rows — the frequency choice itself. */
export const WINDOW_KEYS: ServiceKey[] = ['ext_window_4weekly', 'ext_window_8weekly']

/**
 * The two one-off window cleans.
 *
 * Both are `multiplier_of_service` off the **8-weekly** row with surcharges included, but
 * at DIFFERENT multipliers — 1.5x external, 2x internal — so unlike some sibling
 * contracts they are not the same number as each other. The engine rounds nothing, so
 * 1.5 x an odd base is an ordinary half-pound result (£43.50). Read `price`; never
 * re-derive either from the 8-weekly figure (§3, §4).
 */
export const ONEOFF_KEYS: ServiceKey[] = ['ext_window_oneoff', 'int_window_oneoff']

/** No `Flat` row in either table, so houses only — townhouse included (§5, §8). */
export const ANCILLARY_KEYS: ServiceKey[] = ['fascia_soffit_clean', 'full_gutter_clearance']

/**
 * Both conservatory roof cleans.
 *
 * `conservatory_roof_internal` is a `multiplier_of_service` of the external one at 1.5x
 * — NOT `same_as_service`, which is a sibling contract's shape — so the two are
 * different numbers. The external table carries no `add` object on any of its cells, so
 * no surcharge ever reaches either price (§3, §7a).
 *
 * Priced from a house x bedroom table here. There is no per-panel service anywhere in
 * this catalogue, which is why the form never asks for a panel count.
 */
export const ROOF_KEYS: ServiceKey[] = [
  'conservatory_roof_external',
  'conservatory_roof_internal',
]

export function isServiceKey(value: unknown): value is ServiceKey {
  return typeof value === 'string' && (SERVICE_KEYS as string[]).includes(value)
}

// ─────────────────────────── the four logical inputs ───────────────────────────

/**
 * What the API takes. Logical names only — GHL field paths are the server's business,
 * never ours.
 *
 * SEVEN inputs, and `requiredInputs` is GLOBAL rather than per service: omit any one of
 * the six gates and EVERY row answers `missing_inputs`, including rows whose own table
 * carries no surcharge for it. A form that collects five of six prices nothing (§3).
 *
 * Notably absent, and absent on purpose:
 *
 * - `number_of_velux`. Velux is a yes/no gate here — this client charges once for the
 *   property and never asks the customer to count. The CRM field of that name exists in
 *   the location as a sub-account-clone leftover, is not in `field_mapping`, and nothing
 *   reads it (§3).
 * - `floor_level`. This client bands a flat on bedrooms exactly as it bands a house
 *   (`flat_banding: "bedrooms"`), and never asks a flat its floor (§6).
 * - `conservatory_roof_panels`. The roofs price from the house x bedroom table; no
 *   `unit_rate` service exists in this config (§3).
 *
 * Verified against `GET /config` on 2026-09-19, which lists `requiredInputs` as
 * `["house_type","bedrooms","extension","conservatory","loft","velux","outdoor_access"]`.
 * Read it from `GET /config` rather than trusting any document, this one included.
 */
export type PricingInputs = {
  house_type?: string
  bedrooms?: number
  extension?: 'Yes' | 'No'
  conservatory?: 'Yes' | 'No'
  loft?: 'Yes' | 'No'
  /**
   * A yes/no GATE, not a count. This client charges once for the property and never asks
   * the customer to count their windows — there is no `number_of_velux` input here, and
   * the CRM field of that name is a leftover from the sub-account clone that nothing
   * reads (§3).
   *
   * It moves the two window tables only; gutter and fascia carry no `velux` key and the
   * conservatory roof table has no `add` object at all. It is still REQUIRED on every
   * row, because `requiredInputs` is global (§3).
   */
  velux?: 'Yes' | 'No'
  /**
   * LOWERCASE, unlike the four Yes/No gates above — the API takes `"yes"` / `"no"` here.
   *
   * Not a surcharge. `"no"` triggers front-only pricing: `max(0.5 x full, 14.00)` on the
   * three external window services, full price on everything else (§7c).
   *
   * The one input that is safe to omit — unanswered prices at the full rate rather than
   * refusing. Safe by default, and the reason a form that forgets it silently never
   * offers the front-only price to anyone.
   */
  outdoor_access?: 'yes' | 'no'
}

/**
 * `HouseKind` → `house_type`.
 *
 * Matching on the API side is a case-insensitive substring test on the trimmed string,
 * not an enum (§4b), so these strings are generous rather than exact. They are written
 * as the table's own row names anyway, because a value that matches by luck is a value
 * that stops matching when someone tidies it.
 */
export const HOUSE_TYPE_BY_KIND: Record<HouseKind, string> = {
  terraced: 'Terraced',
  semi_detached: 'Semi Detached',
  detached: 'Detached',
  flat: 'Flat',
}

/**
 * `Yes`/`No` exactly.
 *
 * The route's gap check runs `parseYesNo` before the engine, and it is stricter than it
 * looks: the JSON number `1` is a re-ask, not a yes, and so are `"yeah"` and `"yep"`.
 * An unreadable flag comes back as `missing_inputs` rather than silently costing the
 * customer nothing — the right failure, and one worth keeping by sending only these two
 * strings (§6).
 */
export function yesNo(value: boolean): 'Yes' | 'No' {
  return value ? 'Yes' : 'No'
}

/**
 * The property, as the API takes it.
 *
 * EVERY property sends all six required gates, a flat included. This is the opposite of
 * what a sibling contract wanted and it is not an oversight: `requiredInputs` here is
 * global rather than per service, so a flat missing `loft` is refused exactly as a house
 * missing `loft` is — every row answers `missing_inputs` and nothing prices at all (§3).
 * The surcharges then land as 0 on a flat because its cells carry no `add` object (§6),
 * which is the engine's business rather than ours.
 *
 * That is also why the form asks a flat every question: sending an answer the customer
 * was never given the chance to give would be inventing one, so the fix is to ask, not to
 * default.
 *
 * `outdoor_access` is sent only when it has actually been answered. Omitting it prices at
 * the full rate, which is the safe direction — it must never be inferred, because
 * guessing "no" would halve a price the customer never asked to have halved (§7c).
 */
export function houseInputsOf(input: CalcInput): PricingInputs {
  const inputs: PricingInputs = {
    house_type: HOUSE_TYPE_BY_KIND[input.kind],
    bedrooms: input.bedrooms,
    extension: yesNo(Boolean(input.hasExtension)),
    conservatory: yesNo(Boolean(input.hasConservatory)),
    loft: yesNo(Boolean(input.hasLoftConversion)),
    velux: yesNo(Boolean(input.hasVelux)),
  }

  if (typeof input.hasOutdoorAccess === 'boolean') {
    inputs.outdoor_access = input.hasOutdoorAccess ? 'yes' : 'no'
  }

  return inputs
}

/**
 * Everything the batch route needs, in one object. The API scopes inputs per service
 * itself, so every row reads only what it needs.
 */
export function allInputsOf(input: CalcInput): PricingInputs {
  return houseInputsOf(input)
}

/**
 * Which rows a quote screen actually puts in front of this property.
 *
 * A different question from what we ASK the API — the request omits `serviceKeys`
 * entirely so the whole catalogue comes back, applicability included. A row can be worth
 * asking about and still never be shown.
 *
 * Both one-off cleans are now offered, and they enter the screen by different doors,
 * following the API's own `serviceCatalog` categories rather than a judgement made here:
 *
 *   ext_window_oneoff  category "window_cleaning"  -> a third PLAN, beside 4- and
 *                                                     8-weekly. An alternative to
 *                                                     subscribing, so it is mutually
 *                                                     exclusive with them by construction.
 *   int_window_oneoff  category "addon"            -> an add-on, tickable alongside any
 *                                                     plan. Cleaning the inside of the
 *                                                     windows is not an alternative to
 *                                                     cleaning the outside.
 *
 * They were both withheld until 2026-09-20 on the grounds that a one-off price should not
 * share a screen with a recurring one. Splitting them by category is what resolved that:
 * the comparison the old note worried about only ever applied to the external one.
 *
 * Both are offered to every property type, flats included. Neither has a house-type
 * restriction in the catalogue — they are `multiplier_of_service` off `ext_window_8weekly`,
 * which prices a flat — so unlike gutter and fascia there is no `Flat` row for them to be
 * missing from (§8).
 */
export function offeredServiceKeys(
  property: Pick<CalcInput, 'kind' | 'hasConservatory'>,
): ServiceKey[] {
  const keys = [...WINDOW_KEYS, ...ONEOFF_KEYS]
  if (supportsAncillaryServices(property.kind)) keys.push(...ANCILLARY_KEYS)
  // supportsUplifts guards a 'yes' left over from a house the customer picked before
  // going back and changing the property to a flat, which is never asked about a
  // conservatory. The API gates these two rows on the same answer (§9b).
  if (property.hasConservatory && supportsUplifts(property.kind)) keys.push(...ROOF_KEYS)
  return keys
}

/**
 * True when the property is outside what the API can price at all, decided by the form
 * before any call is made.
 *
 * The tables run 1 to 5 bedrooms on every house type, flats included, and clamp above
 * their top band — so a 9-bedroom detached comes back `ok: true` with the 5-bedroom
 * number and only `oversized: true` to say so (§9). Catching it here means never making
 * the call at all.
 */
export function isOutOfBand(input: CalcInput): boolean {
  const bedrooms = input.bedrooms ?? 0
  return !(bedrooms >= 1 && bedrooms <= TOP_BEDROOM_BAND)
}

/**
 * The last bedroom count the price book actually prices.
 *
 * Every table on every house type runs 1 to 5, flats included. Above it the engine does
 * not refuse — it CLAMPS, returning the 5-bedroom number with `oversized: true` beside it
 * — which is why this number is worth naming rather than inlining: the difference between
 * a real price and a clamped one is invisible in the figure itself.
 *
 * Read by three things that must agree. `isOutOfBand` above decides whether to call the
 * API at all; the bedroom question shows exact chips up to here and one open band above
 * it; and the step that owns that question hands anything above it to the large/unusual
 * branch instead of quoting it. A 5-bedroom house is priced normally — it is the sixth
 * that leaves.
 */
export const TOP_BEDROOM_BAND = 5

// ─────────────────────────── the answer, per row ───────────────────────────

/**
 * One row of the table.
 *
 * `not_applicable` deliberately carries `permanent`, because the API's `reason` code does
 * NOT distinguish its two producers and only the message string does (§9b):
 *
 * - permanent — "this service is not available for this property type". A structural
 *   fact: four of the eight rows on every flat. No answer will ever price it. Hide it.
 * - this turn — "this service does not apply to this property". The conservatory answer
 *   is currently no, which gates both roof rows. Hide it now, re-quote if that changes.
 *
 * Never persist the verdict. A form that hides conservatory roof cleaning forever
 * because the customer first said "no conservatory" has hidden two sellable services and
 * nobody will ever see it happen.
 */
export type PriceCell =
  /** `ghlField` names where this price belongs; read it rather than hard-coding. */
  | { state: 'priced'; price: number; ghlField?: string }
  | { state: 'not_applicable'; permanent: boolean }
  | { state: 'not_priceable'; reason: string; missing: string[] }
  | { state: 'oversized' }
  | { state: 'unavailable'; reason: string }

export type PriceTable = {
  cells: Partial<Record<ServiceKey, PriceCell>>
  /** The whole property is a custom quote — suppress the table, never show a price. */
  oversized: boolean
  source: 'api' | 'local'
  fetchedAt: string
}

export function cellOf(table: PriceTable | null, key: ServiceKey): PriceCell {
  return table?.cells[key] ?? { state: 'unavailable', reason: 'no_table' }
}

/**
 * True when this cell can be put on a booking.
 *
 * Only a real price qualifies now. The old `on_visit` state existed for one thing — a
 * customer who could not count their conservatory roof panels — and this client prices
 * roof cleaning from a house x bedroom table with no panel count anywhere in it, so
 * there is nothing left to promise on the visit.
 */
export function isSelectableCell(cell: PriceCell): boolean {
  return cell.state === 'priced'
}

/**
 * True when at least one row the quote screen offers can actually be picked.
 *
 * False is a dead end rather than a quiet screen: every row disabled, Book Now disabled,
 * and a hint asking for a choice no click on the page can make. `PriceTable.oversized`
 * does not cover it — a table of `not_priceable`, `not_applicable` or `unavailable` cells
 * carries `oversized: false` — so the quote step tests this separately and routes out to
 * the same custom-quote screen an oversized property gets.
 *
 * A flat does NOT take this path. It prices on bedrooms like any other property (§8); what
 * it is never offered is gutter clearance, fascia/soffit and the two roof cleans, and
 * `offeredServiceKeys` already excludes those, so their absence cannot make this false.
 * The paths that do land here are a conservatory answered "no" — which leaves both roof
 * rows unpriced for this answer only (§9b) — and any row the engine declines outright.
 */
export function hasSelectableRow(
  table: PriceTable | null,
  property: Pick<CalcInput, 'kind' | 'hasConservatory'>,
): boolean {
  return offeredServiceKeys(property).some((key) => isSelectableCell(cellOf(table, key)))
}

/**
 * True when the reason there is no price is US, not the property.
 *
 * These are two completely different answers and must never share a screen. `oversized`
 * and `not_applicable` are the API telling us something real about this property —
 * beyond the price list, or a service it cannot have. `unavailable` means we could not
 * get an answer at all: no key configured, a tripped circuit, a timeout, a 401.
 *
 * Conflating them told the owner of an ordinary 3-bed semi that their home was "large or
 * unusual" and ended their journey, because the deployment simply had no API key. A
 * read-scoped key is minted and live as of 2026-09-19, so that is no longer the standing
 * state — but the branch stays, because a rotated key, a tripped circuit or a timeout
 * reproduces it exactly, and the failure it produces is indistinguishable to the customer.
 */
export function pricingUnavailable(
  table: PriceTable | null,
  property: Pick<CalcInput, 'kind' | 'hasConservatory'>,
): boolean {
  const keys = offeredServiceKeys(property)
  if (!keys.length) return false
  return keys.every((key) => cellOf(table, key).state === 'unavailable')
}

/** The number to render, or null when this row has no price to show. */
export function priceOf(table: PriceTable | null, key: ServiceKey): number | null {
  const cell = cellOf(table, key)
  return cell.state === 'priced' ? cell.price : null
}

/** Where the API says this price belongs on the contact, when it said. */
export function ghlFieldOf(table: PriceTable | null, key: ServiceKey): string | null {
  const cell = cellOf(table, key)
  return cell.state === 'priced' ? (cell.ghlField ?? null) : null
}

/**
 * Identity of a property for caching purposes: same key ⇒ same prices.
 *
 * Deliberately excludes anything that does not move a price — the selected frequency and
 * the add-on checkboxes among them. Those only *select* rows out of a table that has
 * already been fetched, which is what keeps an eight-row table at one fetch rather than
 * one per click.
 *
 * All four surcharge gates are in the key, because all four move real money here.
 *
 * So is `outdoor_access`, and it moves the most of any of them: answering "no" halves the
 * three external window rows. Leave it out and a customer who goes back and changes the
 * access answer keeps the cached table — quoted the old price, with no request made and
 * nothing anywhere to show it was wrong. Unanswered is its own third state, not the same
 * as "yes", because it is the one that never discounts (§7c).
 */
export function inputsKeyFor(input: CalcInput): string {
  return [
    input.kind,
    input.bedrooms ?? '-',
    input.hasExtension ? 'e1' : 'e0',
    input.hasConservatory ? 'c1' : 'c0',
    input.hasLoftConversion ? 'l1' : 'l0',
    input.hasVelux ? 'v1' : 'v0',
    typeof input.hasOutdoorAccess === 'boolean' ? (input.hasOutdoorAccess ? 'a1' : 'a0') : 'a-',
  ].join('|')
}

// ─────────────────────────── labels ───────────────────────────

/**
 * Maps each service onto the label the rest of the app uses, so the existing
 * `extras.find(e => e.label === …)` lookups in `ghlFieldMap.ts`, `StepRenderer.tsx`
 * and both quote steps keep resolving.
 */
export const LABEL_BY_SERVICE_KEY: Record<ServiceKey, string> = {
  ext_window_4weekly: 'Every 4 Weekly Clean',
  ext_window_8weekly: 'Every 8 Weekly Clean',
  ext_window_oneoff: EXT_WINDOW_ONEOFF_LABEL,
  int_window_oneoff: INT_WINDOW_ONEOFF_LABEL,
  fascia_soffit_clean: FASCIA_SOFFIT_LABEL,
  full_gutter_clearance: GUTTER_CLEARANCE_LABEL,
  conservatory_roof_external: EXT_CONSERVATORY_ROOF_LABEL,
  conservatory_roof_internal: INT_CONSERVATORY_ROOF_LABEL,
}

/** Reverse of the above, for the label-keyed lookups the existing UI already does. */
export const SERVICE_KEY_BY_LABEL: Record<string, ServiceKey> = Object.entries(
  LABEL_BY_SERVICE_KEY,
).reduce<Record<string, ServiceKey>>((acc, [key, label]) => {
  acc[label] = key as ServiceKey
  return acc
}, {})

/**
 * The external-window row a plan buys.
 *
 * Takes a `WindowPlan`, not a `Frequency`, because a one-off is one of the three things a
 * customer can pick and it maps to a real service key like the other two.
 */
export function serviceKeyForPlan(plan: WindowPlan): ServiceKey {
  if (plan === ONE_OFF_PLAN) return 'ext_window_oneoff'
  return plan === 4 ? 'ext_window_4weekly' : 'ext_window_8weekly'
}
