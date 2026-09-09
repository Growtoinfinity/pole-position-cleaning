import { useState, useEffect, useRef, useMemo, memo } from 'react'
import { Check } from 'lucide-react'
import Button from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  EXT_CONSERVATORY_ROOF_LABEL,
  FASCIA_SOFFIT_LABEL,
  FREQUENCIES,
  GUTTER_CLEARANCE_LABEL,
  INT_CONSERVATORY_ROOF_LABEL,
  frequencyLabel,
  supportsUplifts,
  type Frequency,
  type HouseKind,
} from '@/lib/costing-calc'
import { useCostingStore, type PriceStatus } from '@/stores/costingStore'
import type { PriceTable } from '@/lib/pricing'
import { isHidden, isSelectable, usePriceDisplay, valueOf, type PriceDisplay } from './usePriceDisplay'
import {
  ADDON_DESCRIPTION,
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

/** Structurally the desktop twin's `QuoteStepValues` — StepRenderer feeds both one object. */
export type QuoteStepMobileValues = {
  frequency: Frequency | null
  addons: {
    gutterClear: boolean
    fasciaClean: boolean
    /**
     * Two separate services with two separate CRM fields, taken independently. They always
     * return the same price as each other, which is the price sheet's doing (§4) and not a
     * reason to collapse them into one flag.
     */
    conservatoryRoofCleanExternal: boolean
    conservatoryRoofCleanInternal: boolean
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
 * is coming", which is what is actually true. bg-skeleton (1.75:1 above the card) rather
 * than a brand wash — at a lower contrast the placeholder disappears into the card and a
 * screen of pending rows reads as a blank, broken page.
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

  // wwe-selectable carries the border, radius, hover, focus, selected and disabled
  // states shared with the desktop cards — this row adds only its own layout
  const rowClass = 'wwe-selectable flex w-full items-start justify-between gap-3 px-4 py-3 text-left'

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
            // text-on-brand, never text-white: the tick sits on a solid teal fill, where
            // white is 3.4:1 and the deep green is 8.3:1
            isSelected && 'border-brand-400 bg-brand-400 text-on-brand',
            // Unticked, the badge is a recessed well rather than a raised chip: bg-surface
            // sits below the card this row is drawn on, so the ring reads as "not yet on"
            !isSelected && (disabled ? 'border-line bg-surface' : 'border-line-strong bg-surface'),
          )}
          aria-hidden
        >
          {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
        <span
          className={cn(
            'text-sm',
            // Unavailable rows recolour instead of fading, so the label and the
            // price both stay readable — see the note beside .wwe-selectable
            disabled
              ? 'font-medium text-ink-muted'
              : isSelected
                ? 'font-semibold text-ink'
                : 'font-medium text-ink',
          )}
        >
          {label}
        </span>
      </span>
      <span
        className={cn(
          'shrink-0 text-sm font-bold tabular-nums',
          // brand-300 reads on both grounds this row takes: 8.5:1 on the card it sits on
          // unselected, 5.5:1 on the brand-800 fill it takes once picked
          disabled ? 'text-ink-muted' : 'text-brand-300',
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
  const [conservatoryRoofCleanInternal, setConservatoryRoofCleanInternal] = useState<boolean>(
    initialValues?.addons?.conservatoryRoofCleanInternal ?? false
  )

  // No fallback argument: there is no local price book to fall back to. A slot the API
  // could not price reads "Price on request" and cannot be selected — see costing-calc.ts.
  const display = usePriceDisplay({ priceStatus, priceTable })

  // One lookup per add-on, reused by the row, the breakdown and the submit gate, so the
  // three can never disagree about what a service costs or whether it can be picked.
  // Looked up by label, which resolves to a serviceKey — never by position in the
  // response, whose order is the config's and leads with the derived services (§3).
  const gutterDisplay = display.forLabel(GUTTER_CLEARANCE_LABEL)
  const fasciaDisplay = display.forLabel(FASCIA_SOFFIT_LABEL)
  const conservatoryRoofExtDisplay = display.forLabel(EXT_CONSERVATORY_ROOF_LABEL)
  const conservatoryRoofIntDisplay = display.forLabel(INT_CONSERVATORY_ROOF_LABEL)

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
   * A flat loses all four: gutters, fascia and both roof cleans have no `Flat` row in
   * their tables and answer `not_applicable` permanently (§8). A townhouse now keeps
   * gutter and fascia, because every table carries a `Town house` row identical to its
   * `Terraced` one (§5) — it used to be refused them.
   *
   * The two roof rows keep a gate of their own because they turn on the customer's own
   * answer rather than on the catalogue: with the conservatory answer anything but yes the
   * API drops both keys and returns the this-turn flavour of `not_applicable` (§8b), which
   * would hide them anyway — but the gate spares a customer with no conservatory a pair of
   * skeleton rows that vanish a moment later. supportsUplifts covers the case where "yes"
   * was answered for a house and the property was then changed to a flat.
   *
   * Same four expressions as the desktop twin.
   */
  const showGutter = !isHidden(gutterDisplay)
  const showFascia = !isHidden(fasciaDisplay)
  const conservatoryAnswered = hasConservatory === 'yes' && supportsUplifts(propertyKind)
  const showRoofExternal = conservatoryAnswered && !isHidden(conservatoryRoofExtDisplay)
  const showRoofInternal = conservatoryAnswered && !isHidden(conservatoryRoofIntDisplay)

  /**
   * How many add-on rows the block below will actually render, and therefore whether it
   * exists at all. Counted from the rows themselves rather than from the property, so the
   * heading cannot say "Add-ons" over a single row and a flat — offered none of them —
   * loses the whole block instead of keeping a heading over an empty box.
   */
  const addonRowCount = [showGutter, showFascia, showRoofExternal, showRoofInternal].filter(
    Boolean,
  ).length
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
    if (!showRoofExternal && conservatoryRoofCleanExternal) {
      setConservatoryRoofCleanExternal(false)
    }
    if (!showRoofInternal && conservatoryRoofCleanInternal) {
      setConservatoryRoofCleanInternal(false)
    }
  }, [
    showGutter,
    showFascia,
    showRoofExternal,
    showRoofInternal,
    gutterClear,
    fasciaClean,
    conservatoryRoofCleanExternal,
    conservatoryRoofCleanInternal,
  ])


  // Update costing context when frequency or addons change
  // Using a ref to prevent infinite loops
  const prevFrequencyRef = useRef(frequency);

  // Memoize the current addons object to prevent unnecessary recalculations
  const currentAddons = useMemo(() => ({
    gutterClear,
    fasciaClean,
    conservatoryRoofCleanExternal,
    conservatoryRoofCleanInternal
  }), [
    gutterClear,
    fasciaClean,
    conservatoryRoofCleanExternal,
    conservatoryRoofCleanInternal
  ]);

  const prevAddonsRef = useRef(currentAddons);

  useEffect(() => {
    // Only update if frequency has actually changed
    if (frequency !== prevFrequencyRef.current) {
      prevFrequencyRef.current = frequency;
      if (frequency) {
        setFrequencyInStore(frequency);
      }
    }

    // Identity is the comparison, not a field-by-field diff — the same rule the desktop
    // twin follows. `currentAddons` is memoised on the flags themselves, so a new object
    // *is* a real change, and the check cannot silently stop noticing an add-on the way
    // the hand-written comparison this replaces could: that one listed three flags and had
    // to be remembered when the catalogue gained the internal roof clean.
    if (prevAddonsRef.current !== currentAddons) {
      prevAddonsRef.current = currentAddons;
      setAddonsInStore(currentAddons);
    }
  }, [frequency, currentAddons, setFrequencyInStore, setAddonsInStore]);

  /**
   * The external-window row for whatever frequency is selected — used in the breakdown.
   *
   * The fallback is never rendered: every use of this slot sits behind a `frequency`
   * check. It is 6, the shorter of the two cycles this client sells — 4-weekly and
   * 8-weekly do not exist in this catalogue at all (§4).
   */
  const selectedFrequencyDisplay = display.forFrequency(frequency ?? 6)

  // Check if at least one addon is selected
  const hasAnyAddon =
    gutterClear ||
    fasciaClean ||
    conservatoryRoofCleanExternal ||
    conservatoryRoofCleanInternal;

  /**
   * "From second cleaning" is the first clean with the one-off add-ons dropped away, so
   * with no add-on selected it is not a second figure at all — it repeated the window
   * price under a second name, and the total repeated the pair again. A flat, which is
   * offered no add-ons, saw one number printed four times under two headings.
   */
  const showSecondClean = frequency !== null && hasAnyAddon

  /**
   * The lines the breakdown below is already listing, each with a short customer-facing
   * name. Read straight off the same PriceDisplay slots those rows render — this adds no
   * second price lookup and no arithmetic of its own.
   *
   * Built here, above the submit gate, rather than below it: the gate used to test each
   * flag by hand, which is one more list to remember to extend every time the catalogue
   * gains a service. Both screens now read this one list for the same three jobs — the
   * gate, the total and the note naming what the total leaves out.
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
      display: conservatoryRoofExtDisplay,
    })
  }
  if (conservatoryRoofCleanInternal) {
    selectedLines.push({
      shortName: SHORT_NAME.conservatoryInternal,
      display: conservatoryRoofIntDisplay,
    })
  }

  /**
   * Nothing can be booked until every row the customer picked carries a price. Without
   * this the form would happily submit a quote whose total silently omits a row the API
   * declined to price.
   */
  const selectionIsPriced = selectedLines.every((line) => isSelectable(line.display))

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
   * First clean = every line the customer picked, summed from the SAME slots the rows
   * render. Deliberately not a snapshot held in state: one taken before the price table
   * landed stayed at 0 while the rows around it showed real prices, and printed "£0" as
   * the headline figure. A row we could not price contributes nothing.
   *
   * Both conservatory roof rows are summed at their own returned price. They come back
   * equal to each other, and adding them is adding two services, not double-counting one.
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
          <h2 className="text-xl md:text-2xl font-semibold text-ink mb-6">
            Please select the services you want to go ahead with
          </h2>

          {/* External Window Cleaning */}
          <div className="mb-8">
            <h3 className="text-base font-semibold text-ink mb-2">External Window Cleaning</h3>
            <p className="text-sm text-ink-muted mb-4">All frames, sills and glass are included</p>

            {/* One frequency at a time, so the rows are announced as a single set */}
            <div className="space-y-3" role="radiogroup" aria-label="External window cleaning frequency">
              {/* Driven by FREQUENCIES so the two screens offer the same set — a hand-written
                  list here is how rows the catalogue no longer sells outlive the product.
                  This client sells 6 and 12 weekly; there is no 8-weekly service (§4). */}
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

            Every row here can be dropped by the table, and a flat drops all four, so the
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
                    <p className="mt-1.5 text-sm text-ink-muted">{ADDON_DESCRIPTION.gutter}</p>
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
                    <p className="mt-1.5 text-sm text-ink-muted">{ADDON_DESCRIPTION.fascia}</p>
                  </div>
                )}

                {/* The two conservatory roof cleans — last among add-ons and in this order,
                    as on desktop. They price the same as each other (§4), so keeping them
                    adjacent makes the matching figures read as the two sides of one roof
                    rather than as a row rendered twice. */}
                {showRoofExternal && (
                  <div>
                    <OptionButton
                      isSelected={conservatoryRoofCleanExternal}
                      onClick={() => setConservatoryRoofCleanExternal(!conservatoryRoofCleanExternal)}
                      label={EXT_CONSERVATORY_ROOF_LABEL}
                      price={priceText(conservatoryRoofExtDisplay)}
                      loading={isLoading}
                      disabled={!isSelectable(conservatoryRoofExtDisplay)}
                    />
                    <p className="mt-1.5 text-sm text-ink-muted">
                      {ADDON_DESCRIPTION.conservatoryExternal}
                    </p>
                  </div>
                )}

                {showRoofInternal && (
                  <div>
                    <OptionButton
                      isSelected={conservatoryRoofCleanInternal}
                      onClick={() => setConservatoryRoofCleanInternal(!conservatoryRoofCleanInternal)}
                      label={INT_CONSERVATORY_ROOF_LABEL}
                      price={priceText(conservatoryRoofIntDisplay)}
                      loading={isLoading}
                      disabled={!isSelectable(conservatoryRoofIntDisplay)}
                    />
                    <p className="mt-1.5 text-sm text-ink-muted">
                      {ADDON_DESCRIPTION.conservatoryInternal}
                    </p>
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
        <div className="wwe-card p-5">
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
                    price={priceText(conservatoryRoofExtDisplay)}
                    loading={isLoading}
                  />
                )}

                {conservatoryRoofCleanInternal && (
                  <PriceBreakdownItem
                    label={INT_CONSERVATORY_ROOF_LABEL}
                    price={priceText(conservatoryRoofIntDisplay)}
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
            <div className="rounded-lg bg-brand-900 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Total</div>
                  <div className="flex gap-6 mt-2">
                    <div>
                      {/* These two say which price is due today — they have to be readable, not decorative */}
                      <div className="text-sm text-ink-muted">First Clean</div>
                      <div
                        className={cn(
                          'font-bold text-brand-300',
                          // Words need a smaller size than the figure they stand in for:
                          // 'Price on request' at text-3xl wraps at 360px
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
                      read. The rows above already carry "Price on request", but the eye
                      lands on the big green number and the number does not include them. */}
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
        The running total, pinned where the thumb already is. Tapping "12 Weekly" near the top
        of the phone used to change nothing but the row tint: the resulting figure rendered
        around 1300px further down a 2200px page, and the bottom of the screen was a disabled
        button with no number beside it. The full Price Breakdown card above is untouched —
        this bar summarises it, it does not replace it.

        -mx-5 cancels the px-5 of .wwe-page-column so the bar spans the whole phone width.

        The fill has to be solid and it has to be the card's, not the page's: the bar sits
        over scrolling content, and on this theme a shadow cannot lift anything off a
        near-black page — the lighter fill plus the top border are what separate it, the
        same way .wwe-card separates from the page. The old upward shadow was a translucent
        light-theme green that painted nothing here, so it goes.
      */}
      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-card px-5 py-3">
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
                  'font-bold leading-tight text-brand-300',
                  // Same rule as the breakdown total: words instead of a figure when no
                  // picked line carries a price, at a size that fits beside the button
                  totals.everyLineUnpriced ? 'text-sm' : 'text-lg tabular-nums',
                )}
              >
                {firstCleanText(totals, firstCleanTotal)}
              </div>
            )}

            {/* Word for word the breakdown card's note. It used to be condensed to
                `totals.phrase` alone — "+ priced on request" — which named no service,
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
