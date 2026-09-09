/**
 * Vocabulary shared by the browser, the `api/` routes and the v3 bot pricing API.
 *
 * Uses relative imports only (no `@/` alias) so `api/pricing.ts` and
 * `api/submission.ts` can import it under the Vercel Node runtime, the same way
 * they already import `costing-calc` and `form-steps`.
 *
 * `docs/pricing-api-wewasheverything.md` is the single source of truth for every name,
 * rule and branch in this file. Section references below point into it.
 */
import {
  EXT_CONSERVATORY_ROOF_LABEL,
  EXT_WINDOW_ONEOFF_LABEL,
  FASCIA_SOFFIT_LABEL,
  GUTTER_CLEARANCE_LABEL,
  INT_CONSERVATORY_ROOF_LABEL,
  INT_WINDOW_ONEOFF_LABEL,
  supportsAncillaryServices,
  supportsUplifts,
  type CalcInput,
  type Frequency,
  type HouseKind,
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
  | 'ext_window_6weekly'
  | 'ext_window_12weekly'
  | 'ext_window_oneoff'
  | 'int_window_oneoff'
  | 'fascia_soffit_clean'
  | 'full_gutter_clearance'
  | 'conservatory_roof_external'
  | 'conservatory_roof_internal'

export const SERVICE_KEYS: ServiceKey[] = [
  'ext_window_6weekly',
  'ext_window_12weekly',
  'ext_window_oneoff',
  'int_window_oneoff',
  'fascia_soffit_clean',
  'full_gutter_clearance',
  'conservatory_roof_external',
  'conservatory_roof_internal',
]

/** The two recurring window rows — the frequency choice itself. */
export const WINDOW_KEYS: ServiceKey[] = ['ext_window_6weekly', 'ext_window_12weekly']

/**
 * The two one-off window cleans.
 *
 * Both are `multiplier_of_service`: 2 x the **external** 6-weekly total, surcharges
 * included in the doubling. They are therefore always the SAME number as each other, and
 * a 4-bed detached with both uplifts is 2 x (29 + 2 + 10) = 82, not 2x29 + 2 + 10 = 70.
 * Read `price`; never re-derive one of these from the 6-weekly figure (§4, §5).
 */
export const ONEOFF_KEYS: ServiceKey[] = ['ext_window_oneoff', 'int_window_oneoff']

/** No `Flat` row in either table, so houses only — townhouse included (§5, §8). */
export const ANCILLARY_KEYS: ServiceKey[] = ['fascia_soffit_clean', 'full_gutter_clearance']

/**
 * Both conservatory roof cleans.
 *
 * `conservatory_roof_internal` is a `same_as_service` of the external one and returns
 * exactly the same number — that table carries no `add` object on any of its 20 cells,
 * so neither uplift ever moves either price (§4, §5).
 *
 * Priced from a house x bedroom table here. There is no per-panel service anywhere in
 * this catalogue, which is why the form no longer asks for a panel count.
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
 * Four inputs, and only four. Notably absent, and absent on purpose:
 *
 * - `floor_level`. The client's rule is that a flat bands on bedrooms and is never asked
 *   its floor. Today's engine would read `floor_level` as a bedroom column and quote a
 *   3-bed first-floor flat at the ONE-bedroom price, `ok: true`, `oversized: false`,
 *   with nothing in the response to flag it. Sending it is the trap, not the fix (§7).
 * - `conservatory_roof_panels`. No `unit_rate` service exists in this config and the
 *   field is not in `field_mapping`; sending it prices nothing (§4).
 *
 * `loft` and `number_of_velux` ARE here, and §6 of the doc says they should not be —
 * it records both as declared but never charged. That is now out of date. Verified
 * against the live API on 2026-09-09: `GET /config` lists `requiredInputs` as
 * `["house_type","bedrooms","extension","conservatory","loft","number_of_velux"]`, and
 * the surcharges land. `loft` is genuinely REQUIRED on a house — omit it and all eight
 * rows answer `missing_inputs: ["loft"]`, so the whole quote fails, not just the uplift.
 * Read `requiredInputs` from `GET /config` rather than trusting either source.
 */
export type PricingInputs = {
  house_type?: string
  bedrooms?: number
  extension?: 'Yes' | 'No'
  conservatory?: 'Yes' | 'No'
  loft?: 'Yes' | 'No'
  /**
   * A count, not a flag. £1 per window on the two window tables (and so £2 per window on
   * the one-offs, which double the whole subtotal); fascia and gutter carry no `velux`
   * key and do not move. Optional — omitted behaves exactly as 0.
   *
   * Note it does NOT appear in a priced row's `detail`, which carries only
   * `extSurcharge` and `consSurcharge`. Unlike the other two uplifts there is no way to
   * read back that a Velux count landed; the price is the only evidence.
   */
  number_of_velux?: number
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
  townhouse: 'Town house',
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
 * A flat sends its house type and its bedroom count and nothing else. Verified live: a
 * flat prices from `bedrooms` alone, and extension, conservatory, loft and Velux are all
 * accepted and ignored for one — the `Flat` cells carry no `add` object, so no uplift has
 * anything to attach to. The form does not ask a flat any of those questions, so sending
 * them would be inventing answers the customer was never given the chance to give.
 *
 * A house sends all five. `loft` is not optional: without it the API refuses every row.
 */
export function houseInputsOf(input: CalcInput): PricingInputs {
  if (input.kind === 'flat') {
    return {
      house_type: HOUSE_TYPE_BY_KIND.flat,
      bedrooms: input.bedrooms,
    }
  }

  return {
    house_type: HOUSE_TYPE_BY_KIND[input.kind],
    bedrooms: input.bedrooms,
    extension: yesNo(Boolean(input.hasExtension)),
    conservatory: yesNo(Boolean(input.hasConservatory)),
    loft: yesNo(Boolean(input.hasLoftConversion)),
    // 0 and "absent" are the same answer to the API, so a property with no Velux sends
    // the explicit 0 rather than dropping the key — it reads as an answer, not a gap.
    number_of_velux: Math.max(0, Math.trunc(input.veluxCount ?? 0)),
  }
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
 * The two one-off cleans are priced and returned but deliberately not offered here: they
 * are an alternative to a subscription rather than an add-on to one, and putting them on
 * the same screen as the frequency choice asks the customer to compare a recurring price
 * with a one-off one. Add them to this list the day that product decision is made.
 */
export function offeredServiceKeys(
  property: Pick<CalcInput, 'kind' | 'hasConservatory'>,
): ServiceKey[] {
  const keys = [...WINDOW_KEYS]
  if (supportsAncillaryServices(property.kind)) keys.push(...ANCILLARY_KEYS)
  // supportsUplifts guards a 'yes' left over from a house the customer picked before
  // going back and changing the property to a flat, which is never asked about a
  // conservatory. The API gates these two rows on the same answer (§8b).
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
  return !(bedrooms >= 1 && bedrooms <= 5)
}

// ─────────────────────────── the answer, per row ───────────────────────────

/**
 * One row of the table.
 *
 * `not_applicable` deliberately carries `permanent`, because the API's `reason` code does
 * NOT distinguish its two producers and only the message string does (§8b):
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
 * This is the path a flat takes today: the engine still demands `floor_level`, which the
 * form will not send, so every window row answers `missing_inputs` and the customer goes
 * to a human instead of to a wrong number (§7).
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
 * unusual" and ended their journey, because the deployment simply had no API key. That
 * is the state this client is in TODAY — no pricing credential has been minted, so every
 * route answers 401 (§2) — which makes this branch the one most likely to fire.
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
 * The loft answer and the Velux count ARE in the key, because they now move real money:
 * £2/£6/£5 for a loft conversion and £1 per Velux on the window rows. Leave either out
 * and a customer who goes back and changes the answer keeps the cached table — quoted the
 * old price, with no request made and nothing to show anything was wrong.
 */
export function inputsKeyFor(input: CalcInput): string {
  return [
    input.kind,
    input.bedrooms ?? '-',
    input.hasExtension ? 'e1' : 'e0',
    input.hasConservatory ? 'c1' : 'c0',
    input.hasLoftConversion ? 'l1' : 'l0',
    `v${Math.max(0, Math.trunc(input.veluxCount ?? 0))}`,
  ].join('|')
}

// ─────────────────────────── labels ───────────────────────────

/**
 * Maps each service onto the label the rest of the app uses, so the existing
 * `extras.find(e => e.label === …)` lookups in `ghlFieldMap.ts`, `StepRenderer.tsx`
 * and both quote steps keep resolving.
 */
export const LABEL_BY_SERVICE_KEY: Record<ServiceKey, string> = {
  ext_window_6weekly: '6 Weekly',
  ext_window_12weekly: '12 Weekly',
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

/** The window-clean row for a selected frequency. */
export function serviceKeyForFrequency(frequency: Frequency): ServiceKey {
  return frequency === 6 ? 'ext_window_6weekly' : 'ext_window_12weekly'
}
