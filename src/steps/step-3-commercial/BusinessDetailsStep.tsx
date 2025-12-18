import { useForm, Controller } from 'react-hook-form'
import Label from '@/components/ui/label'
import Input from '@/components/ui/input'
import Button from '@/components/ui/button'
import StepForm from '@/components/form/StepForm'

export type BusinessDetailsValues = {
  businessName: string
  buildingType: string
  cleaningTypes: string[]
  address1: string
  city: string
  postcode: string
}

const CLEANING_TYPE_OPTIONS = [
  'Regular window cleaning',
  'One-off deep clean',
  'Post-construction cleaning',
  'Gutter cleaning',
  'Facade cleaning',
  'Other'
]

export default function BusinessDetailsStep({
  initialValues,
  onSubmit,
}: {
  initialValues?: BusinessDetailsValues
  onSubmit: (values: BusinessDetailsValues) => void
}) {
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<BusinessDetailsValues>({
    defaultValues: initialValues ?? {
      businessName: '',
      buildingType: '',
      cleaningTypes: [],
      address1: '',
      city: '',
      postcode: ''
    },
    mode: 'onTouched',
  })

  return (
    <StepForm onSubmit={handleSubmit(onSubmit)} className="mx-auto w-full max-w-4xl space-y-6 px-6">
      <h2 className="text-left text-2xl font-semibold text-[#BF8639]">Business details</h2>

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="businessName">Business Name*</Label>
          <Input
            id="businessName"
            type="text"
            placeholder="e.g. Kings Window Cleaning Ltd"
            {...register('businessName', { required: 'Business name is required' })}
            aria-required="true"
          />
          {errors.businessName && (
            <p className="text-xs text-red-300">{errors.businessName.message}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="buildingType">Building Type*</Label>
          <select
            id="buildingType"
            className="h-10 md:h-11 w-full rounded-md border border-white/20 bg-[#013252] px-3 py-2 text-sm text-white ring-offset-background placeholder:text-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BF8639] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            {...register('buildingType', { required: 'Building type is required' })}
          >
            <option value="">Please select</option>
            <option value="Office">Office</option>
            <option value="Retail">Retail</option>
            <option value="Restaurant/Café">Restaurant/Café</option>
            <option value="Industrial/Warehouse">Industrial/Warehouse</option>
            <option value="Healthcare">Healthcare</option>
            <option value="Education">Education</option>
            <option value="Other">Other</option>
          </select>
          {errors.buildingType && (
            <p className="text-xs text-red-300">{errors.buildingType.message}</p>
          )}
        </div>

        <Controller
          name="cleaningTypes"
          control={control}
          rules={{ 
            validate: (value) => value.length > 0 || 'Please select at least one cleaning type' 
          }}
          render={({ field }) => (
            <div className="grid gap-1.5">
              <Label htmlFor="cleaningTypes">Type of Cleaning Required*</Label>
              
              {/* Selected Tags Display */}
              {field.value.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 rounded-md border border-white/20 bg-[#013252] min-h-[42px]">
                  {field.value.map((type) => (
                    <span
                      key={type}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-[#BF8639] text-white text-sm"
                    >
                      {type}
                      <button
                        type="button"
                        onClick={() => {
                          field.onChange(field.value.filter((t) => t !== type))
                        }}
                        className="ml-1 hover:text-red-300"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Dropdown Selector */}
              <select
                id="cleaningTypes"
                className="h-10 md:h-11 w-full rounded-md border border-white/20 bg-[#013252] px-3 py-2 text-sm text-white ring-offset-background placeholder:text-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BF8639] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value=""
                onChange={(e) => {
                  const selectedValue = e.target.value
                  if (selectedValue && !field.value.includes(selectedValue)) {
                    field.onChange([...field.value, selectedValue])
                  }
                  e.target.value = '' // Reset dropdown
                }}
              >
                <option value="">Select cleaning type to add</option>
                {CLEANING_TYPE_OPTIONS.map((option) => (
                  <option 
                    key={option} 
                    value={option}
                    disabled={field.value.includes(option)}
                  >
                    {option}
                  </option>
                ))}
              </select>
              
              {errors.cleaningTypes && (
                <p className="text-xs text-red-300">{errors.cleaningTypes.message}</p>
              )}
            </div>
          )}
        />

        <div className="grid gap-1.5">
          <Label htmlFor="address1">First line of address*</Label>
          <Input
            id="address1"
            placeholder="Address line 1"
            {...register('address1', { required: 'First line of address is required' })}
            aria-required="true"
          />
          {errors.address1 && <p className="text-xs text-red-300">{errors.address1.message}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="city">Town*</Label>
            <Input
              id="city"
              placeholder="Town"
              {...register('city', { required: 'Town is required' })}
              aria-required="true"
            />
            {errors.city && <p className="text-xs text-red-300">{errors.city.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="postcode">Postcode*</Label>
            <Input
              id="postcode"
              placeholder="Postcode"
              {...register('postcode', { required: 'Postcode is required' })}
              aria-required="true"
            />
            {errors.postcode && <p className="text-xs text-red-300">{errors.postcode.message}</p>}
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        <Button type="submit" disabled={isSubmitting}>
          Continue
        </Button>
      </div>
    </StepForm>
  )
}
