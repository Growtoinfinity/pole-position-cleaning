import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Check } from 'lucide-react'
import Button from '@/components/ui/button'
import Label from '@/components/ui/label'
import Input from '@/components/ui/input'
import Select from '@/components/ui/select'
import FieldError from '@/components/ui/FieldError'
import StepForm from '@/components/form/StepForm'
import {
  getAvailableDatesForPostcode,
  calculateAppointmentDates,
  formatDate,
  formatAppointmentTime,
  getDayName,
  isPostcodeCovered,
  getServiceDaysForPostcode
} from '@/lib/scheduling'
import { cn, sanitizePostcode } from '@/lib/utils'
import type { Frequency } from '@/lib/costing-calc'
import NoCoverageStep from '@/steps/no-coverage/NoCoverageStep'

export type BookStepAddressValues = {
  address1: string
  city: string
  postcode: string
}

export type BookStepDateValues = {
  selectedDate: string
  timePreference: 'morning' | 'afternoon'
  additionalNotes?: string
}

export type BookStepValues = BookStepAddressValues & {
  selectedDate: string
  timePreference: 'morning' | 'afternoon'
  appointmentTime: string
  additionalNotes?: string
  allAppointmentDates: string[]
}

type Props = {
  initialValues?: Partial<BookStepValues>
  onSubmit: (values: BookStepValues) => void
  /**
   * The cleaning frequency the customer picked, which decides how many visits get
   * booked. Null is the add-ons-only quote: there is no recurring clean to schedule,
   * so a single visit is booked.
   */
  frequency?: Frequency | null
}


// Helper function to get service day names for a postcode
const getServiceDayNames = (postcode: string): string => {
  const serviceDays = getServiceDaysForPostcode(postcode);

  if (serviceDays.length === 0) {
    return 'selected days';
  }

  const dayNames = serviceDays.map(day => {
    const days = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
    return days[day];
  });

  if (dayNames.length === 1) {
    return dayNames[0];
  } else if (dayNames.length === 2) {
    return `${dayNames[0]} and ${dayNames[1]}`;
  } else {
    const lastDay = dayNames.pop();
    return `${dayNames.join(', ')}, and ${lastDay}`;
  }
};

// Both time buttons share one look, so the pair reads as a single choice.
// gm-selectable owns the border, radius, hover, focus and selected states — the
// local classes used to re-declare all of that at `border` / `rounded-lg`, which
// quietly overrode the shared border-2 / rounded-xl and left this pair looking
// lighter-weight than every other option surface in the form. Only layout and
// the text treatment belong here now.
//
// No font-weight here: the period name is always bold and the time range always
// text-xs, so weight can't be the selected/unselected signal any more. Border,
// fill and the tick carry that, and the label keeps one shape in both states.
const timeOptionClasses = (selected: boolean) =>
  cn(
    'gm-selectable flex min-h-14 w-full items-center justify-center gap-2 px-4 py-3 text-center text-sm',
    selected ? 'text-brand-900' : 'text-ink',
  )

