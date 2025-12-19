import { useForm } from 'react-hook-form'
import Button from '@/components/ui/button'
import Chip from '@/components/ui/chip'
import StepForm from '@/components/form/StepForm'
import InfoNote from '@/components/ui/InfoNote'
import type { YesNo } from '@/types'
import { useCosting } from '@/hooks/useCosting'
import { useEffect, useRef } from 'react'
import { HouseKind } from '@/lib/costing-calc'

export type CommonPropertyDetailsValues = {
  bedrooms: number
  hasLoftConversion: YesNo
  hasExtension: YesNo
  hasConservatory: YesNo
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
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<CommonPropertyDetailsValues>({
    defaultValues: {
      ...initialValues,
    },
    mode: 'onTouched',
  })

  // Get costing context
  const costing = useCosting();

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

    // Update the costing context with the property kind
    costing.setPropertyKind(kind);
  }, [propertyType, costing]);

  // Update costing context when form values change
  const bedrooms = watch('bedrooms');
  const hasExtensionValue = watch('hasExtension');
  const hasConservatoryValue = watch('hasConservatory');

  useEffect(() => {
    if (bedrooms && prevBedroomsRef.current !== bedrooms) {
      prevBedroomsRef.current = bedrooms;
      costing.setBedrooms(bedrooms);
    }
  }, [bedrooms, costing]);

  useEffect(() => {
    if (hasExtensionValue && prevHasExtensionRef.current !== hasExtensionValue) {
      prevHasExtensionRef.current = hasExtensionValue;
      costing.setHasExtension(hasExtensionValue);
    }
  }, [hasExtensionValue, costing]);

  useEffect(() => {
    if (hasConservatoryValue && prevHasConservatoryRef.current !== hasConservatoryValue) {
      prevHasConservatoryRef.current = hasConservatoryValue;
      costing.setHasConservatory(hasConservatoryValue);
    }
  }, [hasConservatoryValue, costing]);

  const hasLoftConversion = watch('hasLoftConversion') === 'yes'
  const hasExtension = watch('hasExtension') === 'yes'
  const bedroomOptions = includeSixPlus ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]

  return (
    <StepForm onSubmit={handleSubmit(onSubmit)}>
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
          <legend className="text-sm md:text-base font-medium text-[#BF8639] pb-2">Do you have a loft conversion?</legend>
          <div className="flex flex-wrap gap-2 md:gap-3">
            <Chip
              label="Yes"
              selected={watch('hasLoftConversion') === 'yes'}
              onClick={() => setValue('hasLoftConversion', 'yes', { shouldDirty: true })}
            />
            <Chip
              label="No"
              selected={watch('hasLoftConversion') === 'no'}
              onClick={() => setValue('hasLoftConversion', 'no', { shouldDirty: true })}
            />
            <input type="hidden" {...register('hasLoftConversion', { required: 'Please select if you have a loft conversion' })} />
          </div>
          {errors.hasLoftConversion && <p className="text-xs text-red-300">{errors.hasLoftConversion.message}</p>}
        </fieldset>

        {hasLoftConversion && (
          <InfoNote>
            We are unable to clean second floor velux windows. We do clean second floor dormer windows, which are included in your quote.
          </InfoNote>
        )}

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
              onClick={() => setValue('hasConservatory', 'yes', { shouldDirty: true })}
            />
            <Chip
              label="No"
              selected={watch('hasConservatory') === 'no'}
              onClick={() => setValue('hasConservatory', 'no', { shouldDirty: true })}
            />
            <input type="hidden" {...register('hasConservatory', { required: 'Please select if you have a conservatory' })} />
          </div>
          {errors.hasConservatory && <p className="text-xs text-red-300">{errors.hasConservatory.message}</p>}
        </fieldset>

        {watch('hasConservatory') === 'yes' && (
          <InfoNote>We clean the sides on the conservatory not the roof</InfoNote>
        )}
      </div>

      <div className="mt-6 flex justify-center">
        <Button type="submit" className="w-full">Continue</Button>
      </div>
    </StepForm>
  )
}