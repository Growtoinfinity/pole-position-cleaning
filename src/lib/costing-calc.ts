import costing from './costing.js'

export type HouseKind = 'terraced' | 'semi_detached' | 'detached' | 'townhouse'

/** When user has a conservatory — drives roof-clean add-on pricing (£/panel). Omitted ⇒ priced on visit (£10/panel in copy) */
export type ConservatoryRoofPricingInput =
  | { status: 'count'; panelCount: number }
  | { status: 'unknown' }

export const CONSERVATORY_ROOF_GBP_PER_PANEL = 10

export const EXT_CONSERVATORY_ROOF_LABEL = 'Ad Hoc Conservatory Roof Clean - External'
export const INT_CONSERVATORY_ROOF_LABEL = 'Ad Hoc Conservatory Roof Clean - Internal'

/** Ad hoc internal window clean = this × the property’s 8‑weekly external price (after extension/conservatory uplifts). */
export const AD_HOC_INTERNAL_WINDOW_CLEAN_MULTIPLIER = 2

export type CalcInput = {
  kind: HouseKind
  bedrooms: number
  hasExtension: boolean
  hasConservatory: boolean
  /** Roof clean add-ons only — external frequency conservatory uplift is unchanged here */
  conservatoryRoofPricing?: ConservatoryRoofPricingInput | null
  selectedFrequency: 6 | 8 | 12 | 'one-off'
  addons?: {
    conservatoryRoofCleanExternal?: boolean
    conservatoryRoofCleanInternal?: boolean
    gutterClear?: boolean
    fasciaClean?: boolean
    adHocInternalClean?: boolean
  }
}

export type CalcExtraLine = {
  label: string
  price: number
  /** Shown instead of £0 when priced on visit */
  pricedOnVisit?: boolean
}

export type CalcResult = {
  schedule: { label: string; price: number }[]
  extras: CalcExtraLine[]
  selectedFrequency: 6 | 8 | 12 | 'one-off'
  selectedLabel: string
  basePrice: number
  total: number
}

// Helper function to ensure consistent rounding throughout the application
export function roundPrice(price: number): number {
  return Math.round(price);
}

export function calculateCost(input: CalcInput): CalcResult {
  // Map house kind to the corresponding pricing structure in costing.ts
  const typeKey =
    input.kind === 'terraced' ? 'Terraced' :
    input.kind === 'semi_detached' ? 'SemiDetached' :
    input.kind === 'detached' ? 'Detached' : 
    'TownHouse' // Always use TownHouse for townhouse type regardless of subtype
  
  // Clamp bedrooms between 1 and 5
  const bedroomsKey = `${Math.max(1, Math.min(5, input.bedrooms))} Bedroom` as keyof typeof costing.PropertyTypes.Terraced
  
  // Get the base pricing for this property type and bedroom count
  // @ts-ignore index by dynamic keys
  const base = costing.PropertyTypes[typeKey][bedroomsKey] as any
  
  if (!base) {
    throw new Error(`No pricing data found for ${typeKey} ${bedroomsKey}`)
  }

  // Calculate base prices for all frequencies
  const prices: Record<string, number> = {
    '6_weekly': base['6_weekly'],
    '8_weekly': base['8_weekly'],
    '12_weekly': base['12_weekly'],
    'one-off': base['One_off'] // Use the One_off price from costing.ts
  }
  
  // Add extension cost if applicable
  if (input.hasExtension) {
    prices['6_weekly'] += base['Extension']
    prices['8_weekly'] += base['Extension']
    prices['12_weekly'] += base['Extension']
    prices['one-off'] += base['Extension']
  }
  
  // Add conservatory cost if applicable
  if (input.hasConservatory) {
    prices['6_weekly'] += base['Conservatory']
    prices['8_weekly'] += base['Conservatory']
    prices['12_weekly'] += base['Conservatory']
    prices['one-off'] += base['Conservatory']
  }

  // Create schedule with adjusted prices
  const schedule = [
    { label: '6-weekly', price: prices['6_weekly'] },
    { label: '8-weekly', price: prices['8_weekly'] },
    { label: '12-weekly', price: prices['12_weekly'] },
    { label: 'One-off', price: prices['one-off'] },
  ]

  const selectedLabel = input.selectedFrequency === 'one-off' ? 'One-off' : `${input.selectedFrequency}-weekly`
  
  // Get the base price for the selected frequency
  let basePrice = 0
  if (input.selectedFrequency === 'one-off') {
    basePrice = prices['one-off']
  } else if (input.selectedFrequency === 6) {
    basePrice = prices['6_weekly']
  } else if (input.selectedFrequency === 8) {
    basePrice = prices['8_weekly']
  } else if (input.selectedFrequency === 12) {
    basePrice = prices['12_weekly']
  }

  // Calculate addon prices
  const extras: CalcExtraLine[] = []

  const pushRoofExtra = (
    selected: boolean | undefined,
    label: typeof EXT_CONSERVATORY_ROOF_LABEL | typeof INT_CONSERVATORY_ROOF_LABEL,
  ) => {
    if (!selected || !input.hasConservatory) return

    const spec = input.conservatoryRoofPricing
    if (spec?.status === 'count') {
      const n = Math.max(1, Math.round(spec.panelCount))
      extras.push({
        label,
        price: n * CONSERVATORY_ROOF_GBP_PER_PANEL,
      })
      return
    }
    if (spec?.status === 'unknown') {
      extras.push({ label, price: 0, pricedOnVisit: true })
      return
    }

    // No panel spec (e.g. partial restore / stale state): same as confirmed on visit
    extras.push({ label, price: 0, pricedOnVisit: true })
  }

  pushRoofExtra(input.addons?.conservatoryRoofCleanExternal, EXT_CONSERVATORY_ROOF_LABEL)
  pushRoofExtra(input.addons?.conservatoryRoofCleanInternal, INT_CONSERVATORY_ROOF_LABEL)

  // Calculate gutter clearance price
  if (input.addons?.gutterClear) {
    extras.push({ label: 'Ad Hoc Gutter Clearance', price: base['Gutter_clearance'] })
  }
  
  // Calculate fascia clean price
  if (input.addons?.fasciaClean) {
    extras.push({ label: 'Ad Hoc Fascia Soffit & Gutter Clean', price: base['Fascia_soffit_gutter_clean'] })
  }
  
  // Calculate internal window cleaning price (multiple of 8-weekly external price)
  if (input.addons?.adHocInternalClean) {
    const internalCleanPrice = roundPrice(
      prices['8_weekly'] * AD_HOC_INTERNAL_WINDOW_CLEAN_MULTIPLIER,
    )
    extras.push({ label: 'Ad Hoc Internal Window Clean', price: internalCleanPrice })
  }

  const extrasCashTotal = extras.reduce((sum, e) => sum + (e.pricedOnVisit ? 0 : e.price), 0)
  const total = roundPrice(basePrice + extrasCashTotal)

  return { 
    schedule, 
    extras, 
    selectedFrequency: input.selectedFrequency, 
    selectedLabel, 
    basePrice, 
    total 
  }
}