import { useState, useEffect, useRef, useMemo } from 'react'
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
  summariseSelection,
  unpricedNoteText,
  type SelectedLine,
} from './quoteTotals'
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
        // cn(), not concatenation, so a caller can size the shimmer to the type it replaces.
        // bg-skeleton, not brand-100: brand-100 is 1.16:1 on white and animate-pulse halves
        // it again, so a loading step read as a blank broken screen rather than a busy one.
        className={cn('inline-block h-4 w-12 animate-pulse rounded bg-skeleton align-middle', className)}
        // An aria-label on a bare <span> has no role to attach to and is not reliably
        // exposed; role=status gives it one and names the wait.
        role="status"
        aria-label="Loading price"
      />
    )
  }
  return <span className={className}>{display.text}</span>
}

/**
 * One add-on row. Presentation only — the parent still owns every toggle, and `display`
 * decides both the price shown and whether the row can be picked at all.
 */
function AddonRow({
  label,
  description,
  display,
  selected,
  onToggle,
}: {
  label: React.ReactNode
  description: React.ReactNode
  display: PriceDisplay
  selected: boolean
  onToggle: () => void
}) {
  const pickable = isSelectable(display)

  return (
    <button
      type="button"
      // An independent on/off switch, so aria-pressed — which is also what drives the
      // shared selected look in .gm-selectable
      aria-pressed={selected}
      disabled={!pickable}
      onClick={onToggle}
      // gm-selectable owns the border, radius, hover, selected and disabled states, so
      // this row is now the same weight of green as the frequency cards above it
      className="gm-selectable flex w-full items-start gap-3 px-4 py-3.5 text-left"
    >
      {/* A checkbox, not a tick alone — it reads as "you can turn this on" before it is on */}
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md border-2 transition-colors',
          !pickable
            ? 'border-line bg-white'
            : selected
              ? 'border-brand-600 bg-brand-600'
              : 'border-line-strong bg-white',
        )}
        aria-hidden
      >
        {selected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span
            className={cn(
              'font-semibold',
              // A row we cannot price goes muted, never faded: the label and the words
              // explaining why it cannot be picked both have to stay readable
              !pickable ? 'text-ink-muted' : selected ? 'text-brand-900' : 'text-ink',
            )}
          >
            {label}
          </span>
          {/* Only a real price earns the heavy brand green. A row the API declined to
              price would otherwise render "Price on request" louder than the label it
              belongs to, on a row that is muted and disabled everywhere else. */}
          <Price
            display={display}
            className={cn('flex-none font-bold', pickable ? 'text-brand-800' : 'font-medium text-ink-muted')}
          />
        </span>
        <span className="mt-1 block text-sm text-ink-muted">{description}</span>
      </span>
    </button>
  )
}

/**
 * One line of the price breakdown.
 *
 * The sticky card is a third of a grid that starts at 768px, so the label is the widest
 * thing on the screen with the least room. min-w-0 lets it shrink and wrap instead of
 * shouldering the price out, and flex-wrap drops the price under the label when even the
 * shrunk label needs the whole line — either way nothing escapes the card's border.
 */
