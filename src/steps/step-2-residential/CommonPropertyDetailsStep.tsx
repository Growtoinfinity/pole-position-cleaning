import { useForm } from 'react-hook-form'
import type { FieldErrors } from 'react-hook-form'
import { Minus, Plus } from 'lucide-react'
import Button from '@/components/ui/button'
import Chip from '@/components/ui/chip'
import StepForm from '@/components/form/StepForm'
import InfoNote from '@/components/ui/InfoNote'
import FieldError from '@/components/ui/FieldError'
import type { YesNo } from '@/types'
import { useCostingStore } from '@/stores/costingStore'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { supportsUplifts } from '@/lib/costing-calc'
import type { HouseKind } from '@/lib/costing-calc'

/**
 * Every property answers `bedrooms`; a house also answers the uplift and survey
 * questions, and a flat answers nothing else. Every field is therefore optional at the
 * type level — which of them is *required* is decided per property kind by the rules
 * below, not by this type.
 */
export type CommonPropertyDetailsValues = {
  /**
   * Every property, a flat included. This client bands a flat on bedrooms exactly as it
   * bands a house, and never asks which floor it is on — their own rule, and the reason
   * there is no floor question here any more. Asking for the floor and sending it would
   * quote a 3-bedroom first-floor flat at the ONE-bedroom price, `ok: true`, with
   * nothing in the response to say so (§7 of docs/pricing-api-wewasheverything.md).
   */
  bedrooms?: number
  /**
   * Both are PRICING inputs, not just survey answers, and the loft one is required:
   * omit it and the API refuses every row with `missing_inputs`, so the customer sees
   * no quote at all rather than a quote missing an uplift.
   *
   * Verified live on 2026-09-09: a loft conversion adds £2 to each window row, £6 to
   * fascia and £5 to gutter on a 3-bed semi, and each Velux adds £1 to the window rows
   * only. (§6 of the client doc says neither is ever charged — that section predates the
   * surcharges being implemented and is out of date.)
   */
  hasLoftConversion?: YesNo
  hasExtension?: YesNo
  hasConservatory?: YesNo
  hasVelux?: YesNo
  /** Only meaningful when `hasVelux` is 'yes'. £1 per window on the window rows. */
  veluxCount?: number
}

/**
 * One card per question, so it is obvious where one question ends and the next begins.
 * The card sits on a wrapper rather than on the <fieldset> itself because a bordered
 * fieldset breaks its own border open around the legend.
 *
 * The id is the scroll target for a failed submit — see focusFirstError below.
 */
function QuestionCard({ id, children }: { id: string; children: ReactNode }) {
  return <div id={id} className="wwe-card p-5 md:p-6">{children}</div>
}

// Both stepper buttons are identical, so their class list lives in one place.
// Disabled swaps the fill, border and ink instead of fading: the minus button is
// disabled at its minimum, a state customers reach by stepping down, and a fade
// would take the boundary below the 3:1 WCAG 1.4.11 asks of a control. Keeping
// line-strong at 70% still leaves a visible shape, and every word stays at full
// opacity. Hover is brand-400 (6.4:1 on the card) — on a dark page the affordance
// gets *brighter*, which is the opposite instinct to the light theme.
const stepperButtonClass =
  'flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:border-brand-400 hover:bg-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-line-strong/70 disabled:bg-card disabled:text-ink-muted disabled:hover:border-line-strong/70 disabled:hover:bg-card'

/**
 * Module scope on purpose. Declared inside the component body this was a fresh
 * function identity on every render, so React saw a different element type after
 * each setValue and unmounted/remounted both buttons — destroying the very button
 * that was just pressed and dropping focus back to the document. A keyboard user
 * had to re-tab to the control after every single step.
 */
