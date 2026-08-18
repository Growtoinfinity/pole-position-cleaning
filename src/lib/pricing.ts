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
import type { CalcInput, HouseKind } from './costing-calc'

/** The nine services the pricing API knows how to price. One call prices one service. */
export type ServiceKey =
  | 'ext_window_6weekly'
  | 'ext_window_8weekly'
  | 'ext_window_12weekly'
  | 'ext_window_oneoff'
  | 'int_window_oneoff'
  | 'full_gutter_clearance'
  | 'fascia_soffit_gutter'
  | 'conservatory_roof_external'
  | 'conservatory_roof_internal'

export const SERVICE_KEYS: ServiceKey[] = [
  'ext_window_6weekly',
  'ext_window_8weekly',
  'ext_window_12weekly',
  'ext_window_oneoff',
  'int_window_oneoff',
  'full_gutter_clearance',
  'fascia_soffit_gutter',
  'conservatory_roof_external',
  'conservatory_roof_internal',
]

/**
 * The seven rows priced from the property itself. All four house inputs are required
 * for every one of them — including gutters and fascia, whose prices do not actually
 * vary with extension or conservatory. Ask for a price before all four questions are
 * answered and all seven come back "not priceable", not just the surcharge-sensitive ones.
 */
export const HOUSE_PRICED_KEYS: ServiceKey[] = [
  'ext_window_6weekly',
  'ext_window_8weekly',
  'ext_window_12weekly',
  'ext_window_oneoff',
  'int_window_oneoff',
  'full_gutter_clearance',
  'fascia_soffit_gutter',
]

/** The two rows priced from the panel count alone — no house type, no bedrooms. */
export const ROOF_KEYS: ServiceKey[] = [
  'conservatory_roof_external',
  'conservatory_roof_internal',
]

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
  bedrooms?: number
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
  townhouse: 'Town house',
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
  return {
    house_type: HOUSE_TYPE_BY_KIND[input.kind],
    bedrooms: input.bedrooms,
    extension: yesNo(input.hasExtension),
    conservatory: yesNo(input.hasConservatory),
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
 * Which rows to ask for, given the property.
 *
 * Drops the two roof rows when there is no conservatory, or when the customer could not
 * estimate the panel count — so a typical table is 7 calls, not 9.
 */
export function selectServiceKeys(input: CalcInput): ServiceKey[] {
  const keys = [...HOUSE_PRICED_KEYS]
  if (panelCountOf(input) !== null) keys.push(...ROOF_KEYS)
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
  return !(input.bedrooms >= 1 && input.bedrooms <= 5)
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
    input.bedrooms,
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
  ext_window_6weekly: '6-weekly',
  ext_window_8weekly: '8-weekly',
  ext_window_12weekly: '12-weekly',
  ext_window_oneoff: 'One-off',
  int_window_oneoff: 'Ad Hoc Internal Window Clean',
  full_gutter_clearance: 'Ad Hoc Gutter Clearance',
  fascia_soffit_gutter: 'Ad Hoc Fascia Soffit & Gutter Clean',
  conservatory_roof_external: 'Ad Hoc Conservatory Roof Clean - External',
  conservatory_roof_internal: 'Ad Hoc Conservatory Roof Clean - Internal',
}

/** Reverse of the above, for the label-keyed lookups the existing UI already does. */
export const SERVICE_KEY_BY_LABEL: Record<string, ServiceKey> = Object.entries(
  LABEL_BY_SERVICE_KEY,
).reduce<Record<string, ServiceKey>>((acc, [key, label]) => {
  acc[label] = key as ServiceKey
  return acc
}, {})

/** The window-clean row for a selected frequency. */
export function serviceKeyForFrequency(
  frequency: 6 | 8 | 12 | 'one-off',
): ServiceKey {
  switch (frequency) {
    case 6:
      return 'ext_window_6weekly'
    case 8:
      return 'ext_window_8weekly'
    case 12:
      return 'ext_window_12weekly'
    default:
      return 'ext_window_oneoff'
  }
}
