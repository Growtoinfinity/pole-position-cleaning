import { useState, useEffect, useRef, useMemo, memo } from 'react'
import { Check } from 'lucide-react'
import Button from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CalcResult } from '@/lib/costing-calc'
import {
  EXT_CONSERVATORY_ROOF_LABEL,
  INT_CONSERVATORY_ROOF_LABEL,
} from '@/lib/costing-calc'
import { CONSERVATORY_ROOF_PRICE_SUBTEXT } from '@/lib/conservatory-roof-copy'
import { useCostingStore, type PriceStatus } from '@/stores/costingStore'
import type { PriceTable } from '@/lib/pricing'
import { isSelectable, usePriceDisplay, type PriceDisplay } from './usePriceDisplay'
import {
  SHORT_NAME,
  firstCleanText,
  summariseSelection,
  unpricedNoteText,
  type SelectedLine,
} from './quoteTotals'
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

/**
 * A price still in flight. An em-dash said "there is no price"; a shimmer says "a price
 * is coming", which is what is actually true. bg-skeleton (1.7:1) rather than brand-100
 * (1.16:1) — at that contrast the placeholder was invisible on white and a screen of
 * pending rows read as a blank, broken page.
 *
 * role="img" so the label is actually exposed: aria-label on a bare span is dropped by
 * most assistive tech, which would leave the price column silent.
 */
function PriceSkeleton({ className }: { className?: string }) {
  return (
    <span
      // cn(), not concatenation, so a caller can size the shimmer to the type it replaces
      className={cn('inline-block h-4 w-12 animate-pulse rounded bg-skeleton align-middle', className)}
      role="img"
      aria-label="Loading price"
    />
  )
}

/**
 * Text for a price slot. A slot that is still loading renders a PriceSkeleton instead,
 * so the empty string is never shown — every call site pairs this with `loading`.
 */
function priceText(display: PriceDisplay): string {
  return display.kind === 'loading' ? '' : display.text
}

// Memoized option button component to prevent unnecessary re-renders
const OptionButton = memo(function OptionButton({
  isSelected,
  onClick,
  label,
  price,
  loading = false,
  disabled = false,
  role = 'button',
}: {
  isSelected: boolean
  onClick: () => void
  label: string
  price: string
  /**
   * Kept a plain boolean rather than passing the PriceDisplay object down: a priced slot
   * is a fresh object every render, which would defeat this component's memo().
   */
  loading?: boolean
  disabled?: boolean
  /**
   * Single-choice groups pass 'radio' so assistive tech announces the frequency
   * rows as one set; the independent add-on toggles keep the button role. The
   * shared selected style keys off whichever attribute this picks, so the look
   * and the announcement can never drift apart.
   */
  role?: 'radio' | 'button'
}) {
  const isRadio = role === 'radio'

  // gm-selectable carries the border, radius, hover, focus, selected and disabled
  // states shared with the desktop cards — this row adds only its own layout
  const rowClass = 'gm-selectable flex w-full items-start justify-between gap-3 px-4 py-3 text-left'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role={isRadio ? 'radio' : undefined}
      aria-checked={isRadio ? isSelected : undefined}
      aria-pressed={isRadio ? undefined : isSelected}
      className={rowClass}
    >
      <span className="flex min-w-0 items-start gap-2.5">
        {/* A tick as well as the tint — on a phone the selected row has to read at a glance */}
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
            isSelected && 'border-brand-600 bg-brand-600 text-white',
            !isSelected && (disabled ? 'border-line bg-white' : 'border-line-strong bg-white'),
          )}
          aria-hidden
        >
          {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
        <span
          className={cn(
            'text-sm',
            // Unavailable rows recolour instead of fading, so the label and the
            // price both stay readable — see the note beside .gm-selectable
            disabled
              ? 'font-medium text-ink-muted'
              : isSelected
                ? 'font-semibold text-brand-900'
                : 'font-medium text-ink',
          )}
        >
          {label}
        </span>
      </span>
      <span
        className={cn(
          'shrink-0 text-sm font-bold tabular-nums',
          disabled ? 'text-ink-muted' : 'text-brand-800',
        )}
      >
        {loading ? <PriceSkeleton /> : price}
      </span>
    </button>
  )
})

