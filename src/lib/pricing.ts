/**
 * Vocabulary shared by the browser, the `api/` routes and the v3 bot pricing API.
 *
 * Uses relative imports only (no `@/` alias) so `api/pricing.ts` and
 * `api/submission.ts` can import it under the Vercel Node runtime, the same way
 * they already import `costing-calc` and `form-steps`.
 *
 * See `docs/pricing-api-integration.md` for the open questions behind the
 * mappings below.
 */
import {
  EXT_CONSERVATORY_ROOF_LABEL,
  FASCIA_SOFFIT_LABEL,
  GUTTER_CLEARANCE_LABEL,
  supportsAncillaryServices,
  supportsUplifts,
  type CalcInput,
  type FlatFloor,
  type Frequency,
  type HouseKind,
} from './costing-calc.js'

/**
 * The services the pricing API prices, one call per service.
 *
 * This list is the We Wash Everything price sheet and nothing more. Other contracts also
 * carried 6-weekly, 12-weekly, one-off, an internal window clean and an internal roof
 * clean; none of those appear on this sheet, so the form neither offers
 * them nor asks the API about them.
 */
export type ServiceKey =
  | 'ext_window_4weekly'
  | 'ext_window_8weekly'
  | 'full_gutter_clearance'
  | 'fascia_soffit_gutter'
  | 'conservatory_roof_external'

export const SERVICE_KEYS: ServiceKey[] = [
  'ext_window_4weekly',
  'ext_window_8weekly',
  'full_gutter_clearance',
  'fascia_soffit_gutter',
  'conservatory_roof_external',
]

/** Priced by floor, not by bedroom count, and never uplifted. */
export const WINDOW_KEYS: ServiceKey[] = ['ext_window_4weekly', 'ext_window_8weekly']

/** Offered for Terraced, Semi Detached and Detached only — see supportsAncillaryServices. */
export const ANCILLARY_KEYS: ServiceKey[] = ['full_gutter_clearance', 'fascia_soffit_gutter']

/**
 * The rows priced from the property itself. All four house inputs are required for every
 * one of them — including gutters and fascia, whose prices do not actually vary with
 * extension or conservatory. Ask for a price before all four questions are answered and
 * every one of them comes back "not priceable", not just the surcharge-sensitive ones.
 */
export const HOUSE_PRICED_KEYS: ServiceKey[] = [
  'ext_window_4weekly',
  'ext_window_8weekly',
  'full_gutter_clearance',
  'fascia_soffit_gutter',
]

/** Priced from the panel count alone — no house type, no bedrooms. */
export const ROOF_KEYS: ServiceKey[] = ['conservatory_roof_external']

export function isServiceKey(value: unknown): value is ServiceKey {
  return typeof value === 'string' && (SERVICE_KEYS as string[]).includes(value)
}

// ─────────────────────────── the five logical inputs ───────────────────────────

/**
 * What the API takes. Logical names only — GHL field paths are the server's business,
 * never ours. Inputs are scoped per service: send only what the service reads.
 */
export type PricingInputs = {
  house_type?: string
  /** Houses only. A flat is priced by `floor` instead. */
  bedrooms?: number
  /** Flats only, and an integer: 0 = ground floor, priced up to 4. */
  floor_level?: number
  extension?: 'Yes' | 'No'
  conservatory?: 'Yes' | 'No'
  conservatory_roof_panels?: number
}

/**
 * `HouseKind` → `house_type`.
 *
 * Note the lossiness this inherits rather than introduces: the form already collapses
 * bungalows onto their base type before a `HouseKind` exists, so a detached bungalow is
 * priced as a detached house — exactly as the local calculator prices it today. The API
 * documents `"detached bungalow"` / `"terraced bungalow"` as distinct aliases, so this
 * mapping may be leaving money on the table in either direction. Q5 in
 * `docs/pricing-api-integration.md` asks whether those aliases price differently; do not
 * "fix" this by guessing.
 */
export const HOUSE_TYPE_BY_KIND: Record<HouseKind, string> = {
  terraced: 'Terraced',
  semi_detached: 'Semi Detached',
  detached: 'Detached',
  townhouse: 'Townhouse',
  flat: 'Flat',
}

/**
 * `FlatFloor` -> the `floor_level` the API takes.
 *
 * An INTEGER, with 0 meaning ground — not a label. The priced floors are 0 to 4 and they
 * match exactly: unlike bedroom bands on house rows, a flat floor does not fall forward
 * to the next one or clamp to the top. A floor above 4 comes back
 * `reason: "floor_not_in_table"` with `oversized: true`.
 */
