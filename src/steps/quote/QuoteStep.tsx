import { useState, useEffect, useRef, useMemo } from 'react'
import Button from '@/components/ui/button'
import type { CalcResult } from '@/lib/costing-calc'
import {
  EXT_CONSERVATORY_ROOF_LABEL,
  INT_CONSERVATORY_ROOF_LABEL,
} from '@/lib/costing-calc'
import { CONSERVATORY_ROOF_PRICE_SUBTEXT } from '@/lib/conservatory-roof-copy'
import { useCostingStore, type PriceStatus } from '@/stores/costingStore'
import type { PriceTable } from '@/lib/pricing'
import { isSelectable, usePriceDisplay, type PriceDisplay } from './usePriceDisplay'
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
  priceStatus: PriceStatus
  priceTable: PriceTable | null
}

/** Every add-on on, so the local fallback result carries a price for every row. */
const ALL_ADDONS = {
  gutterClear: true,
  fasciaClean: true,
  conservatoryRoofCleanExternal: true,
  conservatoryRoofCleanInternal: true,
  adHocInternalClean: true,
}

/** A price slot: the number, a shimmer while it loads, or why there is no number. */
function Price({ display, className }: { display: PriceDisplay; className?: string }) {
  if (display.kind === 'loading') {
    return (
      <span
        className={`inline-block h-4 w-12 animate-pulse rounded bg-white/25 align-middle ${className ?? ''}`}
        aria-label="Loading price"
      />
    )
  }
  return <span className={className}>{display.text}</span>
}

/** Full-word labels; card uses smaller type + nowrap so 4-up grid stays one line */
function frequencyCardLabel(val: 6 | 8 | 12 | 'one-off'): string {
  return val === 'one-off' ? 'One Off' : `${val} Weeks`
}