function BreakdownRow({ label, display }: { label: string; display: PriceDisplay }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
      <span className="min-w-0 text-ink">{label}</span>
      <Price display={display} className="flex-none font-semibold text-ink" />
    </div>
  )
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

  /**
   * Every line the customer actually picked, read from the same `display` slots the
   * breakdown rows render — so the total can never claim something the rows above it
   * contradict. No price is recomputed here; the slots are only inspected.
   *
   * `shortName` is the wording for the on-visit note, where a full row label would read
   * as a second heading rather than as a footnote.
   */
  const selectedLines: SelectedLine[] = []
  if (frequency) {
    selectedLines.push({ display: selectedFrequencyDisplay, shortName: SHORT_NAME.frequency })
  }
  if (adHocInternalClean) {
    selectedLines.push({ display: display.forLabel('Ad Hoc Internal Window Clean'), shortName: SHORT_NAME.internal })
  }
  if (gutterClear) {
    selectedLines.push({ display: display.forLabel('Ad Hoc Gutter Clearance'), shortName: SHORT_NAME.gutter })
  }
  if (fasciaClean) {
    selectedLines.push({ display: display.forLabel('Ad Hoc Fascia Soffit & Gutter Clean'), shortName: SHORT_NAME.fascia })
  }
  if (conservatoryRoofCleanExternal) {
    selectedLines.push({ display: display.forLabel(EXT_CONSERVATORY_ROOF_LABEL), shortName: SHORT_NAME.conservatoryExternal })
  }
  if (conservatoryRoofCleanInternal) {
    selectedLines.push({ display: display.forLabel(INT_CONSERVATORY_ROOF_LABEL), shortName: SHORT_NAME.conservatoryInternal })
  }

  const totals = summariseSelection(selectedLines)

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
   * A disabled primary button with nothing beside it is a dead end — the customer can see
   * they cannot continue but not what to do about it. Read-only: this only names the
   * condition `canSubmit` already failed on, it never decides anything.
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

  return (
    <div className="w-full">
      {/* The step title the mobile twin already has. Without it this screen opened on two
          peer h2s and no h3 layer, so the outline inverted at the 768px breakpoint. */}
      <h2 className="mb-6 text-xl md:text-2xl font-semibold text-brand-800">
        Please select the services you want to go ahead with
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left side - 2/3 width */}
        <div className="md:col-span-2 space-y-10">
          <div>
            {/* A service under the step title, so h3 — same level as the mobile twin's
                per-service headings. The id still labels the radiogroup below. */}
            <h3 id="frequency-heading" className="text-base font-semibold text-ink">
              External Window Cleaning Frequency
            </h3>
            <div className="mt-2 mb-4 text-sm text-ink-muted">
              All frames, sills and glass are included
            </div>
            {/* While the fetch is in flight every card below is disabled, which on its own
                reads as "unavailable" rather than "not yet". The button hint at the foot of
                the page says the same thing, but nobody is looking there yet. */}
            {priceStatus === 'loading' && (
              <p className="mt-2 text-sm text-ink-muted">Working out your prices…</p>
            )}
            {/*
              Two-up until lg. This desktop layout starts at exactly 768px (useResponsive
              hands anything narrower to QuoteStepMobile), and four cards in two thirds of
              768px leaves ~48px of content box — not enough for "12 Weeks" and its price
              pill, which then ran out from under the tick badge.

              role="radiogroup" ties the four cards together as one set; without it a
              screen reader announces them as unrelated buttons.
            */}
            <div
              role="radiogroup"
              aria-labelledby="frequency-heading"
              className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6"
            >
              {[6, 8, 12, 'one-off'].map((val) => {
                const isSelected = frequency === val
                const currentFreq = val as 6 | 8 | 12 | 'one-off'
                const slot = display.forFrequency(currentFreq)
                const pickable = isSelectable(slot)

                // While loading the card itself is disabled, so it sits on bg-surface — the
                // pill goes white to give the skeleton a light ground to read against.
                // A card we cannot price goes neutral too, so a greyed card never carries a
                // pill that still looks live — muted ink on white is 6.1:1, so it stays read.
                const pillClass = isSelected
                  ? 'bg-brand-700 text-white'
                  : priceStatus === 'loading'
                    ? 'bg-white text-brand-800'
                    : pickable
                      ? 'bg-brand-100 text-brand-800'
                      : 'bg-white text-ink-muted'

                return (
                  <button
                    key={val}
                    type="button"
                    // One choice out of four, so role=radio + aria-checked — which is also
                    // what drives the shared selected look in .gm-selectable
                    role="radio"
                    aria-checked={isSelected}
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
                    className={cn(
                      // gm-selectable owns the border, radius, hover, selected and
                      // disabled states — this call site adds only its own layout
                      'gm-selectable flex min-h-[140px] flex-col justify-between p-4 text-left lg:p-6',
                      pickable && 'hover:-translate-y-0.5 hover:shadow-card',
                      isSelected && 'shadow-card',
                    )}
                  >
                    {/* Tick badge — the choice must not rest on colour alone */}
                    <span
                      className={cn(
                        'absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full',
                        'transition-[opacity,transform] duration-150',
                        isSelected ? 'scale-100 bg-brand-600 opacity-100' : 'scale-75 opacity-0',
                      )}
                      aria-hidden
                    >
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    </span>

                    <div
                      className={cn(
                        // text-base, not sm:text-lg — "12 Weeks" cannot wrap, and at the
                        // 768px start of this layout the larger size no longer fits
                        'whitespace-nowrap text-base font-bold leading-tight tracking-tight',
                        !pickable ? 'text-ink-muted' : isSelected ? 'text-brand-900' : 'text-ink',
                      )}
                    >
                      {frequencyCardLabel(currentFreq)}
                    </div>
                    <div className={cn('mt-4 inline-block rounded-lg px-4 py-2 text-sm font-bold', pillClass)}>
                      <Price display={slot} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            {/* A peer of the frequency section, so the same h3 sub-heading recipe */}
            <h3 className="text-base font-semibold text-ink">One Time Add-ons</h3>
            {/* Same reason as the frequency section: explain the grey where it is showing */}
            {priceStatus === 'loading' && (
              <p className="mt-2 text-sm text-ink-muted">Working out your prices…</p>
            )}
            <div className="mt-4 grid grid-cols-1 gap-4">
              <AddonRow
                label="Ad Hoc Internal Window Clean"
                description="Traditional window cleaning internally"
                display={display.forLabel('Ad Hoc Internal Window Clean')}
                selected={adHocInternalClean}
                onToggle={() => setAdHocInternalClean(!adHocInternalClean)}
              />

              <AddonRow
                label="Ad Hoc Gutter Clearance"
                description="Removal of debris and blockages from guttering"
                display={display.forLabel('Ad Hoc Gutter Clearance')}
                selected={gutterClear}
                onToggle={() => setGutterClear(!gutterClear)}
              />

              <AddonRow
                label={'Ad Hoc Fascia Soffit & Gutter Clean'}
                description="Cleaning of the external face"
                display={display.forLabel('Ad Hoc Fascia Soffit & Gutter Clean')}
                selected={fasciaClean}
                onToggle={() => setFasciaClean(!fasciaClean)}
              />

              {hasConservatory === 'yes' && (
                <AddonRow
                  label="Ad Hoc Conservatory Roof Clean - External"
                  description={CONSERVATORY_ROOF_PRICE_SUBTEXT}
                  display={display.forLabel(EXT_CONSERVATORY_ROOF_LABEL)}
                  selected={conservatoryRoofCleanExternal}
                  onToggle={() => setConservatoryRoofCleanExternal(!conservatoryRoofCleanExternal)}
                />
              )}

              {hasConservatory === 'yes' && (
                <AddonRow
                  label="Ad Hoc Conservatory Roof Clean - Internal"
                  description={CONSERVATORY_ROOF_PRICE_SUBTEXT}
                  display={display.forLabel(INT_CONSERVATORY_ROOF_LABEL)}
                  selected={conservatoryRoofCleanInternal}
                  onToggle={() => setConservatoryRoofCleanInternal(!conservatoryRoofCleanInternal)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Right side - 1/3 width */}
        <div className="md:col-span-1">
          <div className="gm-card sticky top-4 p-6">
            <h3 className="mb-4 text-base font-semibold text-ink">Price Breakdown</h3>

            {/* On arrival nothing is picked, so every block below is suppressed and the
                panel was a lone heading over a dead button. The heading always gets a body. */}
            {!frequency && !hasAnyAddon && (
              <p className="text-sm text-ink-muted">Pick a frequency or an add-on and your price appears here.</p>
            )}

            {/* First Cleaning - Show when frequency or addons are selected */}
            {(frequency || hasAnyAddon) && (
              <div className="mb-6 border-b border-line pb-4">
                <h4 className="mb-3 text-base font-semibold text-ink">First Cleaning</h4>
                <div className="space-y-2">
                  {frequency && (
                    <BreakdownRow label="External Window Cleaning" display={selectedFrequencyDisplay} />
                  )}

                  {adHocInternalClean && (
                    <BreakdownRow
                      label="Ad Hoc Internal Window Clean"
                      display={display.forLabel('Ad Hoc Internal Window Clean')}
                    />
                  )}

                  {gutterClear && (
                    <BreakdownRow
                      label="Ad Hoc Gutter Clearance"
                      display={display.forLabel('Ad Hoc Gutter Clearance')}
                    />
                  )}

                  {fasciaClean && (
                    <BreakdownRow
                      label="Ad Hoc Fascia Cleaning"
                      display={display.forLabel('Ad Hoc Fascia Soffit & Gutter Clean')}
                    />
                  )}

                  {conservatoryRoofCleanExternal && (
                    <BreakdownRow
                      label="Ad Hoc Conservatory Roof Clean - External"
                      display={display.forLabel(EXT_CONSERVATORY_ROOF_LABEL)}
                    />
                  )}

                  {conservatoryRoofCleanInternal && (
                    <BreakdownRow
                      label="Ad Hoc Conservatory Roof Clean - Internal"
                      display={display.forLabel(INT_CONSERVATORY_ROOF_LABEL)}
                    />
                  )}
                </div>
              </div>
            )}

            {/* From second cleaning - Only show for regular frequencies (not one-off) */}
            {frequency && !isOneOff && (
              <div className="mb-6 border-b border-line pb-4">
                <h4 className="mb-3 text-base font-semibold text-ink">From second cleaning</h4>
                <div className="space-y-2">
                  <BreakdownRow label="External Window Cleaning" display={selectedFrequencyDisplay} />
                </div>
              </div>
            )}

            {/* Total - Show when frequency is selected or when addons are selected */}
            {(frequency || gutterClear || fasciaClean || conservatoryRoofCleanExternal || conservatoryRoofCleanInternal || adHocInternalClean) && (
              <div className="border-t border-line pt-4">
                {/* The one figure the customer came for — tinted so the eye lands here first */}
                <div className="rounded-lg bg-brand-50 p-4">
                  <div className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Total</div>
                  <div className="flex flex-wrap gap-6 mt-2">
                    <div>
                      {/* Which price the customer pays today — ink-muted, not ink-subtle:
                          these two words are the whole point of the block */}
                      <div className="text-sm text-ink-muted">First Clean</div>
                      <div
                        className={cn(
                          'font-bold text-brand-800',
                          // Words, not a figure — at 2xl "Priced on the visit" is three
                          // lines in a third-width card
                          totals.everyLineUnpriced ? 'text-lg' : 'text-2xl',
                        )}
                      >
                        {priceStatus === 'loading' ? (
                          <Price display={{ kind: 'loading' }} className="h-7 w-20" />
                        ) : totals.everyLineUnpriced ? (
                          // Every row the customer picked is quoted on the visit, so
                          // firstCleanTotal is 0. Printed as "£0" — the largest, greenest
                          // figure on the page, above an enabled Book Now — that told them
                          // the booking was free.
                          totals.totalText
                        ) : (
                          // A sum of distinct returned prices, not a re-derivation of
                          // one — and deliberately not rounded, so the total is exactly
                          // the sum of the *priced* lines above it. Anything quoted on the
                          // visit is missing from it, and named in the note below.
                          `£${firstCleanTotal}`
                        )}
                      </div>
                    </div>
                    {frequency && !isOneOff && (
                      <div>
                        <div className="text-sm text-ink-muted">From second clean</div>
                        <Price
                          display={selectedFrequencyDisplay}
                          className="text-xl font-bold text-ink"
                        />
                      </div>
                    )}
                  </div>

                  {/* Names what the figure above leaves out. Full width under both columns
                      rather than tucked inside the First Clean one: this card is a third of
                      the grid, and a sentence squeezed into one column would force "From
                      second clean" onto its own line for everyone who sees it. */}
                  {totals.someLinesUnpriced && (
                    <p className="mt-2 text-sm text-ink-muted">{unpricedNoteText(totals)}</p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6">
              <Button
                className="w-full"
                type="button"
                disabled={!canSubmit}
                aria-describedby={disabledHint ? 'book-now-hint' : undefined}
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

              {/* Not an error — the customer has done nothing wrong yet, so this reads as
                  guidance rather than in the danger red of FieldError */}
              {disabledHint && (
                <p id="book-now-hint" className="mt-2 text-center text-sm text-ink-muted">
                  {disabledHint}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}