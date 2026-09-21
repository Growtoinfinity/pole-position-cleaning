import { useState, useEffect, useRef, useMemo, memo } from 'react'
import { Check } from 'lucide-react'
import Button from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  EXT_CONSERVATORY_ROOF_LABEL,
  FASCIA_SOFFIT_LABEL,
  WINDOW_PLANS,
  GUTTER_CLEARANCE_LABEL,
  INT_CONSERVATORY_ROOF_LABEL,
  INT_WINDOW_ONEOFF_LABEL,
  isRecurringPlan,
  planLabel,
  supportsUplifts,
  type WindowPlan,
  type HouseKind,
} from '@/lib/costing-calc'
import { useCostingStore, type PriceStatus } from '@/stores/costingStore'
import { QUOTE_REQUEST_SERVICE, type PriceTable } from '@/lib/pricing'
import {
  isHidden,
  isSelectable,
  usePriceDisplay,
  valueOf,
  QUOTE_REQUEST_DISPLAY,
  type PriceDisplay,
} from './usePriceDisplay'
import {
  ADDON_DESCRIPTION,
  PLAN_DESCRIPTION,
  SHORT_NAME,
  QUOTE_REQUEST_SECTION,
  addonSectionHeading,
  emptyBreakdownText,
  firstCleanText,
  nothingSelectedHint,
  quoteRequestIntro,
  summariseSelection,
  unpricedNoteText,
  type SelectedLine,
} from './quoteTotals'
import type { YesNo } from '@/types'

