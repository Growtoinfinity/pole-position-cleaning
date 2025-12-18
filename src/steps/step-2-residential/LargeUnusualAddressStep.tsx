import { useForm } from 'react-hook-form'
import Label from '@/components/ui/label'
import Input from '@/components/ui/input'
import Button from '@/components/ui/button'
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
  const { register, handleSubmit, formState: { errors } } = useForm<LargeUnusualAddressValues>({
    defaultValues: initialValues ?? {
      address1: '',
      city: '',
      postcode: '',
    },
    mode: 'onTouched',
  })

  return (
    <StepForm onSubmit={handleSubmit(onSubmit)} className="mx-auto w-full max-w-3xl space-y-6 px-6">
      <h2 className="text-left text-2xl font-semibold text-[#BF8639]">Please enter your address</h2>

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="address1">First line of address*</Label>
          <Input
            id="address1"
            placeholder="Address line 1"
            {...register('address1', { required: 'Address is required' })}
          />
          {errors.address1 && <p className="text-xs text-red-300">{errors.address1.message}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="city">Town*</Label>
            <Input
              id="city"
              placeholder="City or town"
              {...register('city', { required: 'City/Town is required' })}
            />
            {errors.city && <p className="text-xs text-red-300">{errors.city.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="postcode">Postcode*</Label>
            <Input
              id="postcode"
              placeholder="Postcode"
              {...register('postcode', { required: 'Postcode is required' })}
            />
            {errors.postcode && <p className="text-xs text-red-300">{errors.postcode.message}</p>}
          </div>
        </div>
      </div>

      <div className="flex justify-center pt-2">
        <Button type="submit" className="w-full">Continue</Button>
      </div>
    </StepForm>
  )
}