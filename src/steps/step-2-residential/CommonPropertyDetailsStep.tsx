import { Controller, useForm } from 'react-hook-form'
import Button from '@/components/ui/button'
import Chip from '@/components/ui/chip'
import StepForm from '@/components/form/StepForm'
import InfoNote from '@/components/ui/InfoNote'
import type { YesNo } from '@/types'
import { useCostingStore } from '@/stores/costingStore'
import { useEffect, useRef } from 'react'
import type { ConservatoryRoofPricingInput, HouseKind } from '@/lib/costing-calc'

export type CommonPropertyDetailsValues = {
  bedrooms: number
  hasExtension: YesNo
  hasConservatory: YesNo
  /** Roof pricing for add-ons only — omit or null when no conservatory */
  conservatoryRoof?: ConservatoryRoofPricingInput | null
}

export default function CommonPropertyDetailsStep({
  initialValues,
  onSubmit,
  propertyType,
  includeSixPlus = false,
}: {
  initialValues?: Partial<CommonPropertyDetailsValues>
  onSubmit: (values: CommonPropertyDetailsValues) => void
  propertyType: string
  includeSixPlus?: boolean
}) {
  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<CommonPropertyDetailsValues>({
    defaultValues: {
      ...initialValues,
      conservatoryRoof: initialValues?.conservatoryRoof ?? null,
    },
    mode: 'onTouched',
  })

  const setPropertyKind = useCostingStore((s) => s.setPropertyKind)
  const setBedrooms = useCostingStore((s) => s.setBedrooms)
  const setHasExtension = useCostingStore((s) => s.setHasExtension)
  const setHasConservatory = useCostingStore((s) => s.setHasConservatory)
  const setConservatoryRoofPricing = useCostingStore((s) => s.setConservatoryRoofPricing)

  // Use refs to track previous values to prevent infinite loops
  const prevPropertyTypeRef = useRef(propertyType);
  const prevBedroomsRef = useRef<number | undefined>(undefined);
  const prevHasExtensionRef = useRef<YesNo | undefined>(undefined);
  const prevHasConservatoryRef = useRef<YesNo | undefined>(undefined);

  // Map propertyType to HouseKind
  useEffect(() => {
    // Skip if property type hasn't changed
    if (prevPropertyTypeRef.current === propertyType) {
      return;
    }

    prevPropertyTypeRef.current = propertyType;

    let kind: HouseKind | null = null;

    // Convert the displayed property type to the HouseKind expected by the calculator
    if (propertyType.includes('Bungalow')) {
      // For bungalows, extract the type from the property name
      if (propertyType.includes('Semi-Detached')) {
        kind = 'semi_detached';
      } else if (propertyType.includes('Terraced')) {
        kind = 'terraced';
      } else if (propertyType.includes('Detached')) {
        kind = 'detached';
      }
    } else if (propertyType.includes('Townhouse')) {
      // For townhouses, always use townhouse regardless of subtype
      kind = 'townhouse';
    } else if (propertyType.includes('Semi-Detached')) {
      kind = 'semi_detached';
    } else if (propertyType.includes('Terraced')) {
      kind = 'terraced';
    } else if (propertyType.includes('Detached')) {
      kind = 'detached';
    }

    setPropertyKind(kind)
  }, [propertyType, setPropertyKind])

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

  const NumberStepper = ({
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
  }) => (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="h-9 w-9 rounded-full border border-white/35 bg-[#013252] text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#BF8639]/80 hover:bg-white/10 transition-colors"
        aria-label={`Decrease ${label}`}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
      </button>
      <span className="text-lg font-semibold text-white min-w-[2.5rem] text-center">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="h-9 w-9 rounded-full border border-white/35 bg-[#013252] text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#BF8639]/80 hover:bg-white/10 transition-colors"
        aria-label={`Increase ${label}`}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  )

  return (
    <StepForm onSubmit={handleSubmit((vals) => {
      if (vals.hasConservatory === 'yes') {
        const roof = vals.conservatoryRoof
        const ok =
          roof != null && (roof.status === 'count' || roof.status === 'unknown')
        if (!ok) return
      }
      onSubmit({
        ...vals,
        conservatoryRoof:
          vals.hasConservatory === 'yes'
            ? (vals.conservatoryRoof ?? undefined)
            : undefined,
      })
    })}>
      <div className="grid gap-4 md:gap-6 px-4 md:px-0">
        <h2 className="text-left text-xl md:text-2xl font-semibold text-[#BF8639]">
          {propertyType} Details
        </h2>

        <fieldset className="grid gap-2 md:gap-3">
          <legend className="text-sm md:text-base font-medium text-[#BF8639] pb-2">How many bedrooms?</legend>
          <div className="flex flex-wrap gap-2 md:gap-3">
            {bedroomOptions.map((num) => (
              <Chip
                key={num}
                label={num === 6 ? '6+' : num.toString()}
                selected={watch('bedrooms') === num}
                onClick={() => setValue('bedrooms', num, { shouldDirty: true })}
              />
            ))}
            <input type="hidden" {...register('bedrooms', { valueAsNumber: true, required: 'Please select the number of bedrooms' })} />
          </div>
          {errors.bedrooms && <p className="text-xs text-red-300">{errors.bedrooms.message}</p>}
        </fieldset>

        <fieldset className="grid gap-2 md:gap-3">
          <legend className="text-sm md:text-base font-medium text-[#BF8639] pb-2">Do you have a side or rear extension?</legend>
          <div className="flex flex-wrap gap-2 md:gap-3">
            <Chip
              label="Yes"
              selected={watch('hasExtension') === 'yes'}
              onClick={() => setValue('hasExtension', 'yes', { shouldDirty: true })}
            />
            <Chip
              label="No"
              selected={watch('hasExtension') === 'no'}
              onClick={() => setValue('hasExtension', 'no', { shouldDirty: true })}
            />
            <input type="hidden" {...register('hasExtension', { required: 'Please select if you have an extension' })} />
          </div>
          {errors.hasExtension && <p className="text-xs text-red-300">{errors.hasExtension.message}</p>}
        </fieldset>

        {hasExtension && (
          <InfoNote>Any 1st storey Velux windows & sky lanterns will be included in your quote</InfoNote>
        )}

        <fieldset className="grid gap-2 md:gap-3">
          <legend className="text-sm md:text-base font-medium text-[#BF8639] pb-2">Do you have a conservatory?</legend>
          <div className="flex flex-wrap gap-2 md:gap-3">
            <Chip
              label="Yes"
              selected={watch('hasConservatory') === 'yes'}
              onClick={() => {
                const wasNo = watch('hasConservatory') === 'no'
                setValue('hasConservatory', 'yes', { shouldDirty: true })
                if (wasNo) {
                  setValue('conservatoryRoof', null, { shouldDirty: true })
                }
              }}
            />
            <Chip
              label="No"
              selected={watch('hasConservatory') === 'no'}
              onClick={() => {
                setValue('hasConservatory', 'no', { shouldDirty: true })
                setValue('conservatoryRoof', null, { shouldDirty: true })
              }}
            />
            <input type="hidden" {...register('hasConservatory', { required: 'Please select if you have a conservatory' })} />
          </div>
          {errors.hasConservatory && <p className="text-xs text-red-300">{errors.hasConservatory.message}</p>}
        </fieldset>

        {watch('hasConservatory') === 'yes' && (
          <InfoNote>We clean the sides on the conservatory not the roof</InfoNote>
        )}

        {watch('hasConservatory') === 'yes' && (
          <fieldset className="grid gap-2 md:gap-3">
            <legend className="text-sm md:text-base font-medium text-[#BF8639] pb-2">
              Approximately how many glazed roof panels does your conservatory have?
            </legend>
            <p className="text-xs text-white/70 -mt-1 mb-1">
              Count each main roof glazing unit (not side windows). This helps us quote roof cleaning accurately.
            </p>
            <div className="flex flex-wrap gap-2 md:gap-3">
              <Chip
                label="I can estimate"
                selected={conservatoryRoofValue?.status === 'count'}
                onClick={() =>
                  setValue(
                    'conservatoryRoof',
                    { status: 'count', panelCount: conservatoryPanelStepper },
                    { shouldDirty: true },
                  )
                }
              />
              <Chip
                label={"I'm not sure — confirmed on visit"}
                selected={conservatoryRoofValue?.status === 'unknown'}
                onClick={() => setValue('conservatoryRoof', { status: 'unknown' }, { shouldDirty: true })}
              />
            </div>
            {conservatoryRoofValue?.status === 'count' && (
              <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:gap-4">
                <span className="text-sm text-white/90">Panel count</span>
                <NumberStepper
                  value={conservatoryRoofValue.panelCount}
                  onChange={(n) => setValue('conservatoryRoof', { status: 'count', panelCount: n }, { shouldDirty: true })}
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
              <p className="text-xs text-red-300">
                {typeof errors.conservatoryRoof.message === 'string' ? errors.conservatoryRoof.message : 'Invalid selection'}
              </p>
            )}
          </fieldset>
        )}
      </div>

      <div className="mt-6 flex justify-center">
        <Button type="submit" className="w-full">Continue</Button>
      </div>
    </StepForm>
  )
}