/** Structurally the desktop twin's `QuoteStepValues` — StepRenderer feeds both one object. */
export type QuoteStepMobileValues = {
  plan: WindowPlan | null
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
    /** `int_window_oneoff` — the inside of the windows, tickable alongside any plan. */
    internalWindowClean: boolean
    /** A quote request rather than a purchase — it never contributes to a total. */
    pressureWashing: boolean
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
 * is coming", which is what is actually true. bg-skeleton (1.70:1 above the card) rather
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
  priceClassName,
}: {
  isSelected: boolean
  onClick: () => void
  label: string
  price: string
  /**
   * Overrides the price colour. Used only by the quote-request row: "We'll quote you" is
   * not a figure, and typesetting it in the same black as one is what made it read as a
   * price that failed to load. A plain string, not a PriceDisplay, so memo() still holds.
   */
  priceClassName?: string
  /**
   * Kept a plain boolean rather than passing the PriceDisplay object down: a priced slot
   * is a fresh object every render, which would defeat this component's memo().
   */
  loading?: boolean
  disabled?: boolean
  /**
   * Single-choice groups pass 'radio' so assistive tech announces the plan
   * rows as one set; the independent add-on toggles keep the button role. The
   * shared selected style keys off whichever attribute this picks, so the look
   * and the announcement can never drift apart.
   */
  role?: 'radio' | 'button'
}) {
  const isRadio = role === 'radio'

  // pp-selectable carries the border, radius, hover, focus, selected and disabled
  // states shared with the desktop cards — this row adds only its own layout
  const rowClass = 'pp-selectable flex w-full items-start justify-between gap-3 px-4 py-3 text-left'

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
            // The brand yellow is the "this one is on" fill, and it carries BLACK ink
            // (19.66:1). Its own edge on the card is 1.07:1 and invisible, so the badge
            // takes a brand-700 rim (7.18:1) — that rim is the 3:1 a control's boundary owes.
            isSelected && 'border-brand-700 bg-primary-400 text-on-brand',
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
            // price both stay readable — see the note beside .pp-selectable
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
          // A price is a figure the customer reads, not an accent: black on both grounds
          // this row takes — the white card unselected, the brand-50 tint once picked.
          // The brand blue at this size would be 3.35:1 and fails small text.
          disabled ? 'text-ink-muted' : 'text-ink-strong',
          priceClassName,
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
  const setPlanInStore = useCostingStore((s) => s.setPlan)
  const setAddonsInStore = useCostingStore((s) => s.setAddons)

  const [plan, setPlan] = useState<WindowPlan | null>(initialValues?.plan ?? null)
  const [gutterClear, setGutterClear] = useState<boolean>(initialValues?.addons?.gutterClear ?? false)
  const [fasciaClean, setFasciaClean] = useState<boolean>(initialValues?.addons?.fasciaClean ?? false)
  const [conservatoryRoofCleanExternal, setConservatoryRoofCleanExternal] = useState<boolean>(
    initialValues?.addons?.conservatoryRoofCleanExternal ?? false
  )
  const [conservatoryRoofCleanInternal, setConservatoryRoofCleanInternal] = useState<boolean>(
    initialValues?.addons?.conservatoryRoofCleanInternal ?? false
  )
  const [internalWindowClean, setInternalWindowClean] = useState<boolean>(
    initialValues?.addons?.internalWindowClean ?? false
  )
  const [pressureWashing, setPressureWashing] = useState<boolean>(
    initialValues?.addons?.pressureWashing ?? false
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
  // By key, not by label: `INT_WINDOW_ONEOFF_LABEL` ("Internal window clean") and
  // `INT_CONSERVATORY_ROOF_LABEL` are different strings today, but a label-keyed lookup
  // ties a price to wording, and these two are one edit away from colliding.
  const internalWindowDisplay = display.forServiceKey('int_window_oneoff')

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
  /** Offered to every property and gated by nothing — see the desktop twin for why. */
  /**
   * The inside of the windows. Offered to every property — it has no `Flat` row to be
   * missing from, unlike gutter and fascia — but still read off the table rather than
   * assumed, so an API that ever does decline it drops the row instead of showing a
   * dead one.
   */
  const showInternalWindow = !isHidden(internalWindowDisplay)

  /** Offered to every property and gated by nothing — see the desktop twin for why. */
  const showPressureWashing = true

  const addonRowCount = [
    showGutter,
    showFascia,
    showRoofExternal,
    showRoofInternal,
    showInternalWindow,
  ].filter(Boolean).length
  const offersAnyAddon = addonRowCount > 0

  /** The quote-request block, counted apart from the priced add-ons above it. */
  const quoteRequestRowCount = [showPressureWashing].filter(Boolean).length
  const offersQuoteRequest = quoteRequestRowCount > 0

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
    if (!showInternalWindow && internalWindowClean) setInternalWindowClean(false)
  }, [
    showGutter,
    showFascia,
    showRoofExternal,
    showRoofInternal,
    showInternalWindow,
    internalWindowClean,
    gutterClear,
    fasciaClean,
    conservatoryRoofCleanExternal,
    conservatoryRoofCleanInternal,
  ])


  // Update costing context when plan or addons change
  // Using a ref to prevent infinite loops
  const prevPlanRef = useRef(plan);

  // Memoize the current addons object to prevent unnecessary recalculations
  const currentAddons = useMemo(() => ({
    gutterClear,
    fasciaClean,
    conservatoryRoofCleanExternal,
    conservatoryRoofCleanInternal,
    internalWindowClean,
    pressureWashing
  }), [
    gutterClear,
    fasciaClean,
    conservatoryRoofCleanExternal,
    conservatoryRoofCleanInternal,
    internalWindowClean,
    pressureWashing
  ]);

  const prevAddonsRef = useRef(currentAddons);

  useEffect(() => {
    // Only update if plan has actually changed
    if (plan !== prevPlanRef.current) {
      prevPlanRef.current = plan;
      if (plan) {
        setPlanInStore(plan);
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
  }, [plan, currentAddons, setPlanInStore, setAddonsInStore]);

  /**
   * The external-window row for whatever plan is selected — used in the breakdown.
   *
   * The fallback is never rendered: every use of this slot sits behind a `plan`
   * check. It is 6, the shorter of the two cycles this client sells — 4-weekly and
   * 8-weekly do not exist in this catalogue at all (§4).
   */
  const selectedPlanDisplay = display.forPlan(plan ?? 4)

  // Check if at least one addon is selected
  const hasAnyAddon =
    gutterClear ||
    fasciaClean ||
    conservatoryRoofCleanExternal ||
    conservatoryRoofCleanInternal ||
    internalWindowClean ||
    pressureWashing;

  /**
   * "From second cleaning" is the first clean with the one-off add-ons dropped away, so
   * with no add-on selected it is not a second figure at all — it repeated the window
   * price under a second name, and the total repeated the pair again. A flat, which is
   * offered no add-ons, saw one number printed four times under two headings.
   *
   * PRICED add-ons, not any add-on — the same rule as the desktop twin. Pressure washing
   * contributes nothing to the first clean, so pairing it with a plan would make the
   * second-clean figure identical to the first.
   */
  const hasAnyPricedAddon =
    gutterClear ||
    fasciaClean ||
    conservatoryRoofCleanExternal ||
    conservatoryRoofCleanInternal ||
    internalWindowClean
  /**
   * A RECURRING plan, not merely a chosen one. A one-off has no second clean at all, so
   * this block would have printed "From second cleaning — £55.50" for a job that happens
   * exactly once, using the one-off's own price as the recurring figure.
   */
  const showSecondClean = isRecurringPlan(plan) && hasAnyPricedAddon

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
  if (plan) {
    selectedLines.push({ shortName: SHORT_NAME.frequency, display: selectedPlanDisplay })
  }
  // Add-ons in the order the section renders them, so the note under the total reads the
  // same way down as the rows the customer ticked.
  if (internalWindowClean) {
    selectedLines.push({ shortName: SHORT_NAME.internalWindow, display: internalWindowDisplay })
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
  // Carries no number, so it adds nothing to the total and everything to the note beneath
  // it — `summariseSelection` turns it into "+ pressure washing, priced on request".
  if (pressureWashing) {
    selectedLines.push({
      shortName: SHORT_NAME.pressureWashing,
      display: QUOTE_REQUEST_DISPLAY,
    })
  }

  /**
   * Nothing can be booked until every row the customer picked carries a price. Without
   * this the form would happily submit a quote whose total silently omits a row the API
   * declined to price.
   */
  const selectionIsPriced = selectedLines.every((line) => isSelectable(line.display))

  // Allow submission if plan is selected OR at least one addon is selected
  const canSubmit =
    priceStatus !== 'loading' && (plan !== null || hasAnyAddon) && selectionIsPriced

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
      : plan === null && !hasAnyAddon
        ? nothingSelectedHint(offersAnyAddon)
        : 'One of your choices needs a quote from us — deselect it to continue'

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit({
        plan: plan ?? null,
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
          {/* No colour class: the base layer sets every heading in black Oswald, and a
              local text-ink here only flattened it back towards the body copy. */}
          <h2 className="text-xl md:text-2xl font-semibold mb-6">
            Please select the services you want to go ahead with
          </h2>

          {/* External Window Cleaning */}
          <div className="mb-8">
            <h3 className="text-base font-semibold mb-2">External Window Cleaning</h3>
            <p className="text-sm text-ink-muted mb-4">All frames, sills and glass are included</p>

            {/* One plan at a time, so the rows are announced as a single set */}
            <div className="space-y-3" role="radiogroup" aria-label="External window cleaning plan">
              {/* Driven by WINDOW_PLANS so the two screens offer the same set — a
                  hand-written list here is how rows the catalogue no longer sells outlive
                  the product. Two cycles and the one-off: this client sells 4 and 8
                  weekly, and `ext_window_oneoff` is a plan rather than an add-on because
                  its own catalogue category says `window_cleaning` (§4). */}
              {WINDOW_PLANS.map((value) => {
                const slot = display.forPlan(value)

                return (
                  // Wrapped like the add-on rows below, so a described row reads the same
                  // on both: label, then the footnote under it.
                  <div key={value}>
                    <OptionButton
                      role="radio"
                      isSelected={plan === value}
                      onClick={() => {
                        // Tapping the chosen row again clears it — add-ons alone are a valid booking
                        setPlan(plan === value ? null : value)
                      }}
                      label={planLabel(value)}
                      price={priceText(slot)}
                      loading={isLoading}
                      disabled={!isSelectable(slot)}
                    />
                    {PLAN_DESCRIPTION[value] && (
                      <p className="mt-1.5 text-sm text-ink-muted">{PLAN_DESCRIPTION[value]}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/*
            One block, one heading — the same grouping the desktop twin has. Each add-on
            used to carry its own h3, which at 360px left the outline a flat list of peers
            with nothing to say these are one-off extras rather than more plan
            options. The per-service headings said little the row labels do not, so the
            row keeps its label and the description follows it as a footnote.

            Every row here can be dropped by the table, and a flat drops all four, so the
            whole block disappears with them — see `offersAnyAddon`, which the button hint
            reads too, rather than a heading left over an empty box.
          */}
          {offersAnyAddon && (
            <div className="mb-8">
              <h3 className="text-base font-semibold mb-4">
                {addonSectionHeading(addonRowCount)}
              </h3>

              <div className="space-y-4">
                {/* First, as on desktop: the only add-on about the SAME glass the plan
                    above cleans, so it reads against the plan the customer just picked.
                    Everything below it is a different part of the building. */}
                {showInternalWindow && (
                  <div>
                    <OptionButton
                      isSelected={internalWindowClean}
                      onClick={() => setInternalWindowClean(!internalWindowClean)}
                      label={INT_WINDOW_ONEOFF_LABEL}
                      price={priceText(internalWindowDisplay)}
                      loading={isLoading}
                      disabled={!isSelectable(internalWindowDisplay)}
                    />
                    <p className="mt-1.5 text-sm text-ink-muted">
                      {ADDON_DESCRIPTION.internalWindow}
                    </p>
                  </div>
                )}

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

          {/* Its own block, below every priced row — the same split the desktop twin makes.

              `loading` is hard false, not `isLoading`. Nothing about this row is waiting on
              the table — it has no price to fetch — so shimmering it alongside the others
              would promise a number that is never coming. */}
          {offersQuoteRequest && (
            <div className="mb-8">
              <h3 className="text-base font-semibold mb-2">{QUOTE_REQUEST_SECTION.heading}</h3>
              <p className="mb-4 text-sm text-ink-muted">
                {quoteRequestIntro(quoteRequestRowCount)}
              </p>

              <div className="space-y-4">
                {showPressureWashing && (
                  <div>
                    <OptionButton
                      isSelected={pressureWashing}
                      onClick={() => setPressureWashing(!pressureWashing)}
                      label={QUOTE_REQUEST_SERVICE.label}
                      price={priceText(QUOTE_REQUEST_DISPLAY)}
                      loading={false}
                      disabled={!isSelectable(QUOTE_REQUEST_DISPLAY)}
                      priceClassName="text-brand-700"
                    />
                    <p className="mt-1.5 text-sm text-ink-muted">
                      {ADDON_DESCRIPTION.pressureWashing}
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
        <div className="pp-card p-5">
          <h3 className="text-base font-semibold mb-4">Price Breakdown</h3>

          {/* Same sentence as the desktop card, from the same function */}
          {!plan && !hasAnyAddon && (
            <p className="text-sm text-ink-muted">{emptyBreakdownText(offersAnyAddon)}</p>
          )}

          {/* First Cleaning */}
          {(plan || hasAnyAddon) && (
            <div className="mb-4 border-b border-line pb-4">
              {/* One step below the panel title, and a step above the ink-muted row labels */}
              <h4 className="text-sm font-semibold mb-3">First Cleaning</h4>
              <div className="space-y-2">
                {plan && (
                  <PriceBreakdownItem
                    label="External Window Cleaning"
                    price={priceText(selectedPlanDisplay)}
                    loading={isLoading}
                  />
                )}

                {/* Add-ons in the order the section offers them — this list is read
                    against those rows, and a different order reads as a different list. */}
                {internalWindowClean && (
                  <PriceBreakdownItem
                    label={INT_WINDOW_ONEOFF_LABEL}
                    price={priceText(internalWindowDisplay)}
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

                {/* Listed though it adds nothing to the figure below — a service the
                    customer ticked and cannot find here reads as one that was dropped. */}
                {pressureWashing && (
                  <PriceBreakdownItem
                    label={QUOTE_REQUEST_SERVICE.label}
                    price={priceText(QUOTE_REQUEST_DISPLAY)}
                    loading={false}
                  />
                )}
              </div>
            </div>
          )}

          {/* Only worth its own block when the one-off add-ons make it a different
              figure — otherwise it reprints the line directly above it. */}
          {showSecondClean && (
            <div className="mb-4 border-b border-line pb-4">
              <h4 className="text-sm font-semibold mb-3">From second cleaning</h4>
              <div className="space-y-2">
                <PriceBreakdownItem
                  label="External Window Cleaning"
                  price={priceText(selectedPlanDisplay)}
                  loading={isLoading}
                />
              </div>
            </div>
          )}

          {/* Total — the one figure the customer is actually deciding on.
              A pale blue tint, not a dark slab: the panel sits inside a white card, so it
              separates by a wash plus a line rather than by going near-navy under
              ink-coloured text.

              The edge is border-brand-600, matching the desktop twin: brand-50 is
              ~1.05:1 on the white card, so a 1.36:1 `line` edge would leave the one
              figure the customer came for sitting in a smudge rather than a panel. */}
          {(plan || hasAnyAddon) && (
            <div className="rounded-lg border border-brand-600 bg-brand-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Total</div>
                  <div className="flex gap-6 mt-2">
                    <div>
                      {/* These two say which price is due today — they have to be readable, not decorative */}
                      <div className="text-sm text-ink-muted">First Clean</div>
                      <div
                        className={cn(
                          // The headline figure is black — the loudest thing on the panel.
                          // The brand blue is 3.35:1 and is a boundary colour, not a number.
                          'font-bold text-ink-strong',
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
                            priceText(selectedPlanDisplay)
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* A figure that is not the whole job has to say so where the figure is
                      read. The rows above already carry "Price on request", but the eye
                      lands on the big black total and the total does not include them. */}
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

        -mx-5 cancels the px-5 of .pp-page-column so the bar spans the whole phone width.

        The fill stays the card white — NOT bg-surface — because the disabled Book Now
        button's own disabled state is a bg-surface fill, and a surface button on a surface
        bar is a button you cannot see; this screen opens with that button disabled.

        Which leaves the top border as the only thing separating the bar from the content
        scrolling under it, and white-on-white gives it no help: it is line-strong (3.30:1)
        rather than the 1.36:1 divider line. A drop shadow would be no use — it falls
        downwards, off the bottom of the phone.
      */}
      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line-strong bg-card px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-ink-muted">First Clean</div>

            {isLoading ? (
              <PriceSkeleton className="h-6 w-20" />
            ) : !plan && !hasAnyAddon ? (
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
                  // Same rule as the panel above: the running total is a black figure
                  'font-bold leading-tight text-ink-strong',
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
