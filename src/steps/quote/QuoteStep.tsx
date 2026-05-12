import { useState, useEffect, useRef, useMemo } from 'react'
import Button from '@/components/ui/button'
import type { CalcResult } from '@/lib/costing-calc'
import {
  AD_HOC_INTERNAL_WINDOW_CLEAN_MULTIPLIER,
  EXT_CONSERVATORY_ROOF_LABEL,
  INT_CONSERVATORY_ROOF_LABEL,
  roundPrice,
} from '@/lib/costing-calc'
import { CONSERVATORY_ROOF_PRICE_SUBTEXT } from '@/lib/conservatory-roof-copy'
import { useCostingStore } from '@/stores/costingStore'
import type { YesNo } from '@/types'

export type QuoteStepValues = {
  frequency: 6 | 8 | 12 | 'one-off' | null
  addons: {
    gutterClear: boolean
    fasciaClean: boolean
    conservatoryRoofCleanExternal: boolean
    conservatoryRoofCleanInternal: boolean
    adHocInternalClean: boolean
  }
}

type Props = {
  initialValues?: Partial<QuoteStepValues>
  onSubmit: (values: QuoteStepValues) => void
  calculatedResult: (frequency: 6 | 8 | 12 | 'one-off', addons: any) => CalcResult
  hasConservatory?: YesNo
}

/** Full-word labels; card uses smaller type + nowrap so 4-up grid stays one line */
function frequencyCardLabel(val: 6 | 8 | 12 | 'one-off'): string {
  return val === 'one-off' ? 'One Off' : `${val} Weeks`
}

