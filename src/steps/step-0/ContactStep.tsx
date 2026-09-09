import { useEffect, useRef, useState } from 'react'
import { useForm, type FieldErrors } from 'react-hook-form'
import { CircleAlert } from 'lucide-react'
import Input from '@/components/ui/input'
import Label from '@/components/ui/label'
import Button from '@/components/ui/button'
import Select from '@/components/ui/select'
import FieldError from '@/components/ui/FieldError'
import StepForm from '@/components/form/StepForm'
import SelectableCard from '@/components/SelectableCard'
import { ResidentialIcon, CommercialIcon } from '@/components/icons/PropertyIcons'
import { type PropertyType } from '@/types'
import { ensureSubmissionStarted } from '@/lib/submission'
import { BRAND } from '@/lib/brand'
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

  /*
   * react-hook-form's shouldFocusError cannot rescue this screen: propertyType is
   * registered on an <input type="hidden">, and ref.focus() on a hidden element is a
   * silent no-op. On a phone the Continue button sits well below the question, so a
   * customer who submitted without picking a property type saw the page do nothing
   * at all while the red message sat off-screen above. Scroll the group ourselves.
   *
   * Keys on the errors object follow registration order, so the first one is the
   * highest failing field on the page.
   */
  const scrollToFirstError = (formErrors: FieldErrors<ContactFormValues>) => {
    const firstErrored = Object.keys(formErrors)[0]
    if (!firstErrored) return

    // index.css disables smooth scrolling under prefers-reduced-motion, but an
    // explicit `behavior` here would override that CSS, so ask the query directly.
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    document.getElementById(`${firstErrored}-field`)?.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion ? 'auto' : 'smooth'
    })
  }

  const handleFormSubmit = async (values: ContactFormValues) => {
    setIsApiLoading(true)
    setApiError(null)

    try {
      // S1 — create the submission row and the GHL contact behind it, so the token
      // exists before any later step tries to sync against it.
      const token = await ensureSubmissionStarted(values)
      if (!token) setApiError('We could not save your details just now')
    } catch (error) {
      console.error('Failed to start submission:', error)
      setApiError('Network error occurred')
    } finally {
      setIsApiLoading(false)
    }

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

    // Never block the customer on a backend problem
    onSubmit(values)
  }

  // The className below replaces StepForm's default outright, so it has to carry
  // wwe-step-column itself — without it the form runs the full 1140px page column
  // and the property cards render at twice the width of the identical cards on the
  // very next screen. space-y-6 is the only deliberate difference.
  return (
    <StepForm
      className="wwe-step-column space-y-6"
      onSubmit={handleSubmit(handleFormSubmit, scrollToFirstError)}
    >
      {/* Two cards, because these are two separate questions and running them
          together as one wall of fields is what made the old step hard to scan. */}
      <section className="wwe-card p-5 md:p-6">
        <h2 className="text-xl md:text-2xl font-semibold text-ink">
          Personal Details
        </h2>

        {/* Each wrapper id is `${fieldName}-field` — scrollToFirstError looks the
            first errored field up by exactly that name. */}
        <div className="mt-5 space-y-4">
          <div id="fullName-field" className="grid gap-1.5">
            <Label htmlFor="fullName">Full Name*</Label>
            <Input
              id="fullName"
              type="text"
              autoComplete="name"
              invalid={!!errors.fullName}
              {...register('fullName', { required: 'Full name is required' })}
            />
            <FieldError>{errors.fullName?.message}</FieldError>
          </div>

          <div id="phone-field" className="grid gap-1.5">
            <Label htmlFor="phone">Phone*</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              invalid={!!errors.phone}
              {...register('phone', {
                required: 'Phone is required',
                minLength: { value: 7, message: 'Phone looks too short' },
              })}
            />
            <FieldError>{errors.phone?.message}</FieldError>
          </div>

          <div id="email-field" className="grid gap-1.5">
            <Label htmlFor="email">Email*</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              invalid={!!errors.email}
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /[^\s@]+@[^\s@]+\.[^\s@]+/,
                  message: 'Please enter a valid email address',
                },
              })}
            />
            <FieldError>{errors.email?.message}</FieldError>
          </div>

          <div id="hearAboutUs-field" className="grid gap-1.5">
            <Label htmlFor="hearAboutUs">How did you hear about us?</Label>
            <Select id="hearAboutUs" {...register('hearAboutUs')}>
              <option value="">Please select</option>
              <option value="Google">Google</option>
              <option value="Facebook">Facebook</option>
              <option value="Checkatrade">Checkatrade</option>
              <option value="Leaflet">Leaflet</option>
              <option value="Van">Van</option>
              <option value="Referral">Referral</option>
            </Select>
          </div>

          {watch('hearAboutUs') === 'Referral' && (
            <div id="referralName-field" className="grid gap-1.5">
              <Label htmlFor="referralName">Who referred you?</Label>
              <Input
                id="referralName"
                type="text"
                placeholder="Referral name"
                {...register('referralName')}
              />
            </div>
          )}
        </div>
      </section>

      {/* The id sits on the whole section so a failed submit centres the question
          and its cards, not just the cards on their own. */}
      <section id="propertyType-field" className="wwe-card p-5 md:p-6">
        <h2 id="property-type-label" className="text-xl md:text-2xl font-semibold text-ink">
          What type of property would you like a quote for?*
        </h2>

        <div className="mt-5 space-y-4">
          {/* One affordance at every width. The next screen (ResidentialTypeStep)
              asks the same kind of question with tick-badge cards two-up, so a
              phone user is not taught one pattern here and shown another there. */}
          <div
            role="radiogroup"
            aria-labelledby="property-type-label"
            aria-describedby={errors.propertyType ? 'property-type-error' : undefined}
            aria-invalid={errors.propertyType ? true : undefined}
            className="grid grid-cols-2 gap-4 md:gap-6"
          >
            {/* shouldValidate re-runs the rule on click. Without it the red "Please
                select a property type" stayed pinned under a card the customer could
                plainly see was now chosen. */}
            <SelectableCard
              label="Residential"
              icon={<ResidentialIcon />}
              selected={propertyType === 'residential'}
              onClick={() => setValue('propertyType', 'residential', { shouldValidate: true })}
            />
            <SelectableCard
              label="Commercial"
              icon={<CommercialIcon />}
              selected={propertyType === 'commercial'}
              onClick={() => setValue('propertyType', 'commercial', { shouldValidate: true })}
            />
          </div>

          {/* The id lives on a wrapper because FieldError takes children only —
              aria-describedby resolves the text inside it just the same. */}
          {errors.propertyType && (
            <div id="property-type-error">
              <FieldError>Please select a property type</FieldError>
            </div>
          )}
          <input type="hidden" {...register('propertyType', { required: true })} />
        </div>
      </section>

      <div id="consent-field" className="space-y-2">
        {/* The whole line is the label, so the tap target is the sentence and not
            just the 20px box. */}
        <label
          htmlFor="consent"
          className="-m-2 flex cursor-pointer items-start gap-3 rounded-lg p-2 text-sm transition-colors hover:bg-surface"
        >
          <input
            id="consent"
            type="checkbox"
            aria-required="true"
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
            {...register('consent', { required: true })}
          />
          {/* This was the only required control on the step with no "*", so the one
              consent a customer can't proceed without read as an optional opt-in and
              was discovered by failing a submit. The sentence carries body ink now
              rather than ink-muted — it is copy that has to be read — which also lets
              the muted line under it read as the aside it is. */}
          <span className="grid gap-1">
            <span className="text-ink">
              I'm happy to receive my quote and information from {BRAND.name} by phone, WhatsApp, SMS or email.*
            </span>
            <span className="text-ink-muted">Required — this is how we send you your quote.</span>
          </span>
        </label>
        {errors.consent && <FieldError>Consent is required to proceed</FieldError>}
      </div>

      {/* API Error Display */}
      {apiError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger-border bg-danger-soft p-3.5">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
          <p className="text-sm text-danger">
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
