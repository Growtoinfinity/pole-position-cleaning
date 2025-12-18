import costing from './costing'

export type HouseKind = 'terraced' | 'semi_detached' | 'detached' | 'townhouse'

export type CalcInput = {
  kind: HouseKind
  bedrooms: number
  hasExtension: boolean
  hasConservatory: boolean
  selectedFrequency: 6 | 8 | 12 | 'one-off'
  addons?: {
    conservatoryRoofCleanExternal?: boolean
    conservatoryRoofCleanInternal?: boolean
    gutterClear?: boolean
    fasciaClean?: boolean
    adHocInternalClean?: boolean
  }
}

export type CalcResult = {
  schedule: { label: string; price: number }[]
  extras: { label: string; price: number }[]
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
  const extras: { label: string; price: number }[] = []
  
  // Calculate conservatory roof clean external price
  if (input.addons?.conservatoryRoofCleanExternal) {
    const bedroomCount = Math.min(5, Math.max(1, input.bedrooms)).toString()
    // @ts-ignore index by dynamic keys
    const roofCleanPrice = costing.ConservatoryRoofCleaning.External[typeKey][bedroomCount]
    extras.push({ label: 'Ad Hoc Conservatory Roof Clean - External', price: roofCleanPrice })
  }
  
  // Calculate conservatory roof clean internal price
  if (input.addons?.conservatoryRoofCleanInternal) {
    const bedroomCount = Math.min(5, Math.max(1, input.bedrooms)).toString()
    // @ts-ignore index by dynamic keys
    const roofCleanPrice = costing.ConservatoryRoofCleaning.Internal[typeKey][bedroomCount]
    extras.push({ label: 'Ad Hoc Conservatory Roof Clean - Internal', price: roofCleanPrice })
  }

  // Calculate gutter clearance price
  if (input.addons?.gutterClear) {
    extras.push({ label: 'Ad Hoc Gutter Clearance', price: base['Gutter_clearance'] })
  }
  
  // Calculate fascia clean price
  if (input.addons?.fasciaClean) {
    extras.push({ label: 'Ad Hoc Fascia Soffit & Gutter Clean', price: base['Fascia_soffit_gutter_clean'] })
  }
  
  // Calculate internal window cleaning price (always 1.5x the 8-weekly price)
  if (input.addons?.adHocInternalClean) {
    const internalCleanPrice = roundPrice(prices['8_weekly'] * 1.5)
    extras.push({ label: 'Ad Hoc Internal Window Clean', price: internalCleanPrice })
  }

  // Calculate total price
  const total = roundPrice(basePrice + extras.reduce((sum, e) => sum + e.price, 0))

  return { 
    schedule, 
    extras, 
    selectedFrequency: input.selectedFrequency, 
    selectedLabel, 
    basePrice, 
    total 
  }
}