function NumberStepper({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  label: string
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={stepperButtonClass}
        aria-label={`Decrease ${label}`}
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      {/* Tabular figures stop the row shifting as the count crosses 9, 99 */}
      <span className="min-w-[2.5rem] text-center text-lg font-semibold tabular-nums text-ink">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={stepperButtonClass}
        aria-label={`Increase ${label}`}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

export default function CommonPropertyDetailsStep({
  initialValues,
  onSubmit,
  propertyType,
  propertyKind,
  includeSixPlus = false,
}: {
  initialValues?: Partial<CommonPropertyDetailsValues>
  onSubmit: (values: CommonPropertyDetailsValues) => void
  /** Display name only — what the heading calls this property. */
  propertyType: string
  /**
   * The property as the price sheet sees it — decides which questions are asked.
   *
   * Derived by the caller from `houseKindFor`, which is the one place the
   * ResidentialType → HouseKind mapping lives. Null means "a house whose exact kind this
   * step does not need": Large/Unusual has no priced kind at all, and that changes not a
   * single question — only a flat is asked something different.
   */
  propertyKind: HouseKind | null
  includeSixPlus?: boolean
}) {
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<CommonPropertyDetailsValues>({
    defaultValues: { ...initialValues },
    mode: 'onTouched',
  })

  // A flat answers the bedroom question like any other property, and then stops: no
  // extension, no conservatory, no loft, no Velux. Its price-table cells carry no `add`
  // object, and the four other services have no `Flat` row at all, so every one of those
  // answers would feed nothing. Asking would be collecting for the sake of it.
  const isFlat = propertyKind === 'flat'
  // One decision, used by all three uplift-dependent questions below. An unnamed kind
  // is still a house, so it keeps them.
  const askUplifts = propertyKind === null || supportsUplifts(propertyKind)

  // Every chip group is a radiogroup, which has to name its own legend and its own
  // error. The step is rendered once per route but the ids still come from useId so
  // they can never collide with another field group on the page.
  const groupId = useId()
  const ids = {
    bedroomsCard: `${groupId}-bedrooms-card`,
    bedroomsLegend: `${groupId}-bedrooms-legend`,
    bedroomsError: `${groupId}-bedrooms-error`,
    loftCard: `${groupId}-loft-card`,
    loftLegend: `${groupId}-loft-legend`,
    loftError: `${groupId}-loft-error`,
    veluxCard: `${groupId}-velux-card`,
    veluxLegend: `${groupId}-velux-legend`,
    veluxError: `${groupId}-velux-error`,
    veluxCountError: `${groupId}-velux-count-error`,
    extensionCard: `${groupId}-extension-card`,
    extensionLegend: `${groupId}-extension-legend`,
    extensionError: `${groupId}-extension-error`,
    conservatoryCard: `${groupId}-conservatory-card`,
    conservatoryLegend: `${groupId}-conservatory-legend`,
    conservatoryError: `${groupId}-conservatory-error`,
  }

  /**
   * Every answer on this step is registered on a hidden input (the roof one is also
   * tabIndex={-1} aria-hidden), so react-hook-form's own shouldFocusError has nothing
   * focusable to land on and is a silent no-op. On a 360x640 phone the Continue button
   * sits roughly 500px below the first question, so the message it just published is
   * off-screen and the form looks broken. Take the customer to the question instead.
   *
   * `behavior` is deliberately not passed: the default inherits the document's
   * scroll-behavior, which index.css already switches to auto under
   * prefers-reduced-motion.
   */
  const revealQuestion = (cardId: string) => {
    const card = document.getElementById(cardId)
    if (!card) return
    card.scrollIntoView({ block: 'center' })
    // Land the keyboard on the first chip of that group so its legend — and the
    // error now wired into aria-describedby — get announced.
    card.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }

  // Source order, so a customer who missed two questions is taken to the first.
  const errorTargets: Array<[keyof CommonPropertyDetailsValues, string]> = [
    ['bedrooms', ids.bedroomsCard],
    ['hasLoftConversion', ids.loftCard],
    ['hasExtension', ids.extensionCard],
    ['hasConservatory', ids.conservatoryCard],
    ['hasVelux', ids.veluxCard],
    ['veluxCount', ids.veluxCard],
  ]

  const focusFirstError = (formErrors: FieldErrors<CommonPropertyDetailsValues>) => {
    const first = errorTargets.find(([name]) => formErrors[name])
    if (first) revealQuestion(first[1])
  }

  const setBedrooms = useCostingStore((s) => s.setBedrooms)
  const setHasExtension = useCostingStore((s) => s.setHasExtension)
  const setHasConservatory = useCostingStore((s) => s.setHasConservatory)
  const setHasLoftConversion = useCostingStore((s) => s.setHasLoftConversion)
  const setVeluxCount = useCostingStore((s) => s.setVeluxCount)

  // Use refs to track previous values to prevent infinite loops
  const prevBedroomsRef = useRef<number | undefined>(undefined);
  const prevHasExtensionRef = useRef<YesNo | undefined>(undefined);
  const prevHasConservatoryRef = useRef<YesNo | undefined>(undefined);
  const prevHasLoftRef = useRef<YesNo | undefined>(undefined);
  const prevVeluxRef = useRef<number | undefined>(undefined);

  // The costing store's propertyKind is set by whoever knows the sub-kinds — StepRenderer
  // on submit, App on resume. This step used to set it too, by parsing the heading text,
  // which meant two owners and one of them guessing.

  // Update costing context when form values change
  const bedrooms = watch('bedrooms');
  const hasExtensionValue = watch('hasExtension');
  const hasConservatoryValue = watch('hasConservatory')
  const hasLoftValue = watch('hasLoftConversion')
  const veluxWatch = watch('veluxCount')
  const hasVeluxWatch = watch('hasVelux')

  useEffect(() => {
    if (bedrooms && prevBedroomsRef.current !== bedrooms) {
      prevBedroomsRef.current = bedrooms;
      setBedrooms(bedrooms)
    }
  }, [bedrooms, setBedrooms])

  useEffect(() => {
    if (hasExtensionValue && prevHasExtensionRef.current !== hasExtensionValue) {
      prevHasExtensionRef.current = hasExtensionValue;
      setHasExtension(hasExtensionValue)
    }
  }, [hasExtensionValue, setHasExtension])

  useEffect(() => {
    if (hasConservatoryValue && prevHasConservatoryRef.current !== hasConservatoryValue) {
      prevHasConservatoryRef.current = hasConservatoryValue;
      setHasConservatory(hasConservatoryValue)
    }
  }, [hasConservatoryValue, setHasConservatory])

  useEffect(() => {
    if (hasLoftValue && prevHasLoftRef.current !== hasLoftValue) {
      prevHasLoftRef.current = hasLoftValue;
      setHasLoftConversion(hasLoftValue)
    }
  }, [hasLoftValue, setHasLoftConversion])

  /**
   * A "no" to the Velux question has to reach the store as 0, not merely as an unset
   * count. Without this branch a customer who answered "yes, 4" and then went back to
   * "no" would keep four Velux in the pricing key and be quoted £4 a clean for windows
   * they have just said they do not have.
   */
  useEffect(() => {
    const next = hasVeluxWatch === 'yes' ? (veluxWatch ?? 0) : 0
    if (prevVeluxRef.current !== next) {
      prevVeluxRef.current = next
      setVeluxCount(next)
    }
  }, [hasVeluxWatch, veluxWatch, setVeluxCount])

  const hasExtension = watch('hasExtension') === 'yes'
  const hasVelux = watch('hasVelux') === 'yes'
  const veluxCountValue = watch('veluxCount')
  const bedroomOptions = includeSixPlus ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]

  /**
   * Answering "yes" is itself the statement that there is at least one, so seeding the
   * stepper at 1 reports a fact rather than inventing an answer — and it means the
   * stepper can never sit on a value the customer has not implicitly given.
   */
  const veluxStepperValue = veluxCountValue && veluxCountValue > 0 ? veluxCountValue : 1

  return (
    <StepForm onSubmit={handleSubmit((vals) => {
      if (isFlat) {
        // Only the bedroom count ships. Anything else still sitting in form state
        // belongs to a house the customer answered for earlier in this session, and
        // passing it on would be inventing answers a flat was never asked for.
        onSubmit({ bedrooms: vals.bedrooms })
        return
      }
      // Listed field by field rather than spread, so an answer left over from a
      // property the customer backed out of can never ride along.
      // Anything added to CommonPropertyDetailsValues must be added HERE too — a field
      // left off this list is silently dropped on the way to the store, the CRM and
      // Supabase, and nothing errors.
      onSubmit({
        bedrooms: vals.bedrooms,
        hasLoftConversion: vals.hasLoftConversion,
        hasExtension: vals.hasExtension,
        hasConservatory: vals.hasConservatory,
        hasVelux: vals.hasVelux,
        // A count belonging to a "yes" the customer has since changed to "no" must not
        // survive the submit.
        veluxCount: vals.hasVelux === 'yes' ? vals.veluxCount : undefined,
      })
    }, focusFirstError)}>
      {/* No horizontal padding here: wwe-page-column already supplies px-5, and the
          submit button lives outside this wrapper — an inset here left the cards
          16px in from a full-bleed Continue button on a phone. */}
      <div className="grid gap-6">
        {/* A flat names itself rather than using the display label: the label falls back
            to the generic "Property", and "Property Details" over a single floor
            question tells the customer nothing about what is being asked. */}
        <h2 className="text-xl md:text-2xl font-semibold text-ink">
          {isFlat ? 'Flat Details' : `${propertyType} Details`}
        </h2>

        <QuestionCard id={ids.bedroomsCard}>
          <fieldset className="grid gap-2 md:gap-3">
            {/* The "*" matches ContactStep and ResidentialTypeStep: every question on
                this step is required, and without the marker required-ness only
                surfaced after Continue failed. */}
            <legend id={ids.bedroomsLegend} className="pb-2 text-base font-semibold text-ink">How many bedrooms?*</legend>
            <div
              role="radiogroup"
              aria-labelledby={ids.bedroomsLegend}
              aria-describedby={errors.bedrooms ? ids.bedroomsError : undefined}
              aria-invalid={errors.bedrooms ? true : undefined}
              className="flex flex-wrap gap-2 md:gap-3"
            >
              {bedroomOptions.map((num) => (
                <Chip
                  key={num}
                  label={num === 6 ? '6+' : num.toString()}
                  selected={watch('bedrooms') === num}
                  withRing
                  // shouldValidate clears the error the moment the chip is filled —
                  // without it a red "Please select…" stayed pinned under an answer
                  // the customer can plainly see they have given.
                  onClick={() => setValue('bedrooms', num, { shouldDirty: true, shouldValidate: true })}
                />
              ))}
              <input type="hidden" {...register('bedrooms', { valueAsNumber: true, required: 'Please select the number of bedrooms' })} />
            </div>
            {errors.bedrooms?.message && (
              <div id={ids.bedroomsError}>
                <FieldError>{errors.bedrooms.message}</FieldError>
              </div>
            )}
          </fieldset>
        </QuestionCard>

        {askUplifts && (
        <QuestionCard id={ids.loftCard}>
          <fieldset className="grid gap-2 md:gap-3">
            <legend id={ids.loftLegend} className="pb-2 text-base font-semibold text-ink">Do you have a loft conversion?*</legend>
            <div
              role="radiogroup"
              aria-labelledby={ids.loftLegend}
              aria-describedby={errors.hasLoftConversion ? ids.loftError : undefined}
              aria-invalid={errors.hasLoftConversion ? true : undefined}
              className="flex flex-wrap gap-2 md:gap-3"
            >
              <Chip
                label="Yes"
                selected={watch('hasLoftConversion') === 'yes'}
                withRing
                onClick={() => setValue('hasLoftConversion', 'yes', { shouldDirty: true, shouldValidate: true })}
              />
              <Chip
                label="No"
                selected={watch('hasLoftConversion') === 'no'}
                withRing
                onClick={() => setValue('hasLoftConversion', 'no', { shouldDirty: true, shouldValidate: true })}
              />
              <input type="hidden" {...register('hasLoftConversion', { required: 'Please select if you have a loft conversion' })} />
            </div>
            {errors.hasLoftConversion?.message && (
              <div id={ids.loftError}>
                <FieldError>{errors.hasLoftConversion.message}</FieldError>
              </div>
            )}
          </fieldset>
        </QuestionCard>
        )}

        {askUplifts && (
        <QuestionCard id={ids.extensionCard}>
          <fieldset className="grid gap-2 md:gap-3">
            <legend id={ids.extensionLegend} className="pb-2 text-base font-semibold text-ink">Do you have a side or rear extension?*</legend>
            <div
              role="radiogroup"
              aria-labelledby={ids.extensionLegend}
              aria-describedby={errors.hasExtension ? ids.extensionError : undefined}
              aria-invalid={errors.hasExtension ? true : undefined}
              className="flex flex-wrap gap-2 md:gap-3"
            >
              <Chip
                label="Yes"
                selected={watch('hasExtension') === 'yes'}
                withRing
                onClick={() => setValue('hasExtension', 'yes', { shouldDirty: true, shouldValidate: true })}
              />
              <Chip
                label="No"
                selected={watch('hasExtension') === 'no'}
                withRing
                onClick={() => setValue('hasExtension', 'no', { shouldDirty: true, shouldValidate: true })}
              />
              <input type="hidden" {...register('hasExtension', { required: 'Please select if you have an extension' })} />
            </div>
            {errors.hasExtension?.message && (
              <div id={ids.extensionError}>
                <FieldError>{errors.hasExtension.message}</FieldError>
              </div>
            )}
          </fieldset>
        </QuestionCard>
        )}

        {askUplifts && hasExtension && (
          <InfoNote>Any 1st storey Velux windows & sky lanterns will be included in your quote</InfoNote>
        )}

        {askUplifts && (
        <QuestionCard id={ids.conservatoryCard}>
          <fieldset className="grid gap-2 md:gap-3">
            <legend id={ids.conservatoryLegend} className="pb-2 text-base font-semibold text-ink">Do you have a conservatory?*</legend>
            <div
              role="radiogroup"
              aria-labelledby={ids.conservatoryLegend}
              aria-describedby={errors.hasConservatory ? ids.conservatoryError : undefined}
              aria-invalid={errors.hasConservatory ? true : undefined}
              className="flex flex-wrap gap-2 md:gap-3"
            >
              {/*
                This answer does double duty and neither half is obvious. It is one of
                the only two uplifts the pricing engine actually charges, AND it is what
                gates both conservatory roof cleans: answer "no" and the API returns
                those two rows `not_applicable` — for this turn only, so changing the
                answer brings them straight back (§8b).
              */}
              <Chip
                label="Yes"
                selected={watch('hasConservatory') === 'yes'}
                withRing
                onClick={() => setValue('hasConservatory', 'yes', { shouldDirty: true, shouldValidate: true })}
              />
              <Chip
                label="No"
                selected={watch('hasConservatory') === 'no'}
                withRing
                onClick={() => setValue('hasConservatory', 'no', { shouldDirty: true, shouldValidate: true })}
              />
              <input type="hidden" {...register('hasConservatory', { required: 'Please select if you have a conservatory' })} />
            </div>
            {errors.hasConservatory?.message && (
              <div id={ids.conservatoryError}>
                <FieldError>{errors.hasConservatory.message}</FieldError>
              </div>
            )}
          </fieldset>
        </QuestionCard>
        )}


        {/*
          Velux and its count share one card rather than appearing as two, because
          the count is not a separate question — it is the rest of the same answer.
          Split across two cards, answering "Yes" pushed a new card into view below
          the fold and read as the form growing under the customer.
        */}
        {askUplifts && (
        <QuestionCard id={ids.veluxCard}>
          <fieldset className="grid gap-2 md:gap-3">
            <legend id={ids.veluxLegend} className="pb-2 text-base font-semibold text-ink">Do you have any Velux (roof) windows?*</legend>
            <div
              role="radiogroup"
              aria-labelledby={ids.veluxLegend}
              aria-describedby={errors.hasVelux ? ids.veluxError : undefined}
              aria-invalid={errors.hasVelux ? true : undefined}
              className="flex flex-wrap gap-2 md:gap-3"
            >
              <Chip
                label="Yes"
                selected={watch('hasVelux') === 'yes'}
                withRing
                onClick={() => {
                  const alreadyYes = watch('hasVelux') === 'yes'
                  setValue('hasVelux', 'yes', { shouldDirty: true, shouldValidate: true })
                  // Seed the count only on the transition into "yes", so re-tapping
                  // the chip cannot reset a number the customer has already stepped up.
                  if (!alreadyYes) {
                    setValue('veluxCount', veluxStepperValue, { shouldDirty: true, shouldValidate: true })
                  }
                }}
              />
              <Chip
                label="No"
                selected={watch('hasVelux') === 'no'}
                withRing
                onClick={() => {
                  setValue('hasVelux', 'no', { shouldDirty: true, shouldValidate: true })
                  // Validating here is what retires a count error left over from a
                  // previous "yes" — the rule passes as soon as hasVelux is 'no'.
                  setValue('veluxCount', undefined, { shouldDirty: true, shouldValidate: true })
                }}
              />
              <input type="hidden" {...register('hasVelux', { required: 'Please select if you have Velux windows' })} />
            </div>
            {errors.hasVelux?.message && (
              <div id={ids.veluxError}>
                <FieldError>{errors.hasVelux.message}</FieldError>
              </div>
            )}

            {hasVelux && (
              <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:gap-4">
                <span className="text-sm font-medium text-ink" id={`${ids.veluxCard}-count-label`}>
                  How many Velux windows?
                </span>
                <NumberStepper
                  value={veluxStepperValue}
                  onChange={(n) =>
                    setValue('veluxCount', n, { shouldDirty: true, shouldValidate: true })
                  }
                  min={1}
                  max={60}
                  label="Velux windows"
                />
              </div>
            )}
            {/*
              Registered on a hidden input like every other answer on this step, so
              the count travels with the form rather than living only in the stepper.
              Unreachable in practice — answering "yes" seeds it at 1 — but a rule
              that cannot fire is cheaper than a count that silently ships undefined.
            */}
            <input
              type="hidden"
              {...register('veluxCount', {
                valueAsNumber: true,
                validate: (v, formValues) =>
                  formValues.hasVelux !== 'yes' ||
                  (typeof v === 'number' && Number.isFinite(v) && v >= 1) ||
                  'Please tell us how many Velux windows you have',
              })}
            />
            {errors.veluxCount?.message && (
              <div id={ids.veluxCountError}>
                <FieldError>{errors.veluxCount.message}</FieldError>
              </div>
            )}
          </fieldset>
        </QuestionCard>
        )}
      </div>

      <div className="mt-6 flex justify-center">
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Please wait...' : 'Continue'}
        </Button>
      </div>
    </StepForm>
  )
}