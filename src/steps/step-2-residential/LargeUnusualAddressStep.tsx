import { useForm } from 'react-hook-form'
import Label from '@/components/ui/label'
import Input from '@/components/ui/input'
import Button from '@/components/ui/button'
import FieldError from '@/components/ui/FieldError'
import StepForm from '@/components/form/StepForm'

export type LargeUnusualAddressValues = {
  address1: string
  city: string
  postcode: string
}

export default function LargeUnusualAddressStep({
  initialValues,
  onSubmit,
}: {
  initialValues?: LargeUnusualAddressValues
  onSubmit: (values: LargeUnusualAddressValues) => void
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LargeUnusualAddressValues>({
    defaultValues: initialValues ?? {
      address1: '',
      city: '',
      postcode: '',
    },
    mode: 'onTouched',
  })

  return (
    <StepForm onSubmit={handleSubmit(onSubmit)} className="gm-step-column space-y-6">
      <h2 className="text-xl md:text-2xl font-semibold text-brand-800">Please enter your address</h2>

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="address1">First line of address*</Label>
          <Input
            id="address1"
            placeholder="Address line 1"
            invalid={!!errors.address1}
            {...register('address1', { required: 'Address is required' })}
          />
          <FieldError>{errors.address1?.message}</FieldError>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="city">Town*</Label>
            <Input
              id="city"
              placeholder="City or town"
              invalid={!!errors.city}
              {...register('city', { required: 'City/Town is required' })}
            />
            <FieldError>{errors.city?.message}</FieldError>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="postcode">Postcode*</Label>
            <Input
              id="postcode"
              placeholder="Postcode"
              invalid={!!errors.postcode}
              {...register('postcode', { required: 'Postcode is required' })}
            />
            <FieldError>{errors.postcode?.message}</FieldError>
          </div>
        </div>
      </div>

      <div className="flex justify-center pt-2">
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
      </div>
    </StepForm>
  )
}
