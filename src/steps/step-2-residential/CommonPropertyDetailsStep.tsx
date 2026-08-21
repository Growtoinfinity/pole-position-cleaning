import { Controller, useForm } from 'react-hook-form'
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
import { FLAT_FLOORS, supportsUplifts } from '@/lib/costing-calc'
import type { ConservatoryRoofPricingInput, FlatFloor, HouseKind } from '@/lib/costing-calc'

/**
 * A house answers `bedrooms` and the two uplift questions; a flat answers `floor` and
 * nothing else. Every field is therefore optional at the type level — which of them is
 * *required* is decided per property kind by the rules below, not by this type.
 */
export type CommonPropertyDetailsValues = {
  /** Houses only. A flat is identified by `floor` instead. */
  bedrooms?: number
  /** Flats only — the floor the flat is on, which is the whole of its pricing input. */
  floor?: FlatFloor | null
  hasExtension?: YesNo
  hasConservatory?: YesNo
  /** Roof pricing for add-ons only — omit or null when no conservatory */
  conservatoryRoof?: ConservatoryRoofPricingInput | null
}

/**
 * One card per question, so it is obvious where one question ends and the next begins.
 * The card sits on a wrapper rather than on the <fieldset> itself because a bordered
 * fieldset breaks its own border open around the legend.
 *
 * The id is the scroll target for a failed submit — see focusFirstError below.
 */
function QuestionCard({ id, children }: { id: string; children: ReactNode }) {
  return <div id={id} className="gm-card p-5 md:p-6">{children}</div>
}

