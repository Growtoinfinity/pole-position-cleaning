import { useState, useEffect, useRef, useMemo, memo } from 'react'
import Button from '@/components/ui/button'
import type { CalcResult } from '@/lib/costing-calc'
import { roundPrice } from '@/lib/costing-calc'
import { useCosting } from '@/hooks/useCosting'
import type { YesNo } from '@/types'

export type QuoteStepMobileValues = {
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
  initialValues?: Partial<QuoteStepMobileValues>
  onSubmit: (values: QuoteStepMobileValues) => void
  calculatedResult: (frequency: 6 | 8 | 12 | 'one-off', addons: any) => CalcResult
  hasConservatory?: YesNo
}

// Memoized option button component to prevent unnecessary re-renders
const OptionButton = memo(function OptionButton({
  isSelected,
  onClick,
  label,
  price,
}: {
  isSelected: boolean
  onClick: () => void
  label: string
  price: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all ${isSelected
        ? 'border-[#BF8639] bg-[#BF8639]/10 ring-2 ring-[#BF8639]'
        : 'border-white/20 bg-[#013252] hover:border-white/50'
        }`}
    >
      <span className="text-white font-medium">{label}</span>
      <span className="text-sm font-bold text-white">{price}</span>
    </button>
  )
})

// Memoized price breakdown item component
const PriceBreakdownItem = memo(function PriceBreakdownItem({
  label,
  price,
}: {
  label: string
  price: string
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span className="font-bold">{price}</span>
    </div>
  )
})

export default function QuoteStepMobile({
  initialValues,
  onSubmit,
  calculatedResult,
  hasConservatory
}: Props) {
  // Get costing context
  const costingContext = useCosting();

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
        costingContext.setFrequency(frequency);
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
      costingContext.setAddons(currentAddons);
    }
  }, [frequency, currentAddons, costingContext]);

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
      // Always use 8-weekly price * 1.5 for internal window cleaning
      const basePrice = defaultResult.schedule.find(s => s.label === '8-weekly')?.price || 0
      return roundPrice(basePrice * 1.5).toString()
    }

    // For other addons, find the price in the default result
    const addonPrice = defaultResult.extras.find(e => e.label === label)?.price

    // If not found in extras (because it's not selected), calculate the price
    if (addonPrice === undefined) {
      // Create a temporary addons object with just this addon selected
      const tempAddons = {
        gutterClear: label === 'Ad Hoc Gutter Clearance',
        fasciaClean: label === 'Ad Hoc Fascia Soffit & Gutter Clean',
        conservatoryRoofCleanExternal: label === 'Ad Hoc Conservatory Roof Clean - External',
        conservatoryRoofCleanInternal: label === 'Ad Hoc Conservatory Roof Clean - Internal',
        adHocInternalClean: false
      }

      // Calculate a new result with just this addon
      const tempResult = calculatedResult(8, tempAddons)
      const price = tempResult.extras.find(e => e.label === label)?.price
      return price ? roundPrice(price).toString() : '0'
    }

    return roundPrice(addonPrice).toString()
  }, [defaultResult, calculatedResult]);

  // Check if at least one addon is selected
  const hasAnyAddon = gutterClear || fasciaClean || conservatoryRoofCleanExternal || conservatoryRoofCleanInternal || adHocInternalClean;

  // Allow submission if frequency is selected OR at least one addon is selected
  const canSubmit = frequency !== null || hasAnyAddon;

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit({
        frequency: frequency ?? null,
        addons: currentAddons
      })
    }
  }

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

  return (
    <div className="mx-auto w-full max-w-7xl px-4">
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-semibold text-[#BF8639] mb-6">
            Please select the services you want to go ahead with
          </h2>

          {/* External Window Cleaning */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-2">External window cleaning</h3>
            <p className="text-sm text-white/60 mb-4">All frames, sills and glass are included</p>

            <div className="space-y-3">
              <OptionButton
                isSelected={frequency === 6}
                onClick={() => {
                  // If clicking the same frequency, deselect it (set to null)
                  if (frequency === 6) {
                    setFrequency(null)
                  } else {
                    setFrequency(6)
                  }
                }}
                label="6 weekly external window cleaning"
                price={`£${basePrices[6]}`}
              />

              <OptionButton
                isSelected={frequency === 8}
                onClick={() => {
                  // If clicking the same frequency, deselect it (set to null)
                  if (frequency === 8) {
                    setFrequency(null)
                  } else {
                    setFrequency(8)
                  }
                }}
                label="8 weekly external window cleaning"
                price={`£${basePrices[8]}`}
              />

              <OptionButton
                isSelected={frequency === 12}
                onClick={() => {
                  // If clicking the same frequency, deselect it (set to null)
                  if (frequency === 12) {
                    setFrequency(null)
                  } else {
                    setFrequency(12)
                  }
                }}
                label="12 weekly external window cleaning"
                price={`£${basePrices[12]}`}
              />

              <OptionButton
                isSelected={frequency === 'one-off'}
                onClick={() => {
                  // If clicking the same frequency, deselect it (set to null)
                  if (frequency === 'one-off') {
                    setFrequency(null)
                  } else {
                    setFrequency('one-off')
                  }
                }}
                label="Ad hoc/ one off window cleaning"
                price={`£${basePrices['one-off']}`}
              />
            </div>
          </div>

          {/* Internal Window Cleaning */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-2">Internal window cleaning</h3>
            <p className="text-sm text-white/60 mb-4">Traditional window cleaning internally</p>

            <div className="space-y-3">
              <OptionButton
                isSelected={adHocInternalClean}
                onClick={() => setAdHocInternalClean(!adHocInternalClean)}
                label="Ad hoc/ one off internal window cleaning"
                price={`£${getAddonPrice('Ad Hoc Internal Window Clean')}`}
              />
            </div>
          </div>

          {/* Conservatory Roof Cleaning */}
          {hasConservatory === 'yes' && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-white mb-2">Conservatory roof cleaning</h3>
              <p className="text-sm text-white/60 mb-4">All frames, sills and glass are included</p>

              <div className="space-y-3">
                <OptionButton
                  isSelected={conservatoryRoofCleanExternal}
                  onClick={() => setConservatoryRoofCleanExternal(!conservatoryRoofCleanExternal)}
                  label="Ad hoc/ One off External Conservatory roof cleaning"
                  price={`£${getAddonPrice('Ad Hoc Conservatory Roof Clean - External')}`}
                />

                <OptionButton
                  isSelected={conservatoryRoofCleanInternal}
                  onClick={() => setConservatoryRoofCleanInternal(!conservatoryRoofCleanInternal)}
                  label="Ad hoc/ One off Internal Conservatory roof cleaning"
                  price={`£${getAddonPrice('Ad Hoc Conservatory Roof Clean - Internal')}`}
                />
              </div>
            </div>
          )}

          {/* Full Gutter Clearance */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-2">Full gutter clearance</h3>
            <p className="text-sm text-white/60 mb-4">Removal of debris and blockages from guttering</p>

            <div className="space-y-3">
              <OptionButton
                isSelected={gutterClear}
                onClick={() => setGutterClear(!gutterClear)}
                label="Ad hoc/ one off gutter clearance"
                price={`£${getAddonPrice('Ad Hoc Gutter Clearance')}`}
              />
            </div>
          </div>

          {/* Fascia and Soffit Gutter Clean */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-2">Fascia and soffit gutter clean</h3>
            <p className="text-sm text-white/60 mb-4">Cleaning of the external face</p>

            <div className="space-y-3">
              <OptionButton
                isSelected={fasciaClean}
                onClick={() => setFasciaClean(!fasciaClean)}
                label="Ad hoc/ one off fascia and soffit gutter clean"
                price={`£${getAddonPrice('Ad Hoc Fascia Soffit & Gutter Clean')}`}
              />
            </div>
          </div>
        </div>

        {/* Price Breakdown - Show when frequency is selected or when addons are selected */}
        {(frequency || hasAnyAddon) && (
          <div className="border-t border-white/20 pt-6">
            <div className="rounded-xl border border-[#BF8639]/40 bg-white/5 p-4">
              <h3 className="text-lg font-semibold text-[#BF8639] mb-4">Price Breakdown</h3>

              {/* First Cleaning */}
              <div className="mb-4 border-b border-white/10 pb-4">
                <h4 className="text-base font-semibold text-[#BF8639] mb-3">First Cleaning</h4>
                <div className="space-y-2">
                  {frequency && (
                    <PriceBreakdownItem
                      label="External Window Cleaning"
                      price={`£${roundPrice(result?.basePrice || 0)}`}
                    />
                  )}

                  {gutterClear && (
                    <PriceBreakdownItem
                      label="Ad Hoc Gutter Clearance"
                      price={`£${getAddonPrice('Ad Hoc Gutter Clearance')}`}
                    />
                  )}

                  {fasciaClean && (
                    <PriceBreakdownItem
                      label="Ad Hoc Fascia Cleaning"
                      price={`£${getAddonPrice('Ad Hoc Fascia Soffit & Gutter Clean')}`}
                    />
                  )}

                  {adHocInternalClean && (
                    <PriceBreakdownItem
                      label="Ad Hoc Internal Window Clean"
                      price={`£${getAddonPrice('Ad Hoc Internal Window Clean')}`}
                    />
                  )}

                  {conservatoryRoofCleanExternal && (
                    <PriceBreakdownItem
                      label="Ad Hoc Conservatory Roof Clean - External"
                      price={`£${getAddonPrice('Ad Hoc Conservatory Roof Clean - External')}`}
                    />
                  )}

                  {conservatoryRoofCleanInternal && (
                    <PriceBreakdownItem
                      label="Ad Hoc Conservatory Roof Clean - Internal"
                      price={`£${getAddonPrice('Ad Hoc Conservatory Roof Clean - Internal')}`}
                    />
                  )}
                </div>
              </div>

              {/* From second cleaning - Only show for regular frequencies (not one-off) */}
              {frequency && !isOneOff && (
                <div className="mb-4 border-b border-white/10 pb-4">
                  <h4 className="text-base font-semibold text-[#BF8639] mb-3">From second cleaning</h4>
                  <div className="space-y-2">
                    <PriceBreakdownItem
                      label="External Window Cleaning"
                      price={`£${roundPrice(result?.basePrice || 0)}`}
                    />
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="border-t border-white/20 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm uppercase tracking-wide text-white/70">Total</div>
                    <div className="flex gap-4 mt-2">
                      <div>
                        <div className="text-xs text-white/50">First Clean</div>
                        <div className="text-lg font-bold text-[#BF8639]">
                          £{roundPrice(frequency ? (result?.total || 0) : (result?.extras.reduce((sum, e) => sum + e.price, 0) || 0))}
                        </div>
                      </div>
                      {frequency && !isOneOff && (
                        <div>
                          <div className="text-xs text-white/50">From second clean</div>
                          <div className="text-lg font-bold text-white">£{roundPrice(result?.basePrice || 0)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="pt-4">
          <Button
            className="w-full"
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            Book Now
          </Button>
        </div>
      </div>
    </div>
  )
}