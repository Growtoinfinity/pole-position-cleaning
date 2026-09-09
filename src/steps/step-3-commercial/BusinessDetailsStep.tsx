import { useForm, Controller } from 'react-hook-form'
import type { FieldErrors } from 'react-hook-form'
import { X } from 'lucide-react'
import Label from '@/components/ui/label'
import Input from '@/components/ui/input'
import Select from '@/components/ui/select'
import Button from '@/components/ui/button'
import FieldError from '@/components/ui/FieldError'
import StepForm from '@/components/form/StepForm'
import { cn } from '@/lib/utils'

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

  /**
   * cleaningTypes is a Controller whose field.ref never reaches a focusable node — the
   * render returns divs and a value="" Select — so react-hook-form's shouldFocusError
   * is a silent no-op for it. Submitting with no cleaning type published an error
   * mid-form while the Submit button sat well below, and the page did not move at all.
   * Take the customer to the field instead, exactly as CommonPropertyDetailsStep does.
   *
   * `behavior` is deliberately not passed: the default inherits the document's
   * scroll-behavior, which index.css already switches to auto under
   * prefers-reduced-motion.
   */
  const revealField = (fieldId: string) => {
    const wrapper = document.getElementById(fieldId)
    if (!wrapper) return
    wrapper.scrollIntoView({ block: 'center' })
    // Land the keyboard on the control itself so its label — and the error rendered
    // beneath it — get announced. preventScroll keeps focus from fighting the
    // centring above.
    wrapper.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')?.focus({ preventScroll: true })
  }

  // Source order, so a customer who missed two fields is taken to the first.
  const errorTargets: Array<[keyof BusinessDetailsValues, string]> = [
    ['businessName', 'businessName-field'],
    ['buildingType', 'buildingType-field'],
    ['cleaningTypes', 'cleaningTypes-field'],
    ['address1', 'address1-field'],
    ['city', 'city-field'],
    ['postcode', 'postcode-field'],
  ]

  const focusFirstError = (formErrors: FieldErrors<BusinessDetailsValues>) => {
    const first = errorTargets.find(([name]) => formErrors[name])
    if (first) revealField(first[1])
  }

  return (
    <StepForm onSubmit={handleSubmit(onSubmit, focusFirstError)} className="wwe-step-column space-y-6">
      <h2 className="text-xl md:text-2xl font-semibold text-ink">Business details</h2>

      <div className="grid gap-5">
        {/* Each wrapper id is `${fieldName}-field` — focusFirstError looks the first
            errored field up by exactly that name, the same convention ContactStep uses. */}
        <div id="businessName-field" className="grid gap-1.5">
          <Label htmlFor="businessName">Business Name*</Label>
          <Input
            id="businessName"
            type="text"
            placeholder="e.g. Oakfield Retail Park Ltd"
            invalid={!!errors.businessName}
            {...register('businessName', { required: 'Business name is required' })}
            aria-required="true"
          />
          <FieldError>{errors.businessName?.message}</FieldError>
        </div>

        <div id="buildingType-field" className="grid gap-1.5">
          <Label htmlFor="buildingType">Building Type*</Label>
          <Select
            id="buildingType"
            invalid={!!errors.buildingType}
            {...register('buildingType', { required: 'Building type is required' })}
            aria-required="true"
          >
            <option value="">Please select</option>
            <option value="Office">Office</option>
            <option value="Retail">Retail</option>
            <option value="Restaurant/Café">Restaurant/Café</option>
            <option value="Industrial/Warehouse">Industrial/Warehouse</option>
            <option value="Healthcare">Healthcare</option>
            <option value="Education">Education</option>
            <option value="Other">Other</option>
          </Select>
          <FieldError>{errors.buildingType?.message}</FieldError>
        </div>

        <Controller
          name="cleaningTypes"
          control={control}
          rules={{
            validate: (value) => value.length > 0 || 'Please select at least one cleaning type'
          }}
          render={({ field }) => (
            <div id="cleaningTypes-field" className="grid gap-1.5">
              <Label htmlFor="cleaningTypes">Type of Cleaning Required*</Label>
              <p className="text-sm text-ink-muted">Add as many as you need.</p>

              {/* The well stays on screen when empty — a captioned box is what tells
                  people this field takes more than one answer. That message is the
                  border's job, so it uses `line-strong` (3.7:1 on the card) rather than
                  the decorative `line` (1.7:1): dashing already erases about half the
                  edge, and at 1.7:1 the empty state was just the words "Nothing added
                  yet" floating between a label and a select. The empty state also drops
                  to the recessed `bg-surface` so the drop area reads as an area, not a
                  gap; once it holds chips it lifts to `bg-card`, a filled container. */}
              <div
                className={cn(
                  'flex min-h-[3rem] flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-card p-3',
                  field.value.length === 0 && 'border-dashed bg-surface',
                )}
              >
                {field.value.length === 0 ? (
                  <span className="text-sm text-ink-muted">Nothing added yet</span>
                ) : (
                  field.value.map((type) => (
                    <span
                      key={type}
                      className="inline-flex items-center gap-1 rounded-full bg-brand-800 px-3 py-1 text-sm font-medium text-ink"
                    >
                      {type}
                      <button
                        type="button"
                        onClick={() => {
                          field.onChange(field.value.filter((t) => t !== type))
                        }}
                        aria-label={`Remove ${type}`}
                        className="ml-0.5 cursor-pointer rounded-full text-brand-300 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-800"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Dropdown Selector */}
              <Select
                id="cleaningTypes"
                invalid={!!errors.cleaningTypes}
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
              </Select>

              <FieldError>{errors.cleaningTypes?.message}</FieldError>
            </div>
          )}
        />

        <div id="address1-field" className="grid gap-1.5">
          <Label htmlFor="address1">First line of address*</Label>
          <Input
            id="address1"
            placeholder="Address line 1"
            invalid={!!errors.address1}
            {...register('address1', { required: 'First line of address is required' })}
            aria-required="true"
          />
          <FieldError>{errors.address1?.message}</FieldError>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div id="city-field" className="grid gap-1.5">
            <Label htmlFor="city">Town*</Label>
            <Input
              id="city"
              placeholder="Town"
              invalid={!!errors.city}
              {...register('city', { required: 'Town is required' })}
              aria-required="true"
            />
            <FieldError>{errors.city?.message}</FieldError>
          </div>

          <div id="postcode-field" className="grid gap-1.5">
            <Label htmlFor="postcode">Postcode*</Label>
            <Input
              id="postcode"
              placeholder="Postcode"
              invalid={!!errors.postcode}
              {...register('postcode', { required: 'Postcode is required' })}
              aria-required="true"
            />
            <FieldError>{errors.postcode?.message}</FieldError>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
      </div>
    </StepForm>
  )
}