// Memoized price breakdown item component
const PriceBreakdownItem = memo(function PriceBreakdownItem({
  label,
  price,
  loading = false,
}: {
  label: string
  price: string
  /** Boolean, not the PriceDisplay object, so memo() still holds — see OptionButton. */
  loading?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums text-ink">
        {loading ? <PriceSkeleton /> : price}
      </span>
    </div>
  )
})

export default function QuoteStepMobile({
  initialValues,
  onSubmit,
  calculatedResult,
  hasConservatory,
  priceStatus,
  priceTable,
}: Props) {
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

  /**
   * While the table is in flight every slot is `loading` (usePriceDisplay short-circuits
   * on status before it looks anything up), so one boolean drives every shimmer — and a
   * boolean, unlike a PriceDisplay, keeps the memoised rows from re-rendering.
   */
  const isLoading = priceStatus === 'loading'

  /**
   * A disabled primary button with nothing beside it is a dead end — the customer can see
   * they cannot continue but not what to do about it. Read-only: this only names the
   * condition `canSubmit` already failed on, it never decides anything. Wording is shared
   * verbatim with the desktop twin so the two screens cannot say different things.
   */
  // Loading is tested FIRST. On arrival nothing is selected AND the prices are
  // still in flight, so an "if nothing selected" branch placed above this one wins
  // at the only moment the loading message actually matters — telling the customer
  // to pick something while every row is disabled.
  const disabledHint = canSubmit
    ? null
    : priceStatus === 'loading'
      ? 'Just fetching your prices…'
      : frequency === null && !hasAnyAddon
        ? 'Choose a frequency or an add-on to continue'
        : 'One of your choices needs a quote from us — deselect it to continue'

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit({
        frequency: frequency ?? null,
        addons: currentAddons
      })
    }
  }

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

  /**
   * The lines the breakdown below is already listing, each with a short customer-facing
   * name. Read straight off the same PriceDisplay slots those rows render — this adds no
   * second price lookup and no arithmetic of its own.
   */
  const selectedLines: SelectedLine[] = []
  if (frequency) {
    selectedLines.push({ shortName: SHORT_NAME.frequency, display: selectedFrequencyDisplay })
  }
  if (adHocInternalClean) {
    selectedLines.push({
      shortName: SHORT_NAME.internal,
      display: display.forLabel('Ad Hoc Internal Window Clean'),
    })
  }
  if (gutterClear) {
    selectedLines.push({
      shortName: SHORT_NAME.gutter,
      display: display.forLabel('Ad Hoc Gutter Clearance'),
    })
  }
  if (fasciaClean) {
    selectedLines.push({
      shortName: SHORT_NAME.fascia,
      display: display.forLabel('Ad Hoc Fascia Soffit & Gutter Clean'),
    })
  }
  if (conservatoryRoofCleanExternal) {
    selectedLines.push({
      shortName: SHORT_NAME.conservatoryExternal,
      display: display.forLabel(EXT_CONSERVATORY_ROOF_LABEL),
    })
  }
  if (conservatoryRoofCleanInternal) {
    selectedLines.push({
      shortName: SHORT_NAME.conservatoryInternal,
      display: display.forLabel(INT_CONSERVATORY_ROOF_LABEL),
    })
  }

  const totals = summariseSelection(selectedLines)

  return (
    <div className="w-full">
      {/* pb-28 is the sticky bar's own height (its tallest state, with the hint showing), so
          the last option row can always be scrolled clear of it rather than sitting under it */}
      <div className="space-y-8 pb-28">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-brand-800 mb-6">
            Please select the services you want to go ahead with
          </h2>

          {/* External Window Cleaning */}
          <div className="mb-8">
            <h3 className="text-base font-semibold text-ink mb-2">External window cleaning</h3>
            <p className="text-sm text-ink-muted mb-4">All frames, sills and glass are included</p>

            {/* One frequency at a time, so the rows are announced as a single set */}
            <div className="space-y-3" role="radiogroup" aria-label="External window cleaning frequency">
              <OptionButton
                role="radio"
                isSelected={frequency === 6}
                onClick={() => {
                  // If clicking the same frequency, deselect it (set to null)
                  if (frequency === 6) {
                    setFrequency(null)
                  } else {
                    setFrequency(6)
                  }
                }}
                label="6 Weeks — external"
                price={priceText(display.forFrequency(6))}
                loading={isLoading}
                disabled={!isSelectable(display.forFrequency(6))}
              />

              <OptionButton
                role="radio"
                isSelected={frequency === 8}
                onClick={() => {
                  // If clicking the same frequency, deselect it (set to null)
                  if (frequency === 8) {
                    setFrequency(null)
                  } else {
                    setFrequency(8)
                  }
                }}
                label="8 Weeks — external"
                price={priceText(display.forFrequency(8))}
                loading={isLoading}
                disabled={!isSelectable(display.forFrequency(8))}
              />

              <OptionButton
                role="radio"
                isSelected={frequency === 12}
                onClick={() => {
                  // If clicking the same frequency, deselect it (set to null)
                  if (frequency === 12) {
                    setFrequency(null)
                  } else {
                    setFrequency(12)
                  }
                }}
                label="12 Weeks — external"
                price={priceText(display.forFrequency(12))}
                loading={isLoading}
                disabled={!isSelectable(display.forFrequency(12))}
              />

              <OptionButton
                role="radio"
                isSelected={frequency === 'one-off'}
                onClick={() => {
                  // If clicking the same frequency, deselect it (set to null)
                  if (frequency === 'one-off') {
                    setFrequency(null)
                  } else {
                    setFrequency('one-off')
                  }
                }}
                label="One Off — external"
                price={priceText(display.forFrequency('one-off'))}
                loading={isLoading}
                disabled={!isSelectable(display.forFrequency('one-off'))}
              />
            </div>
          </div>

          {/* Internal Window Cleaning */}
          <div className="mb-8">
            <h3 className="text-base font-semibold text-ink mb-2">Internal window cleaning</h3>
            <p className="text-sm text-ink-muted mb-4">Traditional window cleaning internally</p>

            <div className="space-y-3">
              <OptionButton
                isSelected={adHocInternalClean}
                onClick={() => setAdHocInternalClean(!adHocInternalClean)}
                label="Ad hoc/ one off internal window cleaning"
                price={priceText(display.forLabel('Ad Hoc Internal Window Clean'))}
                loading={isLoading}
                disabled={!isSelectable(display.forLabel('Ad Hoc Internal Window Clean'))}
              />
            </div>
          </div>

          {/* Full Gutter Clearance */}
          <div className="mb-8">
            <h3 className="text-base font-semibold text-ink mb-2">Full gutter clearance</h3>
            <p className="text-sm text-ink-muted mb-4">Removal of debris and blockages from guttering</p>

            <div className="space-y-3">
              <OptionButton
                isSelected={gutterClear}
                onClick={() => setGutterClear(!gutterClear)}
                label="Ad hoc/ one off gutter clearance"
                price={priceText(display.forLabel('Ad Hoc Gutter Clearance'))}
                loading={isLoading}
                disabled={!isSelectable(display.forLabel('Ad Hoc Gutter Clearance'))}
              />
            </div>
          </div>

          {/* Fascia and Soffit Gutter Clean */}
          <div className="mb-8">
            <h3 className="text-base font-semibold text-ink mb-2">Fascia and soffit gutter clean</h3>
            <p className="text-sm text-ink-muted mb-4">Cleaning of the external face</p>

            <div className="space-y-3">
              <OptionButton
                isSelected={fasciaClean}
                onClick={() => setFasciaClean(!fasciaClean)}
                label="Ad hoc/ one off fascia and soffit gutter clean"
                price={priceText(display.forLabel('Ad Hoc Fascia Soffit & Gutter Clean'))}
                loading={isLoading}
                disabled={!isSelectable(display.forLabel('Ad Hoc Fascia Soffit & Gutter Clean'))}
              />
            </div>
          </div>

          {/* Conservatory Roof Cleaning — last among add-ons */}
          {hasConservatory === 'yes' && (
            <div className="mb-8">
              <h3 className="text-base font-semibold text-ink mb-2">Conservatory roof cleaning</h3>
              <p className="text-sm text-ink-muted mb-4">{CONSERVATORY_ROOF_PRICE_SUBTEXT}</p>

              <div className="space-y-3">
                <OptionButton
                  isSelected={conservatoryRoofCleanExternal}
                  onClick={() => setConservatoryRoofCleanExternal(!conservatoryRoofCleanExternal)}
                  label="Ad hoc / one-off external conservatory roof cleaning"
                  price={priceText(display.forLabel(EXT_CONSERVATORY_ROOF_LABEL))}
                  loading={isLoading}
                  disabled={!isSelectable(display.forLabel(EXT_CONSERVATORY_ROOF_LABEL))}
                />

                <OptionButton
                  isSelected={conservatoryRoofCleanInternal}
                  onClick={() => setConservatoryRoofCleanInternal(!conservatoryRoofCleanInternal)}
                  label="Ad hoc / one-off internal conservatory roof cleaning"
                  price={priceText(display.forLabel(INT_CONSERVATORY_ROOF_LABEL))}
                  loading={isLoading}
                  disabled={!isSelectable(display.forLabel(INT_CONSERVATORY_ROOF_LABEL))}
                />
              </div>
            </div>
          )}
        </div>

        {/* Price Breakdown - Show when frequency is selected or when addons are selected */}
        {(frequency || hasAnyAddon) && (
          <div className="gm-card p-5">
            <h3 className="text-base font-semibold text-ink mb-4">Price Breakdown</h3>

            {/* First Cleaning */}
            <div className="mb-4 border-b border-line pb-4">
              {/* One step below the panel title, and a step above the ink-muted row labels */}
              <h4 className="text-sm font-semibold text-ink mb-3">First Cleaning</h4>
              <div className="space-y-2">
                {frequency && (
                  <PriceBreakdownItem
                    label="External Window Cleaning"
                    price={priceText(selectedFrequencyDisplay)}
                    loading={isLoading}
                  />
                )}

                {adHocInternalClean && (
                  <PriceBreakdownItem
                    label="Ad Hoc Internal Window Clean"
                    price={priceText(display.forLabel('Ad Hoc Internal Window Clean'))}
                    loading={isLoading}
                  />
                )}

                {gutterClear && (
                  <PriceBreakdownItem
                    label="Ad Hoc Gutter Clearance"
                    price={priceText(display.forLabel('Ad Hoc Gutter Clearance'))}
                    loading={isLoading}
                  />
                )}

                {fasciaClean && (
                  <PriceBreakdownItem
                    label="Ad Hoc Fascia Cleaning"
                    price={priceText(display.forLabel('Ad Hoc Fascia Soffit & Gutter Clean'))}
                    loading={isLoading}
                  />
                )}

                {conservatoryRoofCleanExternal && (
                  <PriceBreakdownItem
                    label="Ad Hoc Conservatory Roof Clean - External"
                    price={priceText(display.forLabel(EXT_CONSERVATORY_ROOF_LABEL))}
                    loading={isLoading}
                  />
                )}

                {conservatoryRoofCleanInternal && (
                  <PriceBreakdownItem
                    label="Ad Hoc Conservatory Roof Clean - Internal"
                    price={priceText(display.forLabel(INT_CONSERVATORY_ROOF_LABEL))}
                    loading={isLoading}
                  />
                )}
              </div>
            </div>

            {/* From second cleaning - Only show for regular frequencies (not one-off) */}
            {frequency && !isOneOff && (
              <div className="mb-4 border-b border-line pb-4">
                <h4 className="text-sm font-semibold text-ink mb-3">From second cleaning</h4>
                <div className="space-y-2">
                  <PriceBreakdownItem
                    label="External Window Cleaning"
                    price={priceText(selectedFrequencyDisplay)}
                    loading={isLoading}
                  />
                </div>
              </div>
            )}

            {/* Total — the one figure the customer is actually deciding on */}
            <div className="rounded-lg bg-brand-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Total</div>
                  <div className="flex gap-6 mt-2">
                    <div>
                      {/* These two say which price is due today — they have to be readable, not decorative */}
                      <div className="text-sm text-ink-muted">First Clean</div>
                      <div
                        className={cn(
                          'font-bold text-brand-800',
                          // Words need a smaller size than the figure they stand in for:
                          // 'Priced on the visit' at text-3xl runs to three lines at 360px
                          totals.everyLineUnpriced ? 'text-xl' : 'text-3xl tabular-nums',
                        )}
                      >
                        {isLoading ? (
                          // Sized to the 3xl figure it stands in for, so the panel does
                          // not jump when the real total lands
                          <PriceSkeleton className="h-8 w-28" />
                        ) : (
                          firstCleanText(totals, firstCleanTotal)
                        )}
                      </div>
                    </div>
                    {frequency && !isOneOff && (
                      <div>
                        <div className="text-sm text-ink-muted">From second clean</div>
                        <div className="text-lg font-semibold tabular-nums text-ink">
                          {isLoading ? (
                            <PriceSkeleton className="h-5 w-16" />
                          ) : (
                            priceText(selectedFrequencyDisplay)
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* A figure that is not the whole job has to say so where the figure is
                      read. The rows above already carry "Price on visit", but the eye lands
                      on the big green number and the number does not include them. */}
                  {!isLoading && totals.someLinesUnpriced && (
                    <div className="mt-2 text-sm text-ink-muted">{unpricedNoteText(totals)}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/*
        The running total, pinned where the thumb already is. Tapping "8 Weeks" near the top
        of the phone used to change nothing but the row tint: the resulting figure rendered
        around 1300px further down a 2200px page, and the bottom of the screen was a disabled
        button with no number beside it. The full Price Breakdown card above is untouched —
        this bar summarises it, it does not replace it.

        -mx-5 cancels the px-5 of .gm-page-column so the bar spans the whole phone width.
      */}
      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-white px-5 py-3 shadow-[0_-4px_16px_-8px_rgb(16_40_26/0.25)]">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-ink-muted">First clean</div>

            {isLoading ? (
              <PriceSkeleton className="h-6 w-20" />
            ) : !frequency && !hasAnyAddon ? (
              // Nothing picked yet, so there is no total — and £0 is not one. The dash is
              // decorative; the words carry it for a screen reader, and the hint below the
              // button says what to do about it.
              <div className="text-lg font-bold text-ink-muted">
                <span aria-hidden>—</span>
                <span className="sr-only">No services selected yet</span>
              </div>
            ) : (
              <div
                className={cn(
                  'font-bold leading-tight text-brand-800',
                  // Same rule as the breakdown total: words instead of a figure when every
                  // picked line is quoted on the visit, at a size that fits beside the button
                  totals.everyLineUnpriced ? 'text-sm' : 'text-lg tabular-nums',
                )}
              >
                {firstCleanText(totals, firstCleanTotal)}
              </div>
            )}

            {/* The same statement as the breakdown's note, trimmed to the height this bar
                can afford — the services it names are one scroll away in the card above. */}
            {!isLoading && totals.someLinesUnpriced && (
              <div className="text-xs text-ink-muted">+ priced on the visit</div>
            )}
          </div>

          <Button
            className="shrink-0"
            type="button"
            disabled={!canSubmit}
            aria-describedby={disabledHint ? 'quote-submit-hint' : undefined}
            onClick={handleSubmit}
          >
            Book Now
          </Button>
        </div>

        {/* Not an error — the customer has done nothing wrong yet, so this reads as
            guidance rather than in the danger red of FieldError. One hardcoded line
            used to claim "choose something" even while every row was disabled by the
            price fetch, or already chosen but unpriceable. It travels with the button
            it explains rather than being left behind when the bar sticks. */}
        {disabledHint && (
          <p id="quote-submit-hint" className="mt-2 text-sm text-ink-muted">
            {disabledHint}
          </p>
        )}
      </div>
    </div>
  )
}