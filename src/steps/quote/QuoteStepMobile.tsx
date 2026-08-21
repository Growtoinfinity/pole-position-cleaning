import { useState, useEffect, useRef, useMemo, memo } from 'react'
import { Check } from 'lucide-react'
import Button from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  EXT_CONSERVATORY_ROOF_LABEL,
  FASCIA_SOFFIT_LABEL,
  FREQUENCIES,
  GUTTER_CLEARANCE_LABEL,
  frequencyLabel,
  supportsUplifts,
  type Frequency,
  type HouseKind,
} from '@/lib/costing-calc'
import { CONSERVATORY_ROOF_PRICE_SUBTEXT } from '@/lib/conservatory-roof-copy'
import { useCostingStore, type PriceStatus } from '@/stores/costingStore'
import type { PriceTable } from '@/lib/pricing'
import { isHidden, isSelectable, usePriceDisplay, valueOf, type PriceDisplay } from './usePriceDisplay'
import {
  SHORT_NAME,
  addonSectionHeading,
  emptyBreakdownText,
  firstCleanText,
  nothingSelectedHint,
  summariseSelection,
  unpricedNoteText,
  type SelectedLine,
} from './quoteTotals'
import type { YesNo } from '@/types'

export type QuoteStepMobileValues = {
  frequency: Frequency | null
  addons: {
    gutterClear: boolean
    fasciaClean: boolean
    conservatoryRoofCleanExternal: boolean
  }
}

