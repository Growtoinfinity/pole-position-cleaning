import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import Button from '@/components/ui/button'
import StepForm from '@/components/form/StepForm'
import Chip from '@/components/ui/chip'
import InfoNote from '@/components/ui/InfoNote'
import { useCostingStore } from '@/stores/costingStore'

export type LargeUnusualPropertyDetailsValues = {
  bedrooms: number
  hasLoftConversion: 'yes' | 'no'
  hasExtension: 'yes' | 'no'
  hasConservatory: 'yes' | 'no'
}

export default function LargeUnusualPropertyDetails({
  initialValues,
  onSubmit,
}: {
  initialValues?: LargeUnusualPropertyDetailsValues
  onSubmit: (values: LargeUnusualPropertyDetailsValues) => void
}) {
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<LargeUnusualPropertyDetailsValues>({
    defaultValues: initialValues ?? {
      bedrooms: undefined,
      hasLoftConversion: undefined,
      hasExtension: undefined,
      hasConservatory: undefined,
    },
    mode: 'onTouched',
  })

  const costing = useCostingStore()
  const prevBedroomsRef = useRef<number | undefined>(undefined);
  const prevHasExtensionRef = useRef<'yes' | 'no' | undefined>(undefined);
  const prevHasConservatoryRef = useRef<'yes' | 'no' | undefined>(undefined);

  // Update costing context when bedroom count changes
  const bedrooms = watch('bedrooms');
  const hasExtension = watch('hasExtension');
  const hasConservatory = watch('hasConservatory');

  useEffect(() => {
    if (bedrooms && prevBedroomsRef.current !== bedrooms) {
      prevBedroomsRef.current = bedrooms;
      costing.setBedrooms(bedrooms);
    }
  }, [bedrooms, costing]);

  useEffect(() => {
    if (hasExtension && prevHasExtensionRef.current !== hasExtension) {
      prevHasExtensionRef.current = hasExtension;
      costing.setHasExtension(hasExtension);
    }
  }, [hasExtension, costing]);

  useEffect(() => {
    if (hasConservatory && prevHasConservatoryRef.current !== hasConservatory) {
      prevHasConservatoryRef.current = hasConservatory;
      costing.setHasConservatory(hasConservatory);
    }
  }, [hasConservatory, costing]);

  const hasLoftConversion = watch('hasLoftConversion') === 'yes'
  const noLoftConversion = watch('hasLoftConversion') === 'no'
  const hasExtensionYes = watch('hasExtension') === 'yes'
  
  // Bedroom options for Large/Unusual (1-6)
  const bedroomOptions = [1, 2, 3, 4, 5, 6]

  return (
    <StepForm onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 md:gap-6 px-4 md:px-0">
        <h2 className="text-left text-xl md:text-2xl font-semibold text-[#BF8639]">
          Property Details
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
              selected={hasLoftConversion}
              onClick={() => setValue('hasLoftConversion', 'yes', { shouldDirty: true })}
            />
            <Chip
              label="No"
              selected={noLoftConversion}
              onClick={() => setValue('hasLoftConversion', 'no', { shouldDirty: true })}
            />
            <input type="hidden" {...register('hasLoftConversion', { required: 'Please select an option' })} />
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
              selected={hasExtensionYes}
              onClick={() => setValue('hasExtension', 'yes', { shouldDirty: true })}
            />
            <Chip
              label="No"
              selected={watch('hasExtension') === 'no'}
              onClick={() => setValue('hasExtension', 'no', { shouldDirty: true })}
            />
            <input type="hidden" {...register('hasExtension', { required: 'Please select an option' })} />
          </div>
          {errors.hasExtension && <p className="text-xs text-red-300">{errors.hasExtension.message}</p>}
        </fieldset>

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
            <input type="hidden" {...register('hasConservatory', { required: 'Please select an option' })} />
          </div>
          {errors.hasConservatory && <p className="text-xs text-red-300">{errors.hasConservatory.message}</p>}
        </fieldset>
      </div>

      <div className="flex justify-center pt-6">
        <Button type="submit" disabled={isSubmitting}>
          Continue
        </Button>
      </div>
    </StepForm>
  )
}
