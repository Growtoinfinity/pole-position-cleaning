import { useForm } from 'react-hook-form'
import type { FieldErrors } from 'react-hook-form'
import Button from '@/components/ui/button'
import Chip from '@/components/ui/chip'
import StepForm from '@/components/form/StepForm'
import InfoNote from '@/components/ui/InfoNote'
import FieldError from '@/components/ui/FieldError'
import type { YesNo } from '@/types'
import { useCostingStore } from '@/stores/costingStore'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import type { HouseKind } from '@/lib/costing-calc'
import { MANUAL_QUOTE_BEDROOMS } from '@/lib/pricing'

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
   * nothing in the response to say so (§6 of docs/pricing_api_poleposition.md).
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
  /**
   * A GATE, not a count. This client charges once for the property and has no
   * `number_of_velux` input — §3 of docs/pricing_api_poleposition.md.
   */
  hasVelux?: YesNo
  /**
   * "Can we reach every external window without going through the property or
   * needing someone home?"
   *
   * Not a surcharge. Answering 'no' prices the three external window services at
   * `max(0.5 x full, 14.00)` and leaves everything else at full price (§7c).
   */
  hasOutdoorAccess?: YesNo
}

/**
 * One card per question, so it is obvious where one question ends and the next begins.
 * The card sits on a wrapper rather than on the <fieldset> itself because a bordered
 * fieldset breaks its own border open around the legend.
 *
 * The id is the scroll target for a failed submit — see focusFirstError below.
 */
function QuestionCard({ id, children }: { id: string; children: ReactNode }) {
  return <div id={id} className="pp-card p-5 md:p-6">{children}</div>
}