export default function QuoteStep({
  initialValues,
  onSubmit,
  calculatedResult,
  hasConservatory,
  priceStatus,
  priceTable,
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

  // The local fallback, used only when the API could not supply a table. Every add-on is
  // switched on so the result carries a price for every row, selected or not.
  const fallbackResult = useMemo(
    () => calculatedResult(8, ALL_ADDONS),
    [calculatedResult],
  )

  const display = usePriceDisplay({ priceStatus, priceTable, fallback: fallbackResult })

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

  // Check if the selected frequency is one-off
  const isOneOff = frequency === 'one-off';

  /** The external-window row for whatever frequency is selected — used in the breakdown. */
  const selectedFrequencyDisplay = display.forFrequency(frequency ?? 8)

  /**
   * First clean = the selected frequency plus every selected add-on. Rows quoted on the
   * visit contribute nothing, exactly as before.
   */
  const firstCleanTotal = frequency
    ? result?.total || 0
    : result?.extras.reduce((sum, e) => sum + (e.pricedOnVisit ? 0 : e.price), 0) || 0

  // Check if at least one addon is selected
  const hasAnyAddon = gutterClear || fasciaClean || conservatoryRoofCleanExternal || conservatoryRoofCleanInternal || adHocInternalClean;

  /**
   * Nothing can be booked until every row the customer picked carries a price. Without
   * this the form would happily submit a quote whose total silently omits a row the API
   * declined to price.
   */
  const selectionIsPriced =
    (frequency === null || isSelectable(display.forFrequency(frequency))) &&
    (!adHocInternalClean || isSelectable(display.forLabel('Ad Hoc Internal Window Clean'))) &&
    (!gutterClear || isSelectable(display.forLabel('Ad Hoc Gutter Clearance'))) &&
    (!fasciaClean || isSelectable(display.forLabel('Ad Hoc Fascia Soffit & Gutter Clean'))) &&
    (!conservatoryRoofCleanExternal || isSelectable(display.forLabel(EXT_CONSERVATORY_ROOF_LABEL))) &&
    (!conservatoryRoofCleanInternal || isSelectable(display.forLabel(INT_CONSERVATORY_ROOF_LABEL)))

  // Allow submission if frequency is selected OR at least one addon is selected
  const canSubmit =
    priceStatus !== 'loading' && (frequency !== null || hasAnyAddon) && selectionIsPriced

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
                const slot = display.forFrequency(currentFreq)
                const pickable = isSelectable(slot)

                return (
                  <button
                    key={val}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={!pickable}
                    onClick={() => {
                      if (!pickable) return
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
                      } ${pickable ? '' : 'opacity-60 cursor-not-allowed'}`
                    }
                  >
                    <div className="text-base font-bold leading-tight tracking-tight text-white sm:text-lg whitespace-nowrap">
                      {frequencyCardLabel(currentFreq)}
                    </div>
                    <div className={`mt-4 inline-block rounded-md px-4 py-2 text-sm font-bold ${isSelected ? 'bg-[#BF8639] text-[#013252]' : 'bg-[#BF8639]/70 text-[#1b1b1b]'}`}>
                      <Price display={slot} />
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
                disabled={!isSelectable(display.forLabel('Ad Hoc Internal Window Clean'))}
                onClick={() => setAdHocInternalClean(!adHocInternalClean)}
                className={`w-full flex flex-col rounded-md border px-4 py-3 text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed ${adHocInternalClean
                  ? 'border-[#BF8639] bg-[#BF8639]/10 ring-1 ring-[#BF8639]'
                  : 'border-white/20 bg-[#013252] hover:border-white/50'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span>Ad Hoc Internal Window Clean</span>
                  <div className="flex items-center gap-3">
                    <Price
                      display={display.forLabel('Ad Hoc Internal Window Clean')}
                      className="text-sm font-bold text-white"
                    />
                  </div>
                </div>
                <div className="mt-1 text-xs text-white/60">
                  Traditional window cleaning internally
                </div>
              </button>

              <button
                disabled={!isSelectable(display.forLabel('Ad Hoc Gutter Clearance'))}
                onClick={() => setGutterClear(!gutterClear)}
                className={`w-full flex flex-col rounded-md border px-4 py-3 text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed ${gutterClear
                  ? 'border-[#BF8639] bg-[#BF8639]/10 ring-1 ring-[#BF8639]'
                  : 'border-white/20 bg-[#013252] hover:border-white/50'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span>Ad Hoc Gutter Clearance</span>
                  <div className="flex items-center gap-3">
                    <Price
                      display={display.forLabel('Ad Hoc Gutter Clearance')}
                      className="text-sm font-bold text-white"
                    />
                  </div>
                </div>
                <div className="mt-1 text-xs text-white/60">
                  Removal of debris and blockages from guttering
                </div>
              </button>

              <button
                disabled={!isSelectable(display.forLabel('Ad Hoc Fascia Soffit & Gutter Clean'))}
                onClick={() => setFasciaClean(!fasciaClean)}
                className={`w-full flex flex-col rounded-md border px-4 py-3 text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed ${fasciaClean
                  ? 'border-[#BF8639] bg-[#BF8639]/10 ring-1 ring-[#BF8639]'
                  : 'border-white/20 bg-[#013252] hover:border-white/50'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span>Ad Hoc Fascia Soffit & Gutter Clean</span>
                  <div className="flex items-center gap-3">
                    <Price
                      display={display.forLabel('Ad Hoc Fascia Soffit & Gutter Clean')}
                      className="text-sm font-bold text-white"
                    />
                  </div>
                </div>
                <div className="mt-1 text-xs text-white/60">
                  Cleaning of the external face
                </div>
              </button>

              {hasConservatory === 'yes' && (
                <button
                  disabled={!isSelectable(display.forLabel(EXT_CONSERVATORY_ROOF_LABEL))}
                  onClick={() => setConservatoryRoofCleanExternal(!conservatoryRoofCleanExternal)}
                  className={`w-full flex flex-col rounded-md border px-4 py-3 text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed ${conservatoryRoofCleanExternal
                    ? 'border-[#BF8639] bg-[#BF8639]/10 ring-1 ring-[#BF8639]'
                    : 'border-white/20 bg-[#013252] hover:border-white/50'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span>Ad Hoc Conservatory Roof Clean - External</span>
                    <div className="flex items-center gap-3">
                      <Price
                        display={display.forLabel(EXT_CONSERVATORY_ROOF_LABEL)}
                        className="text-sm font-bold text-white"
                      />
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {CONSERVATORY_ROOF_PRICE_SUBTEXT}
                  </div>
                </button>
              )}

              {hasConservatory === 'yes' && (
                <button
                  disabled={!isSelectable(display.forLabel(INT_CONSERVATORY_ROOF_LABEL))}
                  onClick={() => setConservatoryRoofCleanInternal(!conservatoryRoofCleanInternal)}
                  className={`w-full flex flex-col rounded-md border px-4 py-3 text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed ${conservatoryRoofCleanInternal
                    ? 'border-[#BF8639] bg-[#BF8639]/10 ring-1 ring-[#BF8639]'
                    : 'border-white/20 bg-[#013252] hover:border-white/50'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span>Ad Hoc Conservatory Roof Clean<br />- Internal</span>
                    <div className="flex items-center gap-3">
                      <Price
                        display={display.forLabel(INT_CONSERVATORY_ROOF_LABEL)}
                        className="text-sm font-bold text-white"
                      />
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
                      <Price display={selectedFrequencyDisplay} className="font-bold" />
                    </div>
                  )}

                  {adHocInternalClean && (
                    <div className="flex items-center justify-between text-sm">
                      <span>Ad Hoc Internal Window Clean</span>
                      <Price display={display.forLabel('Ad Hoc Internal Window Clean')} className="font-bold" />
                    </div>
                  )}

                  {gutterClear && (
                    <div className="flex items-center justify-between text-sm">
                      <span>Ad Hoc Gutter Clearance</span>
                      <Price display={display.forLabel('Ad Hoc Gutter Clearance')} className="font-bold" />
                    </div>
                  )}

                  {fasciaClean && (
                    <div className="flex items-center justify-between text-sm">
                      <span>Ad Hoc Fascia Cleaning</span>
                      <Price display={display.forLabel('Ad Hoc Fascia Soffit & Gutter Clean')} className="font-bold" />
                    </div>
                  )}

                  {conservatoryRoofCleanExternal && (
                    <div className="flex items-center justify-between text-sm">
                      <span>Ad Hoc Conservatory Roof Clean - External</span>
                      <Price display={display.forLabel(EXT_CONSERVATORY_ROOF_LABEL)} className="font-bold" />
                    </div>
                  )}

                  {conservatoryRoofCleanInternal && (
                    <div className="flex items-center justify-between text-sm">
                      <span>Ad Hoc Conservatory Roof Clean<br />- Internal</span>
                      <Price display={display.forLabel(INT_CONSERVATORY_ROOF_LABEL)} className="font-bold" />
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
                    <Price display={selectedFrequencyDisplay} className="font-bold" />
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
                          {priceStatus === 'loading' ? (
                            <Price display={{ kind: 'loading' }} />
                          ) : (
                            // A sum of distinct returned prices, not a re-derivation of
                            // one — and deliberately not rounded, so the total is exactly
                            // the sum of the lines above it.
                            `£${firstCleanTotal}`
                          )}
                        </div>
                      </div>
                      {frequency && !isOneOff && (
                        <div>
                          <div className="text-xs text-white/50">From second clean</div>
                          <Price
                            display={selectedFrequencyDisplay}
                            className="text-xl font-bold text-white"
                          />
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