// Both stepper buttons are identical, so their class list lives in one place.
// Disabled swaps the fill, border and ink instead of fading: the minus button is
// disabled at a panel count of 1, a state customers reach by stepping down from
// the default of 10, and `line` (1.45:1) made the button vanish off the white card
// entirely. line-strong/70 keeps a visible shape. Hover is brand-600 (4.1:1) rather
// than brand-400 (2.3:1), which is under the 3:1 a control boundary needs.
const stepperButtonClass =
  'flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-white text-ink transition-colors hover:border-brand-600 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-line-strong/70 disabled:bg-surface disabled:text-ink-muted disabled:hover:border-line-strong/70 disabled:hover:bg-surface'

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
  const { register, handleSubmit, watch, setValue, setError, clearErrors, control, getValues, formState: { errors, isSubmitting } } = useForm<CommonPropertyDetailsValues>({
    defaultValues: {
      ...initialValues,
      floor: initialValues?.floor ?? null,
      conservatoryRoof: initialValues?.conservatoryRoof ?? null,
    },
    mode: 'onTouched',
  })

  // A flat is priced by which floor it is on and is asked nothing else: no bedroom
  // count, no extension, no conservatory. Asking would be inventing answers.
  const isFlat = propertyKind === 'flat'
  // One decision, used by all three uplift-dependent questions below. An unnamed kind
  // is still a house, so it keeps them.
  const askUplifts = propertyKind === null || supportsUplifts(propertyKind)

  // Every chip group is a radiogroup, which has to name its own legend and its own
  // error. The step is rendered once per route but the ids still come from useId so
  // they can never collide with another field group on the page.
  const groupId = useId()
  const ids = {
    floorCard: `${groupId}-floor-card`,
    floorLegend: `${groupId}-floor-legend`,
    floorError: `${groupId}-floor-error`,
    bedroomsCard: `${groupId}-bedrooms-card`,
    bedroomsLegend: `${groupId}-bedrooms-legend`,
    bedroomsError: `${groupId}-bedrooms-error`,
    extensionCard: `${groupId}-extension-card`,
    extensionLegend: `${groupId}-extension-legend`,
    extensionError: `${groupId}-extension-error`,
    conservatoryCard: `${groupId}-conservatory-card`,
    conservatoryLegend: `${groupId}-conservatory-legend`,
    conservatoryError: `${groupId}-conservatory-error`,
    roofCard: `${groupId}-roof-card`,
    roofLegend: `${groupId}-roof-legend`,
    roofError: `${groupId}-roof-error`,
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
  // Only one of floor/bedrooms is ever on screen, so listing both is harmless.
  const errorTargets: Array<[keyof CommonPropertyDetailsValues, string]> = [
    ['floor', ids.floorCard],
    ['bedrooms', ids.bedroomsCard],
    ['hasExtension', ids.extensionCard],
    ['hasConservatory', ids.conservatoryCard],
    ['conservatoryRoof', ids.roofCard],
  ]

  const focusFirstError = (formErrors: FieldErrors<CommonPropertyDetailsValues>) => {
    const first = errorTargets.find(([name]) => formErrors[name])
    if (first) revealQuestion(first[1])
  }

  const setBedrooms = useCostingStore((s) => s.setBedrooms)
  const setHasExtension = useCostingStore((s) => s.setHasExtension)
  const setHasConservatory = useCostingStore((s) => s.setHasConservatory)
  const setConservatoryRoofPricing = useCostingStore((s) => s.setConservatoryRoofPricing)

  // Use refs to track previous values to prevent infinite loops
  const prevBedroomsRef = useRef<number | undefined>(undefined);
  const prevHasExtensionRef = useRef<YesNo | undefined>(undefined);
  const prevHasConservatoryRef = useRef<YesNo | undefined>(undefined);

  // The costing store's propertyKind is set by whoever knows the sub-kinds — StepRenderer
  // on submit, App on resume. This step used to set it too, by parsing the heading text,
  // which meant two owners and one of them guessing.

  // Update costing context when form values change
  const bedrooms = watch('bedrooms');
  const hasExtensionValue = watch('hasExtension');
  const hasConservatoryValue = watch('hasConservatory')
  const conservatoryRoofValue = watch('conservatoryRoof')

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
    if (hasConservatoryValue === 'no') {
      setConservatoryRoofPricing(null)
      return
    }
    if (hasConservatoryValue === 'yes') {
      setConservatoryRoofPricing(conservatoryRoofValue ?? null)
    }
  }, [hasConservatoryValue, conservatoryRoofValue, setConservatoryRoofPricing])

  const hasExtension = watch('hasExtension') === 'yes'
  const bedroomOptions = includeSixPlus ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]

  const conservatoryPanelStepper =
    conservatoryRoofValue?.status === 'count' ? conservatoryRoofValue.panelCount : 10

  return (
    <StepForm onSubmit={handleSubmit((vals) => {
      if (isFlat) {
        // Only the floor ships. Anything else still sitting in form state belongs to a
        // house the customer answered for earlier in this session, and passing it on
        // would be inventing answers a flat was never asked for.
        onSubmit({ floor: vals.floor ?? null })
        return
      }
      const roof = getValues('conservatoryRoof')
      if (vals.hasConservatory === 'yes') {
        const ok =
          roof != null && (roof.status === 'count' || roof.status === 'unknown')
        // Normally unreachable — the Controller rule below blocks submission first.
        // If the two ever disagree, a bare `return` here left the customer pressing
        // Continue on a button that did nothing at all, with no error to explain it.
        if (!ok) {
          setError('conservatoryRoof', {
            type: 'manual',
            message: 'Please choose an option for conservatory roof panels',
          })
          revealQuestion(ids.roofCard)
          return
        }
      }
      // Listed field by field rather than spread, so a `floor` left over from a flat
      // the customer backed out of can never ride along with a house's answers.
      onSubmit({
        bedrooms: vals.bedrooms,
        hasExtension: vals.hasExtension,
        hasConservatory: vals.hasConservatory,
        conservatoryRoof:
          vals.hasConservatory === 'yes' ? (roof ?? undefined) : undefined,
      })
    }, focusFirstError)}>
      {/* No horizontal padding here: gm-page-column already supplies px-5, and the
          submit button lives outside this wrapper — an inset here left the cards
          16px in from a full-bleed Continue button on a phone. */}
      <div className="grid gap-6">
        {/* A flat names itself rather than using the display label: the label falls back
            to the generic "Property", and "Property Details" over a single floor
            question tells the customer nothing about what is being asked. */}
        <h2 className="text-xl md:text-2xl font-semibold text-brand-800">
          {isFlat ? 'Flat Details' : `${propertyType} Details`}
        </h2>

        {isFlat && (
          <QuestionCard id={ids.floorCard}>
            <fieldset className="grid gap-2 md:gap-3">
              <legend id={ids.floorLegend} className="pb-2 text-base font-semibold text-ink">Which floor is your flat on?*</legend>
              <div
                role="radiogroup"
                aria-labelledby={ids.floorLegend}
                aria-describedby={errors.floor ? ids.floorError : undefined}
                aria-invalid={errors.floor ? true : undefined}
                className="flex flex-wrap gap-2 md:gap-3"
              >
                {FLAT_FLOORS.map(({ value, label }) => (
                  <Chip
                    key={value}
                    label={label}
                    selected={watch('floor') === value}
                    withRing
                    onClick={() => setValue('floor', value, { shouldDirty: true, shouldValidate: true })}
                  />
                ))}
                <input type="hidden" {...register('floor', { required: 'Please select which floor your flat is on' })} />
              </div>
              {errors.floor?.message && (
                <div id={ids.floorError}>
                  <FieldError>{errors.floor.message}</FieldError>
                </div>
              )}
            </fieldset>
          </QuestionCard>
        )}

        {!isFlat && (
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
              <Chip
                label="Yes"
                selected={watch('hasConservatory') === 'yes'}
                withRing
                onClick={() => {
                  const wasNo = watch('hasConservatory') === 'no'
                  setValue('hasConservatory', 'yes', { shouldDirty: true, shouldValidate: true })
                  if (wasNo) {
                    // The one setValue on this step that must NOT validate: it resets a
                    // question the customer is only now being shown, so validating would
                    // publish "Please choose an option…" under chips they have not had a
                    // chance to touch. clearErrors gets the same clean slate without it.
                    setValue('conservatoryRoof', null, { shouldDirty: true })
                    clearErrors('conservatoryRoof')
                  }
                }}
              />
              <Chip
                label="No"
                selected={watch('hasConservatory') === 'no'}
                withRing
                onClick={() => {
                  setValue('hasConservatory', 'no', { shouldDirty: true, shouldValidate: true })
                  // Validating here is what retires a roof error left over from a
                  // previous "yes" — the rule passes as soon as hasConservatory is 'no'.
                  setValue('conservatoryRoof', null, { shouldDirty: true, shouldValidate: true })
                }}
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

        {askUplifts && watch('hasConservatory') === 'yes' && (
          <QuestionCard id={ids.roofCard}>
            <fieldset className="grid gap-2 md:gap-3">
              <legend id={ids.roofLegend} className="pb-2 text-base font-semibold text-ink">
                Approximately how many glazed roof panels does your conservatory have?*
              </legend>
              <p className="text-sm text-ink-muted">
                Count each main roof glazing unit (not side windows). This helps us quote roof cleaning accurately.
              </p>
              <div
                role="radiogroup"
                aria-labelledby={ids.roofLegend}
                aria-describedby={errors.conservatoryRoof ? ids.roofError : undefined}
                aria-invalid={errors.conservatoryRoof ? true : undefined}
                className="flex flex-wrap gap-2 md:gap-3"
              >
                <Chip
                  label="I can estimate"
                  selected={conservatoryRoofValue?.status === 'count'}
                  withRing
                  onClick={() =>
                    setValue(
                      'conservatoryRoof',
                      { status: 'count', panelCount: conservatoryPanelStepper },
                      { shouldDirty: true, shouldValidate: true },
                    )
                  }
                />
                <Chip
                  label={"I'm not sure — confirmed on visit"}
                  selected={conservatoryRoofValue?.status === 'unknown'}
                  withRing
                  onClick={() =>
                    setValue('conservatoryRoof', { status: 'unknown' }, { shouldDirty: true, shouldValidate: true })
                  }
                />
              </div>
              {conservatoryRoofValue?.status === 'count' && (
                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:gap-4">
                  <span className="text-sm font-medium text-ink">Panel count</span>
                  <NumberStepper
                    value={conservatoryRoofValue.panelCount}
                    onChange={(n) =>
                      setValue(
                        'conservatoryRoof',
                        { status: 'count', panelCount: n },
                        { shouldDirty: true, shouldValidate: true },
                      )
                    }
                    min={1}
                    max={120}
                    label="conservatory roof panels"
                  />
                </div>
              )}
              <Controller
                control={control}
                name="conservatoryRoof"
                rules={{
                  validate: (v, formValues) => {
                    if (formValues.hasConservatory !== 'yes') return true
                    return (
                      (v != null &&
                        typeof v === 'object' &&
                        (v.status === 'count' || v.status === 'unknown')) ||
                      'Please choose an option for conservatory roof panels'
                    )
                  },
                }}
                render={({ field }) => (
                  <input
                    ref={field.ref}
                    type="hidden"
                    name={field.name}
                    value={
                      field.value == null ? '' : JSON.stringify(field.value as ConservatoryRoofPricingInput)
                    }
                    onChange={(e) => {
                      const raw = e.target.value
                      try {
                        field.onChange(
                          raw === ''
                            ? null
                            : (JSON.parse(raw) as ConservatoryRoofPricingInput),
                        )
                      } catch {
                        field.onChange(null)
                      }
                    }}
                    onBlur={field.onBlur}
                    tabIndex={-1}
                    aria-hidden
                  />
                )}
              />
              {errors.conservatoryRoof && (
                <div id={ids.roofError}>
                  <FieldError>
                    {typeof errors.conservatoryRoof.message === 'string' ? errors.conservatoryRoof.message : 'Invalid selection'}
                  </FieldError>
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