export default function BookStep({
  initialValues,
  onSubmit,
  frequency = 8
}: Props) {
  const [step, setStep] = useState<'address' | 'date' | 'no-coverage'>('address')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasSubmittedRef = useRef(false)
  const [addressValues, setAddressValues] = useState<BookStepAddressValues | null>(null)
  const [availableDates, setAvailableDates] = useState<Date[]>([])
  const [serviceDayNames, setServiceDayNames] = useState<string>('selected days')

  const { register, handleSubmit, formState: { errors } } = useForm<BookStepAddressValues>({
    defaultValues: {
      address1: initialValues?.address1 || '',
      city: initialValues?.city || '',
      postcode: initialValues?.postcode || '',
    },
    mode: 'onTouched',
  })

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  // The date is the only thing gating "Confirm Booking", so it needs the same
  // touched-then-complain behaviour the address fields get from RHF's
  // mode: 'onTouched'. Without it the button just sits dead with no message.
  const [dateTouched, setDateTouched] = useState(false)
  const [timePreference, setTimePreference] = useState<'morning' | 'afternoon'>('morning')
  const [additionalNotes, setAdditionalNotes] = useState<string>(initialValues?.additionalNotes || '')
  const [appointmentDates, setAppointmentDates] = useState<string[]>([])

  const dateMissing = dateTouched && !selectedDate

  const handleAddressSubmit = (data: BookStepAddressValues) => {
    // Sanitize the postcode before processing
    const sanitizedData = {
      ...data,
      postcode: sanitizePostcode(data.postcode)
    }

    // Check if postcode is covered
    if (!isPostcodeCovered(sanitizedData.postcode)) {
      setAddressValues(sanitizedData)
      setStep('no-coverage')
      return
    }

    setAddressValues(sanitizedData)

    // Get available dates for this postcode using our utility function
    const nextDates = getAvailableDatesForPostcode(sanitizedData.postcode, 8) // Always show 8 dates
    setAvailableDates(nextDates)

    // Get service day names for this postcode
    const dayNames = getServiceDayNames(sanitizedData.postcode)
    setServiceDayNames(dayNames)

    setStep('date')
  }

  const handleDateSelection = (date: Date) => {
    // Store both the formatted date string and the Date object
    const formattedDate = formatDate(date)
    setSelectedDate(formattedDate)

    // A recurring clean books a run of visits; an add-ons-only quote (no frequency)
    // books the one.
    const allDates = frequency ? calculateAppointmentDates(date, frequency) : [date]
    const formattedDates = allDates.map(d => formatDate(d))
    setAppointmentDates(formattedDates)
  }

  const handleFinalSubmit = () => {
    // Terminal step: this is what fires the GHL workflow that messages the customer.
    // The latch closes the same-tick gap that `disabled` cannot, since React needs a
    // render to apply the attribute and a fast double-click lands before it.
    if (hasSubmittedRef.current) return
    hasSubmittedRef.current = true
    setIsSubmitting(true)

    console.log('handleFinalSubmit called');
    console.log('addressValues:', addressValues);
    console.log('selectedDate:', selectedDate);

    if (addressValues && selectedDate) {
      console.log('Submitting booking data');
      const submitData = {
        ...addressValues,
        selectedDate,
        timePreference,
        appointmentTime: formatAppointmentTime(selectedDate, timePreference),
        additionalNotes,
        allAppointmentDates: appointmentDates
      };
      console.log('Submit data:', submitData);

      onSubmit(submitData);
    } else {
      hasSubmittedRef.current = false
      setIsSubmitting(false)
      console.error('Cannot submit: missing addressValues or selectedDate');
      console.log('addressValues:', addressValues);
      console.log('selectedDate:', selectedDate);
    }
  }

  return (
    <div className="w-full">
      {step === 'no-coverage' ? (
        <NoCoverageStep
          onTryDifferentPostcode={() => setStep('address')}
          onStartNewQuote={() => {
            // Reset form and go back to address step
            setStep('address')
            setAddressValues(null)
            setAvailableDates([])
            setSelectedDate(null)
            setDateTouched(false)
            setAppointmentDates([])
            setAdditionalNotes('')
          }}
        />
      ) : step === 'address' ? (
        <StepForm onSubmit={handleSubmit(handleAddressSubmit)}>
          <div className="grid gap-6">
            <h2 className="text-xl md:text-2xl font-semibold text-brand-800">
              Property Address
            </h2>

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
            </div>
          </div>

          <div className="mt-6 flex justify-center">
            <Button type="submit" className="w-full">Pick Starting Date</Button>
          </div>
        </StepForm>
      ) : (
        // Not a StepForm (there is no form submit here — Confirm Booking is a button
        // handler), so it applies the shared column class itself. Without it the column
        // would change width halfway through the booking step.
        <div className="gm-step-column grid gap-6">
          <h2 className="text-xl md:text-2xl font-semibold text-brand-800">
            Select Your First Cleaning Date
          </h2>

          <p className="text-sm text-ink-muted">
            We work in your area on {serviceDayNames}. Please choose any of the following dates as your first cleaning date.
          </p>

          <div className="grid gap-6">
            <div>
              <h3 className="mb-3 text-base font-semibold text-ink">Available Dates</h3>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="date-select">Select a date*</Label>
                  <Select
                    id="date-select"
                    invalid={dateMissing}
                    value={selectedDate ? availableDates.findIndex(date => formatDate(date) === selectedDate) : ''}
                    // The confirm button is disabled until a date is picked, so it can
                    // never fire a submit to validate against. Leaving the field is the
                    // moment we know the customer has been past it.
                    onBlur={() => setDateTouched(true)}
                    onChange={(e) => {
                      const index = parseInt(e.target.value);
                      if (!isNaN(index) && index >= 0 && index < availableDates.length) {
                        handleDateSelection(availableDates[index]);
                      }
                    }}
                  >
                    <option value="" disabled>Select a date</option>
                    {availableDates.map((date, index) => (
                      <option key={index} value={index}>
                        {getDayName(date)} - {formatDate(date)}
                      </option>
                    ))}
                  </Select>
                  <FieldError>{dateMissing ? 'Please select a date' : undefined}</FieldError>
                </div>
              </div>
            </div>

            <div>
              <h3 id="time-preference-heading" className="mb-3 text-base font-semibold text-ink">Preferred Time</h3>
              {/* Morning and afternoon are one choice, not two independent toggles, so
                  they announce as a radio group rather than a pair of press buttons */}
              {/* One column until sm: side by side at 360px leaves ~116px of text width
                  once px-4, the border-2 and the tick are paid for, and "Morning" plus
                  its range needs more than that — it used to wrap mid-range. */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" role="radiogroup" aria-labelledby="time-preference-heading">
                <button
                  type="button"
                  onClick={() => setTimePreference('morning')}
                  role="radio"
                  aria-checked={timePreference === 'morning'}
                  className={timeOptionClasses(timePreference === 'morning')}
                >
                  {/* Kept in the flow even when hidden so picking an option doesn't shift the label */}
                  <Check
                    className={cn(
                      'h-4 w-4 shrink-0 text-brand-600 transition-opacity duration-150',
                      timePreference === 'morning' ? 'opacity-100' : 'opacity-0',
                    )}
                    strokeWidth={3}
                    aria-hidden
                  />
                  {/* Two lines, so the range never has to fit beside the period name */}
                  <span className="flex flex-col leading-tight">
                    <span className="font-semibold">Morning</span>
                    <span className="text-xs text-ink-muted">8am – 12pm</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTimePreference('afternoon')}
                  role="radio"
                  aria-checked={timePreference === 'afternoon'}
                  className={timeOptionClasses(timePreference === 'afternoon')}
                >
                  <Check
                    className={cn(
                      'h-4 w-4 shrink-0 text-brand-600 transition-opacity duration-150',
                      timePreference === 'afternoon' ? 'opacity-100' : 'opacity-0',
                    )}
                    strokeWidth={3}
                    aria-hidden
                  />
                  <span className="flex flex-col leading-tight">
                    <span className="font-semibold">Afternoon</span>
                    <span className="text-xs text-ink-muted">12pm – 4pm</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="additionalNotes">Additional Notes</Label>
              {/* This was the placeholder, which meant the only explanation of what
                  belongs here vanished the moment the customer started typing */}
              <p className="text-sm text-ink-muted">Gate code, how to find the property, anything else we should know.</p>
              <Input
                id="additionalNotes"
                placeholder="Optional"
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-2">
            <Button
              type="button"
              className="w-full"
              disabled={!selectedDate || isSubmitting}
              onClick={handleFinalSubmit}
            >
              {isSubmitting ? 'Confirming...' : 'Confirm Booking'}
            </Button>
            {/* Says why the button is dead. Only the missing date can disable it before
                a submit is underway, so this never contradicts the "Confirming..." state. */}
            {!selectedDate && (
              <p className="text-sm text-ink-muted text-center">Select a date to continue</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
