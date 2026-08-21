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
 * Uses relative imports only (no `@/` alias) so the `api/` routes can import it under
 * the Vercel Node runtime.
 */

/**
 * A flat is a property kind of its own, not a house with a bedroom count: it is priced
 * by which floor it is on and is asked nothing else.
 */
export type HouseKind = 'terraced' | 'semi_detached' | 'detached' | 'townhouse' | 'flat'

export type FlatFloor = 'ground' | 'first' | 'second' | 'third' | 'fourth'

/** The floors the price book covers, in the order a customer should see them. */
export const FLAT_FLOORS: { value: FlatFloor; label: string }[] = [
  { value: 'ground', label: 'Ground floor' },
  { value: 'first', label: '1st floor' },
  { value: 'second', label: '2nd floor' },
  { value: 'third', label: '3rd floor' },
  { value: 'fourth', label: '4th floor' },
]

/** Set when the customer has a conservatory — the roof clean is priced per panel. */
export type ConservatoryRoofPricingInput =
  | { status: 'count'; panelCount: number }
  | { status: 'unknown' }

export const EXT_CONSERVATORY_ROOF_LABEL = 'Conservatory Roof Clean - External'
export const GUTTER_CLEARANCE_LABEL = 'Gutter Clearance'
export const FASCIA_SOFFIT_LABEL = 'Fascia, Soffit & Gutter Clean'

/** The only two cleaning frequencies offered. */
export type Frequency = 4 | 8

export const FREQUENCIES: Frequency[] = [4, 8]

export function frequencyLabel(frequency: Frequency): string {
  return `${frequency} Weekly`
}

/**
 * Gutter clearance and fascia/soffit are priced for these three house types only.
 * A townhouse or a flat has no row for either, so the services are not offered —
 * showing a row and then failing to price it is worse than not showing it.
 */
const ANCILLARY_KINDS = ['terraced', 'semi_detached', 'detached'] as const
type AncillaryKind = (typeof ANCILLARY_KINDS)[number]

export function supportsAncillaryServices(kind: HouseKind): kind is AncillaryKind {
  return (ANCILLARY_KINDS as readonly string[]).includes(kind)
}

/** Flats are never asked about extensions or conservatories — neither applies. */
export function supportsUplifts(kind: HouseKind): boolean {
  return kind !== 'flat'
}

/** Everything the pricing API needs to know about the property. */
export type CalcInput = {
  kind: HouseKind
  /** Houses only. A flat is identified by `floor` instead. */
  bedrooms?: number
  /** Flats only. Required when `kind` is 'flat'. */
  floor?: FlatFloor | null
  hasExtension?: boolean
  hasConservatory?: boolean
  conservatoryRoofPricing?: ConservatoryRoofPricingInput | null
  selectedFrequency: Frequency
  addons?: {
    conservatoryRoofCleanExternal?: boolean
    gutterClear?: boolean
    fasciaClean?: boolean
  }
}

export type CalcExtraLine = {
  label: string
  price: number
  /** Shown instead of £0 when the price is confirmed on the visit */
  pricedOnVisit?: boolean
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