export default function CommonPropertyDetailsStep({
  initialValues,
  onSubmit,
  propertyType,
  propertyKind,
  plusFrom = MANUAL_QUOTE_BEDROOMS,
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
  /**
   * The top bedroom chip, which always reads "N+" and means "N or more".
   *
   * Was `includeSixPlus`, a boolean that could only ever say 5 or 6. It is a number now
   * because the two flows stopped agreeing on where the open-ended band starts: the
   * standard branch closes at `MANUAL_QUOTE_BEDROOMS` (5+, which leaves for the
   * large/unusual branch the moment it is picked), while the large/unusual branch itself
   * carries on to 6+ — a lead a human is already quoting is worth asking the extra
   * question, and collapsing its top two chips would throw away the one distinction
   * whoever prices it actually has to make.
   */
  plusFrom?: number
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
  // No per-kind gating any more. A flat used to be asked none of the surcharge
  // questions, because none of them can move a flat's price — its cells carry no `add`
  // object. On this client that is a dead quote rather than a saving: `requiredInputs`
  // is global, so a flat missing `loft` or `velux` is refused on every row exactly as a
  // house is (§3, §6). Everyone answers everything.

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
    outdoorAccessCard: `${groupId}-outdoor-access-card`,
    outdoorAccessLegend: `${groupId}-outdoor-access-legend`,
    outdoorAccessError: `${groupId}-outdoor-access-error`,
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
    ['hasOutdoorAccess', ids.outdoorAccessCard],
    ['bedrooms', ids.bedroomsCard],
    ['hasConservatory', ids.conservatoryCard],
    ['hasExtension', ids.extensionCard],
    ['hasVelux', ids.veluxCard],
    ['hasLoftConversion', ids.loftCard],
  ]

  const focusFirstError = (formErrors: FieldErrors<CommonPropertyDetailsValues>) => {
    const first = errorTargets.find(([name]) => formErrors[name])
    if (first) revealQuestion(first[1])
  }

  const setBedrooms = useCostingStore((s) => s.setBedrooms)
  const setHasExtension = useCostingStore((s) => s.setHasExtension)
  const setHasConservatory = useCostingStore((s) => s.setHasConservatory)
  const setHasLoftConversion = useCostingStore((s) => s.setHasLoftConversion)
  const setHasVelux = useCostingStore((s) => s.setHasVelux)
  const setHasOutdoorAccess = useCostingStore((s) => s.setHasOutdoorAccess)

  // Use refs to track previous values to prevent infinite loops
  const prevBedroomsRef = useRef<number | undefined>(undefined);
  const prevHasExtensionRef = useRef<YesNo | undefined>(undefined);
  const prevHasConservatoryRef = useRef<YesNo | undefined>(undefined);
  const prevHasLoftRef = useRef<YesNo | undefined>(undefined);
  const prevVeluxRef = useRef<YesNo | undefined>(undefined);
  const prevOutdoorAccessRef = useRef<YesNo | undefined>(undefined);

  // The costing store's propertyKind is set by whoever knows the sub-kinds — StepRenderer
  // on submit, App on resume. This step used to set it too, by parsing the heading text,
  // which meant two owners and one of them guessing.

  // Update costing context when form values change
  const bedrooms = watch('bedrooms');
  const hasExtensionValue = watch('hasExtension');
  const hasConservatoryValue = watch('hasConservatory')
  const hasLoftValue = watch('hasLoftConversion')
  const hasVeluxWatch = watch('hasVelux')
  const hasOutdoorAccessWatch = watch('hasOutdoorAccess')

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

  useEffect(() => {
    if (hasVeluxWatch && prevVeluxRef.current !== hasVeluxWatch) {
      prevVeluxRef.current = hasVeluxWatch
      setHasVelux(hasVeluxWatch)
    }
  }, [hasVeluxWatch, setHasVelux])

  useEffect(() => {
    if (hasOutdoorAccessWatch && prevOutdoorAccessRef.current !== hasOutdoorAccessWatch) {
      prevOutdoorAccessRef.current = hasOutdoorAccessWatch
      setHasOutdoorAccess(hasOutdoorAccessWatch)
    }
  }, [hasOutdoorAccessWatch, setHasOutdoorAccess])

  const hasExtension = watch('hasExtension') === 'yes'
  const noOutdoorAccess = watch('hasOutdoorAccess') === 'no'
  // 1 .. plusFrom, where the last one is the open-ended band rather than an exact count.
  const bedroomOptions = Array.from({ length: plusFrom }, (_, i) => i + 1)

  return (
    <StepForm onSubmit={handleSubmit((vals) => {
      // Every property ships every answer, a flat included. The flat shortcut that used
      // to live here — send the bedroom count alone — is refused outright by this
      // client: `requiredInputs` is global, so a flat missing `loft` or `velux` answers
      // `missing_inputs` on all eight rows and nothing prices at all (§3).
      //
      // Listed field by field rather than spread, so an answer left over from a property
      // the customer backed out of can never ride along. Anything added to
      // CommonPropertyDetailsValues must be added HERE too — a field left off this list
      // is silently dropped on the way to the store, the CRM and Supabase, and nothing
      // errors.
      onSubmit({
        hasOutdoorAccess: vals.hasOutdoorAccess,
        bedrooms: vals.bedrooms,
        hasConservatory: vals.hasConservatory,
        hasExtension: vals.hasExtension,
        hasVelux: vals.hasVelux,
        hasLoftConversion: vals.hasLoftConversion,
      })
    }, focusFirstError)}>
      {/* No horizontal padding here: pp-page-column already supplies px-5, and the
          submit button lives outside this wrapper — an inset here left the cards
          16px in from a full-bleed Continue button on a phone. */}
      <div className="grid gap-6">
        {/* A flat names itself rather than using the display label: the label falls back
            to the generic "Property", and "Property Details" over a single floor
            question tells the customer nothing about what is being asked. */}
        <h2 className="text-xl md:text-2xl font-semibold">
          {isFlat ? 'Flat Details' : `${propertyType} Details`}
        </h2>

        <QuestionCard id={ids.outdoorAccessCard}>
          <fieldset className="grid gap-2 md:gap-3">
            <legend id={ids.outdoorAccessLegend} className="pb-2 text-base font-semibold text-ink">
              Can we access and clean all external windows without needing to go through
              the property or rely on someone being home?*
            </legend>
            <p className="-mt-1 pb-1 text-sm text-ink-muted">
              Think locked side gates, a shared rear yard, or a back garden that can only
              be reached through the house.
            </p>
            <div
              role="radiogroup"
              aria-labelledby={ids.outdoorAccessLegend}
              aria-describedby={errors.hasOutdoorAccess ? ids.outdoorAccessError : undefined}
              aria-invalid={errors.hasOutdoorAccess ? true : undefined}
              className="flex flex-wrap gap-2 md:gap-3"
            >
              {/*
                The only answer on this step that is not a surcharge. "No" switches the
                three external window services to a front-only price —
                max(0.5 x full, GBP 14.00) — and leaves gutter, fascia, internal windows
                and both conservatory roofs at their full price (§7c).

                It is asked FIRST because it decides which half of the price list the rest
                of the answers are priced against, and because a customer who cannot give
                access should find that out before filling in five more questions.
              */}
              <Chip
                label="Yes"
                selected={watch('hasOutdoorAccess') === 'yes'}
                withRing
                onClick={() => setValue('hasOutdoorAccess', 'yes', { shouldDirty: true, shouldValidate: true })}
              />
              <Chip
                label="No"
                selected={watch('hasOutdoorAccess') === 'no'}
                withRing
                onClick={() => setValue('hasOutdoorAccess', 'no', { shouldDirty: true, shouldValidate: true })}
              />
              <input type="hidden" {...register('hasOutdoorAccess', { required: 'Please let us know whether we can reach all your windows' })} />
            </div>
            {errors.hasOutdoorAccess?.message && (
              <div id={ids.outdoorAccessError}>
                <FieldError>{errors.hasOutdoorAccess.message}</FieldError>
              </div>
            )}
          </fieldset>
        </QuestionCard>

        {noOutdoorAccess && (
          <InfoNote>
            No problem — we&rsquo;ll quote you for cleaning the windows we can reach from
            the front. Gutter, fascia, internal and conservatory roof cleaning are
            unaffected.
          </InfoNote>
        )}

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
                  label={num === plusFrom ? `${num}+` : num.toString()}
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

        {hasExtension && (
          <InfoNote>Any 1st storey Velux windows & sky lanterns will be included in your quote</InfoNote>
        )}



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
              {/*
                A yes/no GATE, and there is no follow-up count. This client charges once
                for the property however many Velux it has, and has no `number_of_velux`
                input at all — the CRM field of that name is a leftover from the
                sub-account clone that nothing reads (§3). Asking "how many" would collect
                a number with nowhere to go and imply a per-window price that does not
                exist.
              */}
              <Chip
                label="Yes"
                selected={watch('hasVelux') === 'yes'}
                withRing
                onClick={() => setValue('hasVelux', 'yes', { shouldDirty: true, shouldValidate: true })}
              />
              <Chip
                label="No"
                selected={watch('hasVelux') === 'no'}
                withRing
                onClick={() => setValue('hasVelux', 'no', { shouldDirty: true, shouldValidate: true })}
              />
              <input type="hidden" {...register('hasVelux', { required: 'Please select if you have Velux windows' })} />
            </div>
            {errors.hasVelux?.message && (
              <div id={ids.veluxError}>
                <FieldError>{errors.hasVelux.message}</FieldError>
              </div>
            )}
          </fieldset>
        </QuestionCard>

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
      </div>

      <div className="mt-6 flex justify-center">
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Please wait...' : 'Continue'}
        </Button>
      </div>
    </StepForm>
  )
}