export const FLOOR_LEVEL_BY_FLOOR: Record<FlatFloor, number> = {
  ground: 0,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
}

/**
 * The floors the price sheet actually covers, as the integers the API takes: ground (0)
 * up to the 4th (4).
 *
 * Written out rather than derived from `FLOOR_LEVEL_BY_FLOOR`, and the difference matters.
 * That map translates whatever floors the form offers; this band says which of them the
 * sheet has a row for. Derive one from the other and adding a "5th floor or higher" option
 * would silently declare it priced — and the API would answer `floor_not_in_table` with
 * `oversized: true`, which is exactly the case `isOutOfBand` exists to catch before a call
 * is made.
 */
export const PRICED_FLOOR_LEVELS = { min: 0, max: 4 } as const

/**
 * The same floor as a human-readable label, for the CRM field only.
 *
 * Deliberately separate from FLOOR_LEVEL_BY_FLOOR: the API takes an integer and the
 * contact record takes words, and collapsing the two is how a label ends up being sent
 * as a pricing input.
 */
export const FLOOR_LABEL_BY_FLOOR: Record<FlatFloor, string> = {
  ground: 'Ground Floor',
  first: '1st Floor',
  second: '2nd Floor',
  third: '3rd Floor',
  fourth: '4th Floor',
}

/** The API takes `"Yes"`/`"No"`; anything it cannot read counts as unanswered, never as "no". */
export function yesNo(value: boolean): 'Yes' | 'No' {
  return value ? 'Yes' : 'No'
}

/** The panel count, or null when the customer chose "I'm not sure — confirmed on visit". */
export function panelCountOf(input: CalcInput): number | null {
  const roof = input.conservatoryRoofPricing
  if (!input.hasConservatory || !roof || roof.status !== 'count') return null
  const n = Math.round(roof.panelCount)
  return Number.isFinite(n) && n >= 1 ? n : null
}

/** The four house inputs, sent with all seven house-priced rows. */
export function houseInputsOf(input: CalcInput): PricingInputs {
  // A flat answers a different question entirely: which floor, and nothing else.
  // Sending bedrooms/extension/conservatory for one would be inventing answers the
  // customer was never asked for.
  if (input.kind === 'flat') {
    return {
      house_type: HOUSE_TYPE_BY_KIND.flat,
      floor_level: input.floor ? FLOOR_LEVEL_BY_FLOOR[input.floor] : undefined,
    }
  }

  return {
    house_type: HOUSE_TYPE_BY_KIND[input.kind],
    bedrooms: input.bedrooms,
    extension: yesNo(Boolean(input.hasExtension)),
    conservatory: yesNo(Boolean(input.hasConservatory)),
  }
}

/**
 * Everything the batch route needs, in one object.
 *
 * The API scopes inputs per service itself, so the four house inputs and the panel count
 * travel together and each row reads only what it needs. The panel count is omitted when
 * the customer chose "I'm not sure" — 0 is rejected on purpose, and those two roof rows
 * come back `missing: ["conservatory_roof_panels"]`, which is the honest answer.
 */
export function allInputsOf(input: CalcInput): PricingInputs {
  const panels = panelCountOf(input)
  return {
    ...houseInputsOf(input),
    ...(panels === null ? {} : { conservatory_roof_panels: panels }),
  }
}

/**
 * Which rows a quote screen actually puts in front of this property — the same three gates
 * both screens render on: the two window rows always, the ancillaries only for the house
 * types the sheet prices them for, and the roof clean only where there is a conservatory.
 *
 * A different question from what we ASK the API — the request omits `serviceKeys`
 * entirely so the whole catalogue comes back, applicability included. A row
 * can be worth asking about and still never be shown — and a row the API prices for
 * everybody is still not offered to a customer who was never asked the question it rests on.
 */
export function offeredServiceKeys(
  property: Pick<CalcInput, 'kind' | 'hasConservatory'>,
): ServiceKey[] {
  const keys = [...WINDOW_KEYS]
  if (supportsAncillaryServices(property.kind)) keys.push(...ANCILLARY_KEYS)
  // supportsUplifts guards a 'yes' left over from a house the customer picked before going
  // back and changing the property to a flat, which is never asked about a conservatory.
  if (property.hasConservatory && supportsUplifts(property.kind)) keys.push(...ROOF_KEYS)
  return keys
}

