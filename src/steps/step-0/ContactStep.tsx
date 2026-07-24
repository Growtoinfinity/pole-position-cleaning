import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import Input from '@/components/ui/input'
import Label from '@/components/ui/label'
import Button from '@/components/ui/button'
import StepForm from '@/components/form/StepForm'
import SelectableCard from '@/components/SelectableCard'
import residentialPng from '@/assets/residential.png'
import commercialPng from '@/assets/commercial.png'
import { type PropertyType } from '@/types'
import { sendContactData } from '@/lib/api'
import { toE164Phone } from '@/lib/utils'

export type ContactFormValues = {
  fullName: string
  phone: string
  email: string
  hearAboutUs?: string
  referralName?: string
  consent: boolean
  propertyType: PropertyType
}

export default function ContactStep({
  onSubmit,
  initialValues
}: {
  onSubmit: (values: ContactFormValues) => void
  initialValues?: ContactFormValues
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue, watch } = useForm<ContactFormValues>({
    defaultValues: initialValues ?? {
      fullName: '',
      phone: '',
      email: '',
      hearAboutUs: '',
      referralName: '',
      consent: false,
      propertyType: undefined
    },
    mode: 'onTouched',
  })

  const [isApiLoading, setIsApiLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const propertyType = watch('propertyType')
  const hasFiredStep1CompleteRef = useRef(false)

  useEffect(() => {
    if (initialValues) {
      reset(initialValues)
    }
  }, [initialValues, reset])

  const handleFormSubmit = async (values: ContactFormValues) => {
    setIsApiLoading(true)
    setApiError(null)

    try {
      // Send data to the webhook
      const apiResponse = await sendContactData(values)

      if (apiResponse.success) {
        // API call successful, proceed with form submission
        if (!hasFiredStep1CompleteRef.current) {
          hasFiredStep1CompleteRef.current = true
          window.dataLayer = window.dataLayer || []
          window.dataLayer.push({
            event: 'generate_lead_step1',
            user_data: {
              email: values.email,
              phone_number: toE164Phone(values.phone)
            }
          })
        }
        onSubmit(values)
      } else {
        // API call failed, show error but still allow form to proceed
        console.error('API Error:', apiResponse.error)
        setApiError(apiResponse.error || 'Failed to send data')
        // Still proceed with form submission to not block user
        onSubmit(values)
      }
    } catch (error) {
      console.error('API Error:', error)
      setApiError('Network error occurred')
      // Still proceed with form submission to not block user
      onSubmit(values)
    } finally {
      setIsApiLoading(false)
    }
  }

  return (
    <StepForm className="w-full space-y-8 px-0" onSubmit={handleSubmit(handleFormSubmit)}>
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-[#BF8639] mb-2 md:mb-4">
          Personal Details
        </h2>
        <div className="grid gap-1.5">
          <Label htmlFor="fullName">Full Name*</Label>
          <Input
            id="fullName"
            type="text"
            autoComplete="name"
            placeholder="Full Name*"
            {...register('fullName', { required: 'Full name is required' })}
          />
          {errors.fullName && <p className="text-xs text-red-300">{errors.fullName.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="phone">Phone*</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="Phone*"
            {...register('phone', {
              required: 'Phone is required',
              minLength: { value: 7, message: 'Phone looks too short' },
            })}
          />
          {errors.phone && <p className="text-xs text-red-300">{errors.phone.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="email">Email*</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="Email*"
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: /[^\s@]+@[^\s@]+\.[^\s@]+/,
                message: 'Please enter a valid email address',
              },
            })}
          />
          {errors.email && <p className="text-xs text-red-300">{errors.email.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="hearAboutUs">How did you hear about us?</Label>
          <select
            id="hearAboutUs"
            className="h-10 md:h-11 w-full rounded-md border border-white/20 bg-[#013252] px-3 py-2 text-sm text-white ring-offset-background placeholder:text-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BF8639] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            {...register('hearAboutUs')}
          >
            <option value="">Please select</option>
            <option value="Google">Google</option>
            <option value="Facebook">Facebook</option>
            <option value="Checkatrade">Checkatrade</option>
            <option value="Leaflet">Leaflet</option>
            <option value="Van">Van</option>
            <option value="Referral">Referral</option>
          </select>
        </div>

        {watch('hearAboutUs') === 'Referral' && (
          <div className="grid gap-1.5">
            <Label htmlFor="referralName">Who referred you?</Label>
            <Input
              id="referralName"
              type="text"
              placeholder="Referral name"
              {...register('referralName')}
            />
          </div>
        )}

        <div className="pt-4">
          <h2 className="text-xl font-semibold text-[#BF8639] mb-2 md:mb-4">
            What type of property would you like a quote for?*
          </h2>

          {/* Mobile view - Radio buttons */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            <button
              type="button"
              onClick={() => setValue('propertyType', 'residential')}
              className={`w-full flex items-center gap-3 rounded-lg border px-4 py-2 text-left transition-all ${propertyType === 'residential'
                ? 'border-[#BF8639] bg-[#BF8639]/10 ring-2 ring-[#BF8639]'
                : 'border-white/20 bg-[#013252] hover:border-white/50'
                }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${propertyType === 'residential'
                ? 'border-[#BF8639] bg-[#BF8639]'
                : 'border-white/40'
                }`}>
                {propertyType === 'residential' && (
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                )}
              </div>
              <span className="text-white font-medium">Residential</span>
            </button>

            <button
              type="button"
              onClick={() => setValue('propertyType', 'commercial')}
              className={`w-full flex items-center gap-3 rounded-lg border px-4 py-2 text-left transition-all ${propertyType === 'commercial'
                ? 'border-[#BF8639] bg-[#BF8639]/10 ring-2 ring-[#BF8639]'
                : 'border-white/20 bg-[#013252] hover:border-white/50'
                }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${propertyType === 'commercial'
                ? 'border-[#BF8639] bg-[#BF8639]'
                : 'border-white/40'
                }`}>
                {propertyType === 'commercial' && (
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                )}
              </div>
              <span className="text-white font-medium">Commercial</span>
            </button>
          </div>

          {/* Desktop view - Images */}
          <div className="hidden md:grid grid-cols-1 gap-6 md:grid-cols-2">
            <SelectableCard
              label="Residential"
              imageSrc={residentialPng}
              selected={propertyType === 'residential'}
              onClick={() => setValue('propertyType', 'residential')}
            />
            <SelectableCard
              label="Commercial"
              imageSrc={commercialPng}
              selected={propertyType === 'commercial'}
              onClick={() => setValue('propertyType', 'commercial')}
            />
          </div>
          {errors.propertyType && <p className="text-xs text-red-300">Please select a property type</p>}
          <input type="hidden" {...register('propertyType', { required: true })} />
        </div>

        <div className="flex items-start gap-3 pt-4">
          <input
            id="consent"
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            {...register('consent', { required: true })}
          />
          <label htmlFor="consent" className="text-sm text-white/90">
            I'm happy to receive my quote and information from Kings Window Cleaning by phone, WhatsApp, SMS or email.
          </label>
        </div>
        {errors.consent && (
          <p className="-mt-3 text-xs text-red-300">Consent is required to proceed</p>
        )}
      </div>

      {/* API Error Display */}
      {apiError && (
        <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-sm text-red-300">
            Warning: {apiError}. Your form will still be processed.
          </p>
        </div>
      )}

      <div className="pt-2">
        <Button type="submit" disabled={isSubmitting || isApiLoading} className="w-full">
          {isApiLoading ? 'Sending...' : isSubmitting ? 'Processing...' : 'Continue'}
        </Button>
      </div>
    </StepForm>
  )
}