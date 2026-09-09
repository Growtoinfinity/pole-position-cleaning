import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import Button from '@/components/ui/button'
import Label from '@/components/ui/label'
import Input from '@/components/ui/input'
import FieldError from '@/components/ui/FieldError'
import StepForm from '@/components/form/StepForm'
import { isPostcodeCovered } from '@/lib/scheduling'
import { sanitizePostcode } from '@/lib/utils'
import NoCoverageStep from '@/steps/no-coverage/NoCoverageStep'

export type BookStepAddressValues = {
  address1: string
  city: string
  postcode: string
}

/**
 * The booking asks for the address and nothing else it does not need.
 *
 * There used to be a second screen here that made the customer pick a first cleaning date
 * and a morning/afternoon slot. It is gone: the round decides which day a property is
 * cleaned, so a date chosen in the form was a promise the schedule had not agreed to, and
 * it was the only thing standing between a ready customer and a confirmed booking. The
 * team schedules the first visit and tells them when.
 *
 * `additionalNotes` stays and now lives on this screen — it is the gate code and the
 * "round the back, past the bins" that the cleaner actually needs, and it is written to
 * the contact's Customer Issue field.
 */
export type BookStepValues = BookStepAddressValues & {
  additionalNotes?: string
}

type Props = {
  initialValues?: Partial<BookStepValues>
  onSubmit: (values: BookStepValues) => void
}

export default function BookStep({ initialValues, onSubmit }: Props) {
  const [step, setStep] = useState<'address' | 'no-coverage'>('address')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasSubmittedRef = useRef(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BookStepValues>({
    defaultValues: {
      address1: initialValues?.address1 || '',
      city: initialValues?.city || '',
      postcode: initialValues?.postcode || '',
      additionalNotes: initialValues?.additionalNotes || '',
    },
    mode: 'onTouched',
  })

  const handleBookingSubmit = (data: BookStepValues) => {
    const values = { ...data, postcode: sanitizePostcode(data.postcode) }

    // Checked before the booking is confirmed, not after: telling someone we cannot reach
    // them is a far better outcome than confirming a clean that will never happen.
    if (!isPostcodeCovered(values.postcode)) {
      setStep('no-coverage')
      return
    }

    // Terminal step: this is what fires the GHL workflow that messages the customer. The
    // latch closes the same-tick gap `disabled` cannot, since React needs a render to
    // apply the attribute and a fast double-click lands before it.
    if (hasSubmittedRef.current) return
    hasSubmittedRef.current = true
    setIsSubmitting(true)

    onSubmit(values)
  }

  if (step === 'no-coverage') {
    return (
      <NoCoverageStep
        onTryDifferentPostcode={() => setStep('address')}
        onStartNewQuote={() => setStep('address')}
      />
    )
  }

  return (
    <div className="w-full">
      <StepForm onSubmit={handleSubmit(handleBookingSubmit)}>
        <div className="grid gap-6">
          <h2 className="text-xl font-semibold text-ink md:text-2xl">Property Address</h2>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="address1">First line of address*</Label>
              <Input
                id="address1"
                placeholder="Address line 1"
                invalid={!!errors.address1}
                {...register('address1', { required: 'First line of address is required' })}
              />
              <FieldError>{errors.address1?.message}</FieldError>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="city">Town*</Label>
                <Input
                  id="city"
                  placeholder="Town"
                  invalid={!!errors.city}
                  {...register('city', { required: 'Town is required' })}
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

            <div className="grid gap-1.5">
              <Label htmlFor="additionalNotes">Additional Notes</Label>
              {/* This was the placeholder, which meant the only explanation of what
                  belongs here vanished the moment the customer started typing */}
              <p className="text-sm text-ink-muted">
                Gate code, how to find the property, anything else we should know.
              </p>
              <Input id="additionalNotes" placeholder="Optional" {...register('additionalNotes')} />
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-2">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Confirming...' : 'Confirm Booking'}
          </Button>
          <p className="text-center text-sm text-ink-muted">
            We'll be in touch to arrange your first clean.
          </p>
        </div>
      </StepForm>
    </div>
  )
}