type Props = {
  initialValues?: Partial<QuoteStepMobileValues>
  onSubmit: (values: QuoteStepMobileValues) => void
  propertyKind: HouseKind
  hasConservatory?: YesNo
  priceStatus: PriceStatus
  priceTable: PriceTable | null
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
  // loading renders a skeleton instead; not_applicable rows are dropped by their caller
  if (display.kind === 'loading' || display.kind === 'not_applicable') return ''
  return display.text
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
  propertyKind,
  hasConservatory,
  priceStatus,
  priceTable,
}: Props) {
  const setFrequencyInStore = useCostingStore((s) => s.setFrequency)
  const setAddonsInStore = useCostingStore((s) => s.setAddons)

  const [frequency, setFrequency] = useState<Frequency | null>(initialValues?.frequency ?? null)
  const [gutterClear, setGutterClear] = useState<boolean>(initialValues?.addons?.gutterClear ?? false)
  const [fasciaClean, setFasciaClean] = useState<boolean>(initialValues?.addons?.fasciaClean ?? false)
  const [conservatoryRoofCleanExternal, setConservatoryRoofCleanExternal] = useState<boolean>(
    initialValues?.addons?.conservatoryRoofCleanExternal ?? false
  )

  // No fallback argument: there is no local price book to fall back to. A slot the API
  // could not price reads "Price on request" and cannot be selected — see costing-calc.ts.
  const display = usePriceDisplay({ priceStatus, priceTable })

  // One lookup per add-on, reused by the row, the breakdown and the submit gate, so the
  // three can never disagree about what a service costs or whether it can be picked.
  const gutterDisplay = display.forLabel(GUTTER_CLEARANCE_LABEL)
  const fasciaDisplay = display.forLabel(FASCIA_SOFFIT_LABEL)
  const conservatoryRoofDisplay = display.forLabel(EXT_CONSERVATORY_ROOF_LABEL)

  /**
   * Which add-on rows this property is actually offered — read off the price table, not
   * off a list of house types kept here. The API answers `not_applicable` for a service
   * that can never apply to this property (a flat has no gutters to clear, whatever else
   * it answers), and a row in that state is REMOVED: inviting an enquiry for something
   * that will never be sold wastes the customer's time and ours.
   *
   * While the fetch is in flight nothing is known yet, so every slot is `loading`, every
   * row renders as a skeleton, and the ones that do not apply disappear when the answer
   * says so — rather than the screen opening empty and growing rows under the thumb.
   *
   * The roof row keeps a gate of its own because it turns on the customer's own answer,
   * not on the catalogue: with no conservatory no panel count is sent, so the API replies
   * `missing_inputs` — a perfectly good answer that would still put a roof row in front
   * of someone who has no roof to clean. supportsUplifts covers the case where "yes" was
   * answered for a house and the property was then changed to a flat.
   *
   * Same three expressions as the desktop twin.
   */
  const showGutter = !isHidden(gutterDisplay)
  const showFascia = !isHidden(fasciaDisplay)
  const showRoofClean =
    hasConservatory === 'yes' &&
    supportsUplifts(propertyKind) &&
    !isHidden(conservatoryRoofDisplay)

  /**
   * How many add-on rows the block below will actually render, and therefore whether it
   * exists at all. Counted from the rows themselves rather than from the property, so the
   * heading cannot say "Add-ons" over a single row and a flat — offered none of them —
   * loses the whole block instead of keeping a heading over an empty box.
   */
  const addonRowCount = [showGutter, showFascia, showRoofClean].filter(Boolean).length
  const offersAnyAddon = addonRowCount > 0

  /**
   * A hidden row must not leave a selection alive underneath it. Coming back to this step
   * after changing the property, restoring saved answers into a property that no longer
   * supports the service, or a table that answers `not_applicable`, would otherwise put a
   * row the customer can neither see nor deselect into the breakdown, the total and the
   * submitted quote.
   */
  useEffect(() => {
    if (!showGutter && gutterClear) setGutterClear(false)
    if (!showFascia && fasciaClean) setFasciaClean(false)
    if (!showRoofClean && conservatoryRoofCleanExternal) {
      setConservatoryRoofCleanExternal(false)
    }
  }, [
    showGutter,
    showFascia,
    showRoofClean,
    gutterClear,
    fasciaClean,
    conservatoryRoofCleanExternal,
  ])


  // Update costing context when frequency or addons change
  // Using a ref to prevent infinite loops
  const prevFrequencyRef = useRef(frequency);
  const prevAddonsRef = useRef({
    gutterClear,
    fasciaClean,
    conservatoryRoofCleanExternal
  });

  // Memoize the current addons object to prevent unnecessary recalculations
  const currentAddons = useMemo(() => ({
    gutterClear,
    fasciaClean,
    conservatoryRoofCleanExternal
  }), [gutterClear, fasciaClean, conservatoryRoofCleanExternal]);

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
      prevAddons.conservatoryRoofCleanExternal !== conservatoryRoofCleanExternal;

    if (hasChanged) {
      prevAddonsRef.current = { ...currentAddons };
      setAddonsInStore(currentAddons);
    }
  }, [frequency, currentAddons, setFrequencyInStore, setAddonsInStore]);

  /** The external-window row for whatever frequency is selected — used in the breakdown. */
  const selectedFrequencyDisplay = display.forFrequency(frequency ?? 8)

  // Check if at least one addon is selected
  const hasAnyAddon = gutterClear || fasciaClean || conservatoryRoofCleanExternal;

  /**
   * "From second cleaning" is the first clean with the one-off add-ons dropped away, so
   * with no add-on selected it is not a second figure at all — it repeated the window
   * price under a second name, and the total repeated the pair again. A flat, which is
   * offered no add-ons, saw one number printed four times under two headings.
   */
  const showSecondClean = frequency !== null && hasAnyAddon

  /**
   * Nothing can be booked until every row the customer picked carries a price. Without
   * this the form would happily submit a quote whose total silently omits a row the API
   * declined to price.
   */
  const selectionIsPriced =
    (frequency === null || isSelectable(display.forFrequency(frequency))) &&
    (!gutterClear || isSelectable(gutterDisplay)) &&
    (!fasciaClean || isSelectable(fasciaDisplay)) &&
    (!conservatoryRoofCleanExternal || isSelectable(conservatoryRoofDisplay))

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
   * condition `canSubmit` already failed on, it never decides anything. The "nothing
   * picked" line comes from quoteTotals, so the two screens cannot say different things —
   * including the flat case, where neither may name an add-on.
   */
  // Loading is tested FIRST. On arrival nothing is selected AND the prices are
  // still in flight, so an "if nothing selected" branch placed above this one wins
  // at the only moment the loading message actually matters — telling the customer
  // to pick something while every row is disabled.
  //
  // This is also the ONLY place either screen words the wait — the desktop twin used to
  // print "Working out your prices…" over each section as well, so one state had two
  // phrasings on screen at once. The shimmering price slots say "not yet" without prose.
  const disabledHint = canSubmit
    ? null
    : priceStatus === 'loading'
      ? 'Just fetching your prices…'
      : frequency === null && !hasAnyAddon
        ? nothingSelectedHint(offersAnyAddon)
        : 'One of your choices needs a quote from us — deselect it to continue'

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit({
        frequency: frequency ?? null,
        addons: currentAddons
      })
    }
  }


  /**
   * The lines the breakdown below is already listing, each with a short customer-facing
   * name. Read straight off the same PriceDisplay slots those rows render — this adds no
   * second price lookup and no arithmetic of its own.
   */
  const selectedLines: SelectedLine[] = []
  if (frequency) {
    selectedLines.push({ shortName: SHORT_NAME.frequency, display: selectedFrequencyDisplay })
  }
  if (gutterClear) {
    selectedLines.push({ shortName: SHORT_NAME.gutter, display: gutterDisplay })
  }
  if (fasciaClean) {
    selectedLines.push({ shortName: SHORT_NAME.fascia, display: fasciaDisplay })
  }
  if (conservatoryRoofCleanExternal) {
    selectedLines.push({
      shortName: SHORT_NAME.conservatoryExternal,
      display: conservatoryRoofDisplay,
    })
  }

  /**
   * First clean = every line the customer picked, summed from the SAME slots the rows
   * render. Deliberately not a snapshot held in state: one taken before the price table
   * landed stayed at 0 while the rows around it showed real prices, and printed "£0" as
   * the headline figure. Rows priced on the visit contribute nothing.
   */
  const firstCleanTotal = selectedLines.reduce((sum, line) => sum + (valueOf(line.display) ?? 0), 0)

  const totals = summariseSelection(selectedLines)

  return (
    <div className="w-full">
      {/* Clearance for the sticky bar in its TALLEST state — total, the wrapped note naming
          the services the total leaves out, and the button hint — so the end of the card can
          always be scrolled clear of the bar rather than sitting under it. pb-28 was sized
          before the bar carried the full note and is now half a line short of it. */}
      <div className="space-y-8 pb-40">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-brand-800 mb-6">
            Please select the services you want to go ahead with
          </h2>

          {/* External Window Cleaning */}
          <div className="mb-8">
            <h3 className="text-base font-semibold text-ink mb-2">External Window Cleaning</h3>
            <p className="text-sm text-ink-muted mb-4">All frames, sills and glass are included</p>

            {/* One frequency at a time, so the rows are announced as a single set */}
            <div className="space-y-3" role="radiogroup" aria-label="External window cleaning frequency">
              {/* Driven by FREQUENCIES so the two screens offer the same set — a hand-written
                  list here is how the retired 6-weekly and one-off rows outlived the product */}
              {FREQUENCIES.map((value) => {
                const slot = display.forFrequency(value)

                return (
                  <OptionButton
                    key={value}
                    role="radio"
                    isSelected={frequency === value}
                    onClick={() => {
                      // Tapping the chosen row again clears it — add-ons alone are a valid booking
                      setFrequency(frequency === value ? null : value)
                    }}
                    label={frequencyLabel(value)}
                    price={priceText(slot)}
                    loading={isLoading}
                    disabled={!isSelectable(slot)}
                  />
                )
              })}
            </div>
          </div>

          {/*
            One block, one heading — the same grouping the desktop twin has. Each add-on
            used to carry its own h3, which at 360px left the outline a flat list of peers
            with nothing to say these are one-off extras rather than more frequency
            options. The per-service headings said little the row labels do not, so the
            row keeps its label and the description follows it as a footnote.

            Every row here can be dropped by the table, and a flat drops all three, so the
            whole block disappears with them — see `offersAnyAddon`, which the button hint
            reads too, rather than a heading left over an empty box.
          */}
          {offersAnyAddon && (
            <div className="mb-8">
              <h3 className="text-base font-semibold text-ink mb-4">
                {addonSectionHeading(addonRowCount)}
              </h3>

              <div className="space-y-4">
                {/* Full gutter clearance — shown until the table says it does not apply */}
                {showGutter && (
                  <div>
                    <OptionButton
                      isSelected={gutterClear}
                      onClick={() => setGutterClear(!gutterClear)}
                      label={GUTTER_CLEARANCE_LABEL}
                      price={priceText(gutterDisplay)}
                      loading={isLoading}
                      disabled={!isSelectable(gutterDisplay)}
                    />
                    <p className="mt-1.5 text-sm text-ink-muted">
                      Removal of debris and blockages from guttering
                    </p>
                  </div>
                )}

                {/* Fascia and soffit — dropped by the same answer as gutter clearance */}
                {showFascia && (
                  <div>
                    <OptionButton
                      isSelected={fasciaClean}
                      onClick={() => setFasciaClean(!fasciaClean)}
                      label={FASCIA_SOFFIT_LABEL}
                      price={priceText(fasciaDisplay)}
                      loading={isLoading}
                      disabled={!isSelectable(fasciaDisplay)}
                    />
                    <p className="mt-1.5 text-sm text-ink-muted">Cleaning of the external face</p>
                  </div>
                )}

                {/* Conservatory roof cleaning — last among add-ons, as on desktop */}
                {showRoofClean && (
                  <div>
                    <OptionButton
                      isSelected={conservatoryRoofCleanExternal}
                      onClick={() => setConservatoryRoofCleanExternal(!conservatoryRoofCleanExternal)}
                      label={EXT_CONSERVATORY_ROOF_LABEL}
                      price={priceText(conservatoryRoofDisplay)}
                      loading={isLoading}
                      disabled={!isSelectable(conservatoryRoofDisplay)}
                    />
                    <p className="mt-1.5 text-sm text-ink-muted">{CONSERVATORY_ROOF_PRICE_SUBTEXT}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/*
          The card is always rendered, so its heading always has a body — the same
          behaviour the desktop twin has, where the card cannot be dropped at all because
          it holds the Book Now button. This screen used to drop the whole card until the
          first tap and let the sticky bar's em-dash stand in for it, so the two screens
          answered "nothing picked yet" in two different ways.
        */}
        <div className="gm-card p-5">
          <h3 className="text-base font-semibold text-ink mb-4">Price Breakdown</h3>

          {/* Same sentence as the desktop card, from the same function */}
          {!frequency && !hasAnyAddon && (
            <p className="text-sm text-ink-muted">{emptyBreakdownText(offersAnyAddon)}</p>
          )}

          {/* First Cleaning */}
          {(frequency || hasAnyAddon) && (
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

                {gutterClear && (
                  <PriceBreakdownItem
                    label={GUTTER_CLEARANCE_LABEL}
                    price={priceText(gutterDisplay)}
                    loading={isLoading}
                  />
                )}

                {fasciaClean && (
                  <PriceBreakdownItem
                    label={FASCIA_SOFFIT_LABEL}
                    price={priceText(fasciaDisplay)}
                    loading={isLoading}
                  />
                )}

                {conservatoryRoofCleanExternal && (
                  <PriceBreakdownItem
                    label={EXT_CONSERVATORY_ROOF_LABEL}
                    price={priceText(conservatoryRoofDisplay)}
                    loading={isLoading}
                  />
                )}
              </div>
            </div>
          )}

          {/* Only worth its own block when the one-off add-ons make it a different
              figure — otherwise it reprints the line directly above it. */}
          {showSecondClean && (
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
          {(frequency || hasAnyAddon) && (
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
                    {/* Same gate as the block above: a second column that repeats the
                        first one is not a second figure, it is the same one twice */}
                    {showSecondClean && (
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
          )}
        </div>
      </div>

      {/*
        The running total, pinned where the thumb already is. Tapping "8 Weekly" near the top
        of the phone used to change nothing but the row tint: the resulting figure rendered
        around 1300px further down a 2200px page, and the bottom of the screen was a disabled
        button with no number beside it. The full Price Breakdown card above is untouched —
        this bar summarises it, it does not replace it.

        -mx-5 cancels the px-5 of .gm-page-column so the bar spans the whole phone width.
      */}
      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-white px-5 py-3 shadow-[0_-4px_16px_-8px_rgb(16_40_26/0.25)]">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-ink-muted">First Clean</div>

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

            {/* Word for word the breakdown card's note. It used to be condensed to
                `totals.phrase` alone — "+ priced on the visit" — which named no service,
                so the bar and the card described the same omission differently and the
                bar's version could not be checked against anything. */}
            {!isLoading && totals.someLinesUnpriced && (
              <div className="text-xs text-ink-muted">{unpricedNoteText(totals)}</div>
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
