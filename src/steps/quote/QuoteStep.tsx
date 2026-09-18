import { useState, useEffect, useRef, useMemo } from 'react'
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
import {
  isHidden,
  isSelectable,
  usePriceDisplay,
  valueOf,
  type PriceDisplay,
} from './usePriceDisplay'
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

export type QuoteStepValues = {
  frequency: Frequency | null
  addons: {
    gutterClear: boolean
    fasciaClean: boolean
    /**
     * The two conservatory roof cleans are two separate services with two separate CRM
     * fields, sold and booked independently — the customer can take either, both or
     * neither. That they always return the same price is the price sheet's doing (§4),
     * not a reason to collapse them into one flag.
     */
    conservatoryRoofCleanExternal: boolean
    conservatoryRoofCleanInternal: boolean
  }
}

type Props = {
  initialValues?: Partial<QuoteStepValues>
  onSubmit: (values: QuoteStepValues) => void
  /**
   * Used only to decide whether a conservatory can exist at all — a flat is never asked
   * the question, so it can never be offered either roof clean. WHICH services this
   * property can be sold is not decided here: the API answers that per row with
   * `not_applicable`, and a list of house types kept in the client is a copy of its table
   * that goes stale — as it did for townhouses, which are now sold the ancillaries (§5).
   */
  propertyKind: HouseKind
  hasConservatory?: YesNo
  priceStatus: PriceStatus
  priceTable: PriceTable | null
}