export default function QuoteStep({
  initialValues,
  onSubmit,
  calculatedResult,
  hasConservatory
}: Props) {
  // Sync local quote UI frequency/addons into the global costing store (stable selectors)
  const setFrequencyInStore = useCostingStore((s) => s.setFrequency)
  const setAddonsInStore = useCostingStore((s) => s.setAddons)

  const [frequency, setFrequency] = useState<6 | 8 | 12 | 'one-off' | null>((initialValues?.frequency as 6 | 8 | 12 | 'one-off' | null) ?? null)
  const [gutterClear, setGutterClear] = useState<boolean>(initialValues?.addons?.gutterClear ?? false)
  const [fasciaClean, setFasciaClean] = useState<boolean>(initialValues?.addons?.fasciaClean ?? false)
  const [conservatoryRoofCleanExternal, setConservatoryRoofCleanExternal] = useState<boolean>(
    initialValues?.addons?.conservatoryRoofCleanExternal ?? false
  )
  const [conservatoryRoofCleanInternal, setConservatoryRoofCleanInternal] = useState<boolean>(
    initialValues?.addons?.conservatoryRoofCleanInternal ?? false
  )
  const [adHocInternalClean, setAdHocInternalClean] = useState<boolean>(initialValues?.addons?.adHocInternalClean ?? false)

  // Deselect conservatory addons if user doesn't have a conservatory
  useEffect(() => {
    if (hasConservatory === 'no') {
      if (conservatoryRoofCleanExternal) {
        setConservatoryRoofCleanExternal(false)
      }
      if (conservatoryRoofCleanInternal) {
        setConservatoryRoofCleanInternal(false)
      }
    }
  }, [hasConservatory, conservatoryRoofCleanExternal, conservatoryRoofCleanInternal])

  const [result, setResult] = useState<CalcResult | null>(null)

  // Update costing context when frequency or addons change
  // Using a ref to prevent infinite loops
  const prevFrequencyRef = useRef(frequency);
  const prevAddonsRef = useRef({
    gutterClear,
    fasciaClean,
    conservatoryRoofCleanExternal,
    conservatoryRoofCleanInternal,
    adHocInternalClean
  });

  // Memoize the current addons object to prevent unnecessary recalculations
  const currentAddons = useMemo(() => ({
    gutterClear,
    fasciaClean,
    conservatoryRoofCleanExternal,
    conservatoryRoofCleanInternal,
    adHocInternalClean
  }), [gutterClear, fasciaClean, conservatoryRoofCleanExternal, conservatoryRoofCleanInternal, adHocInternalClean]);

  // Always calculate a default result with 8-weekly frequency for displaying addon prices
  // even when no frequency is selected
  const defaultResult = useMemo(() => {
    return calculatedResult(8, currentAddons);
  }, [calculatedResult, currentAddons]);

  useEffect(() => {
    // Only update if frequency has actually changed
    if (frequency !== prevFrequencyRef.current) {
      prevFrequencyRef.current = frequency;
      if (frequency) {
        setFrequencyInStore(frequency);
      }
    }

    const prevAddons = prevAddonsRef.current;
    const hasChanged =
      prevAddons.gutterClear !== gutterClear ||
      prevAddons.fasciaClean !== fasciaClean ||
      prevAddons.conservatoryRoofCleanExternal !== conservatoryRoofCleanExternal ||
      prevAddons.conservatoryRoofCleanInternal !== conservatoryRoofCleanInternal ||
      prevAddons.adHocInternalClean !== adHocInternalClean;

    if (hasChanged) {
      prevAddonsRef.current = { ...currentAddons };
      setAddonsInStore(currentAddons);
    }
  }, [frequency, currentAddons, setFrequencyInStore, setAddonsInStore]);

  // Calculate the result whenever any relevant state changes
  // Calculate even without frequency for addon-only scenarios
  useEffect(() => {
    // If frequency is selected, use it; otherwise use 8-weekly as default for addon pricing
    const freqForCalculation = frequency || 8
    const newResult = calculatedResult(freqForCalculation, currentAddons)
    setResult(newResult)
  }, [frequency, currentAddons, calculatedResult])

  // Helper function to get pricing for display (even when no frequency is selected)
  const getAddonPrice = useMemo(() => (label: string) => {
    // For internal window cleaning, we need a frequency to calculate the price
    if (label === 'Ad Hoc Internal Window Clean') {
      // Always use 8-weekly price × AD_HOC_INTERNAL_WINDOW_CLEAN_MULTIPLIER for internal window cleaning
      const basePrice = defaultResult.schedule.find(s => s.label === '8-weekly')?.price || 0
      return roundPrice(basePrice * AD_HOC_INTERNAL_WINDOW_CLEAN_MULTIPLIER).toString()
    }

    const addonLine = defaultResult.extras.find((e) => e.label === label)
    if (addonLine?.pricedOnVisit) {
      return 'Price on visit'
    }

    const addonPrice = addonLine?.price

    // If not found in extras (because it's not selected), calculate the price
    if (addonPrice === undefined) {
      // Create a temporary addons object with just this addon selected
      const tempAddons = {
        gutterClear: label === 'Ad Hoc Gutter Clearance',
        fasciaClean: label === 'Ad Hoc Fascia Soffit & Gutter Clean',
        conservatoryRoofCleanExternal: label === EXT_CONSERVATORY_ROOF_LABEL,
        conservatoryRoofCleanInternal: label === INT_CONSERVATORY_ROOF_LABEL,
        adHocInternalClean: false
      }

      // Calculate a new result with just this addon
      const tempResult = calculatedResult(8, tempAddons)
      const priceLine = tempResult.extras.find((e) => e.label === label)
      if (priceLine?.pricedOnVisit) {
        return 'Price on visit'
      }
      const price = priceLine?.price
      return price !== undefined ? roundPrice(price).toString() : '0'
    }

    return roundPrice(addonPrice).toString()
  }, [defaultResult, calculatedResult]);

  const formatAddonLine = useMemo(
    () => (label: string) => {
      const p = getAddonPrice(label)
      return p === 'Price on visit' ? p : `£${p}`
    },
    [getAddonPrice],
  )

  // Memoize base prices for different frequencies
  const basePrices = useMemo(() => {
    const prices = {
      6: calculatedResult(6, {}).basePrice,
      8: calculatedResult(8, {}).basePrice,
      12: calculatedResult(12, {}).basePrice,
      'one-off': calculatedResult('one-off', {}).basePrice
    }
    return {
      6: roundPrice(prices[6]),
      8: roundPrice(prices[8]),
      12: roundPrice(prices[12]),
      'one-off': roundPrice(prices['one-off'])
    }
  }, [calculatedResult]);

  // Check if the selected frequency is one-off
  const isOneOff = frequency === 'one-off';

  // Check if at least one addon is selected
  const hasAnyAddon = gutterClear || fasciaClean || conservatoryRoofCleanExternal || conservatoryRoofCleanInternal || adHocInternalClean;

  // Allow submission if frequency is selected OR at least one addon is selected
  const canSubmit = frequency !== null || hasAnyAddon;

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left side - 2/3 width */}
        <div className="md:col-span-2 space-y-10">
          <div>
            <h2 className="text-2xl font-semibold text-[#BF8639]">External Window Cleaning Frequency</h2>
            <div className="mt-2 mb-4 text-sm text-white/60">
              All frames, sills and glass are included
            </div>
            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-4">
              {[6, 8, 12, 'one-off'].map((val) => {
                const isSelected = frequency === val
                const currentFreq = val as 6 | 8 | 12 | 'one-off'
                const price = basePrices[currentFreq]

                return (
                  <button
                    key={val}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      // If clicking the same frequency, deselect it (set to null)
                      if (isSelected) {
                        setFrequency(null)
                      } else {
                        setFrequency(val as 6 | 8 | 12 | 'one-off')
                      }
                    }}
                    className={
                      `group relative flex min-h-[140px] flex-col justify-between rounded-xl border p-6 text-left transition-all ${isSelected
                        ? 'border-[#BF8639] bg-[#BF8639]/10 ring-2 ring-[#BF8639] shadow-[0_0_0_1px_rgba(191,134,57,0.3)]'
                        : 'border-white/20 bg-[#013252] hover:border-white/50'
                      }`
                    }
                  >
                    <div className="text-base font-bold leading-tight tracking-tight text-white sm:text-lg whitespace-nowrap">
                      {frequencyCardLabel(currentFreq)}
                    </div>
                    <div className={`mt-4 inline-block rounded-md px-4 py-2 text-sm font-bold ${isSelected ? 'bg-[#BF8639] text-[#013252]' : 'bg-[#BF8639]/70 text-[#1b1b1b]'}`}>
                      £{price}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <h3 className="text-2xl font-semibold text-[#BF8639]">One Time Add-ons</h3>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <button
                onClick={() => setAdHocInternalClean(!adHocInternalClean)}
                className={`w-full flex flex-col rounded-md border px-4 py-3 text-left transition-all ${adHocInternalClean
                  ? 'border-[#BF8639] bg-[#BF8639]/10 ring-1 ring-[#BF8639]'
                  : 'border-white/20 bg-[#013252] hover:border-white/50'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span>Ad Hoc Internal Window Clean</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white">
                      £{getAddonPrice('Ad Hoc Internal Window Clean')}
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-white/60">
                  Traditional window cleaning internally
                </div>
              </button>

              <button
                onClick={() => setGutterClear(!gutterClear)}
                className={`w-full flex flex-col rounded-md border px-4 py-3 text-left transition-all ${gutterClear
                  ? 'border-[#BF8639] bg-[#BF8639]/10 ring-1 ring-[#BF8639]'
                  : 'border-white/20 bg-[#013252] hover:border-white/50'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span>Ad Hoc Gutter Clearance</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white">£{getAddonPrice('Ad Hoc Gutter Clearance')}</span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-white/60">
                  Removal of debris and blockages from guttering
                </div>
              </button>

              <button
                onClick={() => setFasciaClean(!fasciaClean)}
                className={`w-full flex flex-col rounded-md border px-4 py-3 text-left transition-all ${fasciaClean
                  ? 'border-[#BF8639] bg-[#BF8639]/10 ring-1 ring-[#BF8639]'
                  : 'border-white/20 bg-[#013252] hover:border-white/50'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span>Ad Hoc Fascia Soffit & Gutter Clean</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white">£{getAddonPrice('Ad Hoc Fascia Soffit & Gutter Clean')}</span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-white/60">
                  Cleaning of the external face
                </div>
              </button>

              {hasConservatory === 'yes' && (
                <button
                  onClick={() => setConservatoryRoofCleanExternal(!conservatoryRoofCleanExternal)}
                  className={`w-full flex flex-col rounded-md border px-4 py-3 text-left transition-all ${conservatoryRoofCleanExternal
                    ? 'border-[#BF8639] bg-[#BF8639]/10 ring-1 ring-[#BF8639]'
                    : 'border-white/20 bg-[#013252] hover:border-white/50'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span>Ad Hoc Conservatory Roof Clean - External</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white">
                        {formatAddonLine(EXT_CONSERVATORY_ROOF_LABEL)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {CONSERVATORY_ROOF_PRICE_SUBTEXT}
                  </div>
                </button>
              )}

              {hasConservatory === 'yes' && (
                <button
                  onClick={() => setConservatoryRoofCleanInternal(!conservatoryRoofCleanInternal)}
                  className={`w-full flex flex-col rounded-md border px-4 py-3 text-left transition-all ${conservatoryRoofCleanInternal
                    ? 'border-[#BF8639] bg-[#BF8639]/10 ring-1 ring-[#BF8639]'
                    : 'border-white/20 bg-[#013252] hover:border-white/50'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span>Ad Hoc Conservatory Roof Clean<br />- Internal</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white">
                        {formatAddonLine(INT_CONSERVATORY_ROOF_LABEL)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {CONSERVATORY_ROOF_PRICE_SUBTEXT}
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right side - 1/3 width */}
        <div className="md:col-span-1">
          <div className="sticky top-4 rounded-xl border border-[#BF8639]/40 bg-white/5 p-6">
            <h3 className="text-xl font-semibold text-[#BF8639] mb-4">Price Breakdown</h3>

            {/* First Cleaning - Show when frequency or addons are selected */}
            {(frequency || hasAnyAddon) && (
              <div className="mb-6 border-b border-white/10 pb-4">
                <h4 className="text-lg font-semibold text-[#BF8639] mb-3">First Cleaning</h4>
                <div className="space-y-2">
                  {frequency && (
                    <div className="flex items-center justify-between text-sm">
                      <span>External Window Cleaning</span>
                      <span className="font-bold">£{roundPrice(result?.basePrice || 0)}</span>
                    </div>
                  )}

                  {adHocInternalClean && (
                    <div className="flex items-center justify-between text-sm">
                      <span>Ad Hoc Internal Window Clean</span>
                      <span className="font-bold">£{getAddonPrice('Ad Hoc Internal Window Clean')}</span>
                    </div>
                  )}

                  {gutterClear && (
                    <div className="flex items-center justify-between text-sm">
                      <span>Ad Hoc Gutter Clearance</span>
                      <span className="font-bold">£{getAddonPrice('Ad Hoc Gutter Clearance')}</span>
                    </div>
                  )}

                  {fasciaClean && (
                    <div className="flex items-center justify-between text-sm">
                      <span>Ad Hoc Fascia Cleaning</span>
                      <span className="font-bold">£{getAddonPrice('Ad Hoc Fascia Soffit & Gutter Clean')}</span>
                    </div>
                  )}

                  {conservatoryRoofCleanExternal && (
                    <div className="flex items-center justify-between text-sm">
                      <span>Ad Hoc Conservatory Roof Clean - External</span>
                      <span className="font-bold">{formatAddonLine(EXT_CONSERVATORY_ROOF_LABEL)}</span>
                    </div>
                  )}

                  {conservatoryRoofCleanInternal && (
                    <div className="flex items-center justify-between text-sm">
                      <span>Ad Hoc Conservatory Roof Clean<br />- Internal</span>
                      <span className="font-bold">{formatAddonLine(INT_CONSERVATORY_ROOF_LABEL)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* From second cleaning - Only show for regular frequencies (not one-off) */}
            {frequency && !isOneOff && (
              <div className="mb-6 border-b border-white/10 pb-4">
                <h4 className="text-lg font-semibold text-[#BF8639] mb-3">From second cleaning</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>External Window Cleaning</span>
                    <span className="font-bold">£{roundPrice(result?.basePrice || 0)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Total - Show when frequency is selected or when addons are selected */}
            {(frequency || gutterClear || fasciaClean || conservatoryRoofCleanExternal || conservatoryRoofCleanInternal || adHocInternalClean) && (
              <div className="border-t border-white/20 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm uppercase tracking-wide text-white/70">Total</div>
                    <div className="flex gap-6 mt-2">
                      <div>
                        <div className="text-xs text-white/50">First Clean</div>
                        <div className="text-xl font-bold text-[#BF8639]">
                          £{roundPrice(frequency ? (result?.total || 0) : (result?.extras.reduce((sum, e) => sum + (e.pricedOnVisit ? 0 : e.price), 0) || 0))}
                        </div>
                      </div>
                      {frequency && !isOneOff && (
                        <div>
                          <div className="text-xs text-white/50">From second clean</div>
                          <div className="text-xl font-bold text-white">£{roundPrice(result?.basePrice || 0)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6">
              <Button
                className="w-full"
                type="button"
                disabled={!canSubmit}
                onClick={() => {
                  if (canSubmit) {
                    onSubmit({
                      frequency: frequency ?? null,
                      addons: currentAddons
                    })
                  }
                }}
              >
                Book Now
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}