/**
 * True when the property is outside what the API can price at all, decided by the form
 * before any call is made.
 *
 * Bedrooms above 5 are the case that matters: the price tables clamp above their top
 * band, so an oversized property comes back `ok:true` with a real-looking number that is
 * simply the 5-bedroom rate. That is a custom quote, not a price.
 */
export function isOutOfBand(input: CalcInput): boolean {
  // A flat is banded by floor, and the sheet stops at the 4th. Anything higher is a custom
  // quote for the same reason an oversized house is — and the band has to be tested, not
  // assumed from the options on screen: the API answers a 5th-floor flat
  // `floor_not_in_table` with `oversized: true`, so a form that offered one and only
  // checked for a missing floor would send that customer to a screen where every row is
  // unpriceable instead of to a human.
  if (input.kind === 'flat') {
    if (input.floor == null) return true

    // A floor the map has no integer for lands here as undefined and fails the test, which
    // is the safe direction: out of band means a custom quote, never a guessed price.
    const level = FLOOR_LEVEL_BY_FLOOR[input.floor]
    return !(
      Number.isInteger(level) &&
      level >= PRICED_FLOOR_LEVELS.min &&
      level <= PRICED_FLOOR_LEVELS.max
    )
  }

  const bedrooms = input.bedrooms ?? 0
  return !(bedrooms >= 1 && bedrooms <= 5)
}

// ─────────────────────────── the answer, per row ───────────────────────────

/**
 * One row of the table. `on_visit` is the only state the webform still owns outright:
 * the customer said they could not count their roof panels, so there is nothing to ask
 * the API for.
 */
export type PriceCell =
  /** `ghlField` names where this price belongs; read it rather than hard-coding. */
  | { state: 'priced'; price: number; ghlField?: string }
  | { state: 'on_visit' }
  /** The service does not apply to this property at all — hide the row, ask nothing. */
  | { state: 'not_applicable' }
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
 * True when this cell can be put on a booking: a number to charge, or a promise to quote
 * it on the visit.
 *
 * The table-level twin of `isSelectable` in `usePriceDisplay`, which enables a row for
 * exactly the two states that map to `price` and `on_visit`. Everything else — missing
 * inputs, not applicable, oversized, an outage — is a row the customer cannot pick.
 */
export function isSelectableCell(cell: PriceCell): boolean {
  return cell.state === 'priced' || cell.state === 'on_visit'
}

/**
 * True when at least one row the quote screen offers can actually be picked.
 *
 * False is a dead end rather than a quiet screen: every row disabled, Book Now disabled,
 * and a hint asking for a choice no click on the page can make. `PriceTable.oversized`
 * does not cover it — a table of `not_priceable`, `not_applicable` or `unavailable` cells
 * carries `oversized: false` — so the quote step tests this separately and routes out to
 * the same custom-quote screen an oversized property gets.
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
 * unusual" and ended their journey, because the deployment simply had no API key.
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
 * already been fetched, which is what keeps a nine-row table at one fetch rather than
 * one per click.
 */
export function inputsKeyFor(input: CalcInput): string {
  const panels = panelCountOf(input)
  return [
    input.kind,
    input.kind === 'flat' ? (input.floor ?? '-') : input.bedrooms,
    input.hasExtension ? 'e1' : 'e0',
    input.hasConservatory ? 'c1' : 'c0',
    panels === null ? 'p-' : `p${panels}`,
  ].join('|')
}



// ─────────────────────────── labels ───────────────────────────

/**
 * Maps each service onto the label the rest of the app already uses, so the existing
 * `extras.find(e => e.label === …)` lookups in `ghlFieldMap.ts`, `StepRenderer.tsx`
 * and both quote steps keep resolving.
 */
export const LABEL_BY_SERVICE_KEY: Record<ServiceKey, string> = {
  ext_window_4weekly: '4 Weekly',
  ext_window_8weekly: '8 Weekly',
  full_gutter_clearance: GUTTER_CLEARANCE_LABEL,
  fascia_soffit_gutter: FASCIA_SOFFIT_LABEL,
  conservatory_roof_external: EXT_CONSERVATORY_ROOF_LABEL,
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
  return frequency === 4 ? 'ext_window_4weekly' : 'ext_window_8weekly'
}