/** A price slot: the number, a shimmer while it loads, or why there is no number. */
function Price({ display, className }: { display: PriceDisplay; className?: string }) {
  if (display.kind === 'loading') {
    return (
      <span
        // cn(), not concatenation, so a caller can size the shimmer to the type it replaces.
        // bg-skeleton, not a brand wash: skeleton is tuned to 1.75:1 above the card, so it
        // reads as "pending" even after animate-pulse halves it — a wash tuned for a white
        // page vanishes on this one and the loading step reads as a broken empty row.
        className={cn('inline-block h-4 w-12 animate-pulse rounded bg-skeleton align-middle', className)}
        // An aria-label on a bare <span> has no role to attach to and is not reliably
        // exposed; role=status gives it one and names the wait.
        role="status"
        aria-label="Loading price"
      />
    )
  }
  // A not_applicable row should have been dropped by its caller before reaching here;
  // rendering nothing is the safe fallback if one slips through.
  if (display.kind === 'not_applicable') return null
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
      // shared selected look in .pp-selectable
      aria-pressed={selected}
      disabled={!pickable}
      onClick={onToggle}
      // pp-selectable owns the border, radius, hover, selected and disabled states, so
      // this row carries exactly the same weight as the frequency cards above it
      className="pp-selectable flex w-full items-start gap-3 px-4 py-3.5 text-left"
    >
      {/* A checkbox, not a tick alone — it reads as "you can turn this on" before it is on */}
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md border-2 transition-colors',
          !pickable
            ? 'border-line bg-surface'
            : selected
              ? 'border-brand-700 bg-primary-400'
              : 'border-line-strong bg-surface',
        )}
        aria-hidden
      >
        {/* on-brand (black), never white: black on the yellow fill is 19.66:1, white on it
            is 1.07:1 and the tick simply is not there. The brand-700 rim is required too —
            the yellow's own edge against the white row is invisible. */}
        {selected && <Check className="h-3.5 w-3.5 text-on-brand" strokeWidth={3} />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span
            className={cn(
              'font-semibold',
              // A row we cannot price goes muted, never faded: the label and the words
              // explaining why it cannot be picked both have to stay readable
              !pickable ? 'text-ink-muted' : 'text-ink',
            )}
          >
            {label}
          </span>
          {/* Only a real price earns full black. A row the API declined to price would
              otherwise render "Price on request" louder than the label it belongs to, on a
              row that is muted and disabled everywhere else. */}
          <Price
            display={display}
            className={cn('flex-none font-bold', pickable ? 'text-ink-strong' : 'font-medium text-ink-muted')}
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

export default function QuoteStep({
  initialValues,
  onSubmit,
  propertyKind,
  hasConservatory,
  priceStatus,
  priceTable,
}: Props) {
  // Sync local quote UI frequency/addons into the global costing store (stable selectors)
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
   * says so — rather than the screen opening empty and growing rows under the cursor.
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
   */
  const showGutter = !isHidden(gutterDisplay)
  const showFascia = !isHidden(fasciaDisplay)
  const conservatoryAnswered = hasConservatory === 'yes' && supportsUplifts(propertyKind)
  const showRoofExternal = conservatoryAnswered && !isHidden(conservatoryRoofExtDisplay)
  const showRoofInternal = conservatoryAnswered && !isHidden(conservatoryRoofIntDisplay)

  /**
   * How many add-on rows the section below will actually render, and therefore whether it
   * exists at all. Counted from the rows themselves rather than from the property, so the
   * heading cannot say "Add-ons" over a single row and a flat — offered none of them —
   * loses the whole section instead of keeping a heading over an empty box.
   */
  const addonRowCount = [showGutter, showFascia, showRoofExternal, showRoofInternal].filter(
    Boolean,
  ).length
  const offersAnyAddon = addonRowCount > 0

  // A selection must never outlive the row that offered it. Going back and changing the
  // property, or a table that comes back `not_applicable`, would otherwise leave an add-on
  // switched on that the customer can no longer see — and so can no longer deselect —
  // sitting inside a total and a booking they never agreed to.
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
  const prevFrequencyRef = useRef(frequency)

  // Memoize the current addons object to prevent unnecessary recalculations
  const currentAddons = useMemo(() => ({
    gutterClear,
    fasciaClean,
    conservatoryRoofCleanExternal,
    conservatoryRoofCleanInternal,
  }), [
    gutterClear,
    fasciaClean,
    conservatoryRoofCleanExternal,
    conservatoryRoofCleanInternal,
  ])

  const prevAddonsRef = useRef(currentAddons)

  useEffect(() => {
    // Only update if frequency has actually changed
    if (frequency !== prevFrequencyRef.current) {
      prevFrequencyRef.current = frequency
      if (frequency) {
        setFrequencyInStore(frequency)
      }
    }

    // Identity is the comparison, not a field-by-field diff: `currentAddons` is memoised
    // on the flags themselves, so a new object *is* a real change — and the check cannot
    // silently stop noticing an add-on the way a hand-written list of fields can.
    if (prevAddonsRef.current !== currentAddons) {
      prevAddonsRef.current = currentAddons
      setAddonsInStore(currentAddons)
    }
  }, [frequency, currentAddons, setFrequencyInStore, setAddonsInStore])

  /**
   * The external-window row for whatever frequency is selected — used in the breakdown.
   *
   * The fallback is never rendered: every use of this slot sits behind a `frequency`
   * check. It is 6, the shorter of the two cycles this client sells — 4-weekly and
   * 8-weekly do not exist in this catalogue at all (§4).
   */
  const selectedFrequencyDisplay = display.forFrequency(frequency ?? 6)

  /**
   * Every line the customer actually picked, read from the same `display` slots the
   * breakdown rows render — so the total can never claim something the rows above it
   * contradict. No price is recomputed here; the slots are only inspected.
   *
   * `shortName` is the wording for the unpriced-rows note, where a full row label would
   * read as a second heading rather than as a footnote.
   */
  const selectedLines: SelectedLine[] = []
  if (frequency) {
    selectedLines.push({ display: selectedFrequencyDisplay, shortName: SHORT_NAME.frequency })
  }
  if (gutterClear) {
    selectedLines.push({ display: gutterDisplay, shortName: SHORT_NAME.gutter })
  }
  if (fasciaClean) {
    selectedLines.push({ display: fasciaDisplay, shortName: SHORT_NAME.fascia })
  }
  if (conservatoryRoofCleanExternal) {
    selectedLines.push({
      display: conservatoryRoofExtDisplay,
      shortName: SHORT_NAME.conservatoryExternal,
    })
  }
  if (conservatoryRoofCleanInternal) {
    selectedLines.push({
      display: conservatoryRoofIntDisplay,
      shortName: SHORT_NAME.conservatoryInternal,
    })
  }

  const totals = summariseSelection(selectedLines)

  /**
   * First clean = the selected frequency plus every selected add-on that carries a
   * number. A sum of prices the API returned, never a price derived from them — and
   * taken from the very slots rendered above, so a row we could not price contributes
   * nothing here and is named in the note instead.
   *
   * Both conservatory roof rows are summed at their own returned price. They come back
   * equal to each other, and adding them is adding two services, not double-counting one.
   */
  const firstCleanTotal = selectedLines.reduce((sum, line) => sum + (valueOf(line.display) ?? 0), 0)

  // Check if at least one addon is selected
  const hasAnyAddon =
    gutterClear ||
    fasciaClean ||
    conservatoryRoofCleanExternal ||
    conservatoryRoofCleanInternal

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
  const selectionIsPriced = selectedLines.every((line) => isSelectable(line.display))

  // Allow submission if frequency is selected OR at least one addon is selected
  const canSubmit =
    priceStatus !== 'loading' && (frequency !== null || hasAnyAddon) && selectionIsPriced

  /**
   * A disabled primary button with nothing beside it is a dead end — the customer can see
   * they cannot continue but not what to do about it. Read-only: this only names the
   * condition `canSubmit` already failed on, it never decides anything. The "nothing
   * picked" line comes from quoteTotals so the mobile twin cannot word it differently.
   */
  // Loading is tested FIRST. On arrival nothing is selected AND the prices are
  // still in flight, so an "if nothing selected" branch placed above this one wins
  // at the only moment the loading message actually matters — telling the customer
  // to pick something while every row is disabled.
  //
  // This is also the ONLY place either screen words the wait. The sections above used to
  // carry "Working out your prices…" as well, so one state had two phrasings on screen at
  // the same time; the shimmering price slots say "not yet" without any prose at all.
  const disabledHint = canSubmit
    ? null
    : priceStatus === 'loading'
      ? 'Just fetching your prices…'
      : frequency === null && !hasAnyAddon
        ? nothingSelectedHint(offersAnyAddon)
        : 'One of your choices needs a quote from us — deselect it to continue'

  return (
    <div className="w-full">
      {/* The step title the mobile twin already has. Without it this screen opened on two
          peer h2s and no h3 layer, so the outline inverted at the 768px breakpoint. */}
      <h2 className="mb-6 text-xl md:text-2xl font-semibold">
        Please select the services you want to go ahead with
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left side - 2/3 width */}
        <div className="md:col-span-2 space-y-10">
          <div>
            {/* A service under the step title, so h3 — same level as the mobile twin's
                per-service headings. The id still labels the radiogroup below. */}
            <h3 id="frequency-heading" className="text-base font-semibold">
              External Window Cleaning
            </h3>
            <div className="mt-2 mb-4 text-sm text-ink-muted">
              All frames, sills and glass are included
            </div>
            {/* No loading line here. Every price slot below already shimmers, and the one
                sentence naming the wait belongs beside the disabled button that the wait is
                actually blocking — see `disabledHint`. Two phrasings of one state, one of
                them repeated over each section, was three chances to word it differently. */}
            {/*
              Two cards, so two columns and room to breathe. The old four-up grid had to
              squeeze its labels into ~48px of content box at the 768px start of this
              layout; a pair does not, so the card and its type both get bigger.

              role="radiogroup" ties the cards together as one set; without it a screen
              reader announces them as unrelated buttons.
            */}
            <div
              role="radiogroup"
              aria-labelledby="frequency-heading"
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6"
            >
              {FREQUENCIES.map((val) => {
                const isSelected = frequency === val
                const slot = display.forFrequency(val)
                const pickable = isSelectable(slot)

                // While loading the card itself is disabled, so it sits on the recessed
                // bg-surface — the pill lifts back to bg-card, which is the ground the
                // skeleton's 1.75:1 was tuned against. A card we cannot price goes neutral
                // too, so a dimmed card never carries a pill that still looks live —
                // ink-muted on card is 5.24:1, so the words stay read.
                //
                // Chosen is the brand yellow carrying black (19.66:1) behind a brand-700
                // rim, the same "this one is picked" fill as the chips and the steps bar;
                // the yellow needs that rim because its own edge on the card is 1.07:1.
                // Unpicked is a pale blue wash with black on it — a chip, not a control,
                // so the card's own border-2 is the boundary that owes 3:1.
                const pillClass = isSelected
                  ? 'border border-brand-700 bg-primary-400 text-on-brand'
                  : priceStatus === 'loading'
                    ? 'border border-transparent bg-card text-ink-muted'
                    : pickable
                      ? 'border border-transparent bg-brand-100 text-ink-strong'
                      : 'border border-transparent bg-card text-ink-muted'

                return (
                  <button
                    key={val}
                    type="button"
                    // One choice out of two, so role=radio + aria-checked — which is also
                    // what drives the shared selected look in .pp-selectable
                    role="radio"
                    aria-checked={isSelected}
                    disabled={!pickable}
                    onClick={() => {
                      if (!pickable) return
                      // If clicking the same frequency, deselect it (set to null)
                      setFrequency(isSelected ? null : val)
                    }}
                    className={cn(
                      // pp-selectable owns the border, radius, hover, selected and
                      // disabled states — this call site adds only its own layout
                      'pp-selectable flex min-h-[160px] flex-col justify-between p-6 text-left lg:p-8',
                      pickable && 'hover:-translate-y-0.5 hover:shadow-card',
                      isSelected && 'shadow-card',
                    )}
                  >
                    {/* Tick badge — the choice must not rest on colour alone */}
                    <span
                      className={cn(
                        'absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full',
                        'transition-[opacity,transform] duration-150',
                        isSelected
                          ? 'scale-100 bg-primary-400 opacity-100 ring-2 ring-brand-700'
                          : 'scale-75 opacity-0',
                      )}
                      aria-hidden
                    >
                      {/* The same tick badge as every other selectable card: yellow disc,
                          black tick, blue ring. The ring is load-bearing — a yellow disc on
                          the pale-blue selected card has a 1.07:1 edge and reads as a smudge. */}
                      <Check className="h-3.5 w-3.5 text-on-brand" strokeWidth={3} />
                    </span>

                    <div
                      className={cn(
                        'whitespace-nowrap text-lg font-bold leading-tight tracking-tight lg:text-xl',
                        !pickable ? 'text-ink-muted' : 'text-ink',
                      )}
                    >
                      {frequencyLabel(val)}
                    </div>
                    <div className={cn(// self-start, not inline-block: a flex column blockifies the child and would
                        // stretch the pill across the whole card
                        'mt-4 self-start rounded-lg px-4 py-2 text-sm font-bold', pillClass)}>
                      <Price display={slot} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Every row here can be dropped by the table, and a flat drops all four — so
              the heading goes with them rather than being left over an empty box. */}
          {offersAnyAddon && (
            <div>
              {/* A peer of the frequency section, so the same h3 sub-heading recipe */}
              <h3 className="text-base font-semibold">{addonSectionHeading(addonRowCount)}</h3>
              <div className="mt-4 grid grid-cols-1 gap-4">
                {showGutter && (
                  <AddonRow
                    label={GUTTER_CLEARANCE_LABEL}
                    description={ADDON_DESCRIPTION.gutter}
                    display={gutterDisplay}
                    selected={gutterClear}
                    onToggle={() => setGutterClear(!gutterClear)}
                  />
                )}

                {showFascia && (
                  <AddonRow
                    label={FASCIA_SOFFIT_LABEL}
                    description={ADDON_DESCRIPTION.fascia}
                    display={fasciaDisplay}
                    selected={fasciaClean}
                    onToggle={() => setFasciaClean(!fasciaClean)}
                  />
                )}

                {/* The two roof cleans, external first and adjacent — they price the same
                    (§4), so sitting them together makes the matching figures read as the
                    two sides of one roof rather than as a repeated row. */}
                {showRoofExternal && (
                  <AddonRow
                    label={EXT_CONSERVATORY_ROOF_LABEL}
                    description={ADDON_DESCRIPTION.conservatoryExternal}
                    display={conservatoryRoofExtDisplay}
                    selected={conservatoryRoofCleanExternal}
                    onToggle={() => setConservatoryRoofCleanExternal(!conservatoryRoofCleanExternal)}
                  />
                )}

                {showRoofInternal && (
                  <AddonRow
                    label={INT_CONSERVATORY_ROOF_LABEL}
                    description={ADDON_DESCRIPTION.conservatoryInternal}
                    display={conservatoryRoofIntDisplay}
                    selected={conservatoryRoofCleanInternal}
                    onToggle={() => setConservatoryRoofCleanInternal(!conservatoryRoofCleanInternal)}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right side - 1/3 width */}
        <div className="md:col-span-1">
          {/* top-20, not top-4: the step bar above is itself `sticky top-0` and
              about 65px tall, so a 16px offset parked this card's heading and
              first rows permanently underneath it. */}
          <div className="pp-card sticky top-20 p-6">
            <h3 className="mb-4 text-base font-semibold">Price Breakdown</h3>

            {/* On arrival nothing is picked, so every block below is suppressed and the
                panel was a lone heading over a dead button. The heading always gets a body. */}
            {!frequency && !hasAnyAddon && (
              <p className="text-sm text-ink-muted">{emptyBreakdownText(offersAnyAddon)}</p>
            )}

            {/* First Cleaning - Show when frequency or addons are selected */}
            {(frequency || hasAnyAddon) && (
              <div className="mb-6 border-b border-line pb-4">
                <h4 className="mb-3 text-base font-semibold">First Cleaning</h4>
                <div className="space-y-2">
                  {frequency && (
                    <BreakdownRow label="External Window Cleaning" display={selectedFrequencyDisplay} />
                  )}

                  {gutterClear && (
                    <BreakdownRow label={GUTTER_CLEARANCE_LABEL} display={gutterDisplay} />
                  )}

                  {fasciaClean && (
                    <BreakdownRow label={FASCIA_SOFFIT_LABEL} display={fasciaDisplay} />
                  )}

                  {conservatoryRoofCleanExternal && (
                    <BreakdownRow
                      label={EXT_CONSERVATORY_ROOF_LABEL}
                      display={conservatoryRoofExtDisplay}
                    />
                  )}

                  {conservatoryRoofCleanInternal && (
                    <BreakdownRow
                      label={INT_CONSERVATORY_ROOF_LABEL}
                      display={conservatoryRoofIntDisplay}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Only worth its own block when the one-off add-ons make it a different
                figure — otherwise it reprints the line directly above it. */}
            {showSecondClean && (
              <div className="mb-6 border-b border-line pb-4">
                <h4 className="mb-3 text-base font-semibold">From second cleaning</h4>
                <div className="space-y-2">
                  <BreakdownRow label="External Window Cleaning" display={selectedFrequencyDisplay} />
                </div>
              </div>
            )}

            {/* Total - Show when frequency is selected or when addons are selected */}
            {(frequency || hasAnyAddon) && (
              <div className="border-t border-line pt-4">
                {/* The one figure the customer came for — a pale blue wash behind black
                    figures, so the eye lands here first. The brand-600 edge is what makes a
                    1.07:1 tint read as a panel at all on a white card. */}
                <div className="rounded-lg border border-brand-600 bg-brand-50 p-4">
                  <div className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Total</div>
                  <div className="flex flex-wrap gap-6 mt-2">
                    <div>
                      {/* Which price the customer pays today — ink-muted, not ink-subtle:
                          these two words are the whole point of the block */}
                      <div className="text-sm text-ink-muted">First Clean</div>
                      <div
                        className={cn(
                          'font-bold text-ink-strong',
                          // Words, not a figure — at 2xl "Price on request" wraps in a
                          // third-width card
                          totals.everyLineUnpriced ? 'text-lg' : 'text-2xl',
                        )}
                      >
                        {priceStatus === 'loading' ? (
                          <Price display={{ kind: 'loading' }} className="h-7 w-20" />
                        ) : (
                          // Words whenever no picked row carries a price: the sum is 0, and
                          // "£0" as the largest, boldest figure on the page above an
                          // enabled Book Now told the customer the booking was free.
                          firstCleanText(totals, firstCleanTotal)
                        )}
                      </div>
                    </div>
                    {/* Same gate as the block above: a second column that repeats the
                        first one is not a second figure, it is the same one twice */}
                    {showSecondClean && (
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
