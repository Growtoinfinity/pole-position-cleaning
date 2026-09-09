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
 * Everything here is derived from `docs/pricing-api-wewasheverything.md`, which is the
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
 * their config's `flat_banding`, and it is why this file has no floor vocabulary at all.
 *
 * There is no Bungalow row in any table. The form collapses a bungalow onto its base
 * type before a `HouseKind` exists, which matches what the API's own normalizer does
 * with the string: a bungalow that says neither "semi" nor "terraced" is priced as
 * DETACHED. See §4b.
 */
export type HouseKind = 'terraced' | 'semi_detached' | 'detached' | 'townhouse' | 'flat'

/**
 * The two recurring window-cleaning cycles this client sells.
 *
 * Six and twelve weekly — not the four and eight of other contracts. There is no
 * 8-weekly service in this catalogue at all (§4).
 */
export type Frequency = 6 | 12

export const FREQUENCIES: Frequency[] = [6, 12]

export function frequencyLabel(frequency: Frequency): string {
  return `${frequency} Weekly`
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
export const INT_WINDOW_ONEOFF_LABEL = 'One-off internal window clean'

/**
 * Gutter clearance, fascia/soffit and both conservatory roof cleans have no `Flat` row
 * in their tables, and a flat is not classifiable under the `standard` normalisation
 * those four services use. The API answers them `not_applicable` for a flat, permanently
 * — no input the customer can supply will ever price them (§8).
 *
 * Every house type IS priced for them, townhouse included: each table carries a
 * `Town house` row byte-identical to its `Terraced` one (§5).
 */
export function supportsAncillaryServices(kind: HouseKind): boolean {
  return kind !== 'flat'
}

/**
 * The extension and conservatory uplifts.
 *
 * The five `Flat` cells of both window tables carry no `add` object at all, so a flat is
 * never surcharged (§5) — which is why a flat is not asked either question.
 */
export function supportsUplifts(kind: HouseKind): boolean {
  return kind !== 'flat'
}

/**
 * Everything the pricing API needs to know about the property.
 *
 * `hasLoftConversion` and `veluxCount` ARE pricing inputs, and that contradicts §6 of the
 * client doc — which was written before the surcharges were implemented and records them
 * as "money the engine will never charge". Verified against the live API on 2026-09-09:
 * a loft conversion adds £2 to each window row, £6 to fascia and £5 to gutter on a
 * 3-bed semi, and each Velux adds £1 to the window rows only. `loft` is REQUIRED for a
 * house — omit it and every row comes back `missing_inputs`, so nothing quotes at all.
 */
export type CalcInput = {
  kind: HouseKind
  /** Every property, flats included — a flat bands on bedrooms like a house. */
  bedrooms?: number
  hasExtension?: boolean
  hasConservatory?: boolean
  hasLoftConversion?: boolean
  /** Absent or 0 both mean "none"; the API treats the input as optional. */
  veluxCount?: number
  selectedFrequency: Frequency
  addons?: {
    conservatoryRoofCleanExternal?: boolean
    conservatoryRoofCleanInternal?: boolean
    gutterClear?: boolean
    fasciaClean?: boolean
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
  schedule: { label: string; price: number }[]
  extras: CalcExtraLine[]
  selectedFrequency: Frequency
  selectedLabel: string
  basePrice: number
  total: number
}

/** A quote with no prices in it — what an unavailable pricing API produces. */
export function emptyResult(selectedFrequency: Frequency): CalcResult {
  return {
    schedule: FREQUENCIES.map((f) => ({ label: frequencyLabel(f), price: 0 })),
    extras: [],
    selectedFrequency,
    selectedLabel: frequencyLabel(selectedFrequency),
    basePrice: 0,
    total: 0,
  }
}
