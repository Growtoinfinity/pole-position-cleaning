import { useState } from 'react'
import { useForm } from 'react-hook-form'
import Button from '@/components/ui/button'
import Label from '@/components/ui/label'
import Input from '@/components/ui/input'
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
import { sanitizePostcode } from '@/lib/utils'
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
  frequency?: 6 | 8 | 12 | 'one-off' | null
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

export default function BookStep({
  initialValues,
  onSubmit,
  frequency = 8
}: Props) {
  const [step, setStep] = useState<'address' | 'date' | 'no-coverage'>('address')
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
  const [timePreference, setTimePreference] = useState<'morning' | 'afternoon'>('morning')
  const [additionalNotes, setAdditionalNotes] = useState<string>(initialValues?.additionalNotes || '')
  const [appointmentDates, setAppointmentDates] = useState<string[]>([])

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

    // Calculate all appointment dates based on frequency
    // For addon-only scenarios (frequency is null), treat as one-off
    const frequencyForCalculation = frequency || 'one-off'
    const allDates = calculateAppointmentDates(date, frequencyForCalculation)
    const formattedDates = allDates.map(d => formatDate(d))
    setAppointmentDates(formattedDates)
  }

  const handleFinalSubmit = () => {
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
            setAppointmentDates([])
            setAdditionalNotes('')
          }}
        />
      ) : step === 'address' ? (
        <StepForm onSubmit={handleSubmit(handleAddressSubmit)}>
          <div className="grid gap-6">
            <h2 className="text-left text-2xl font-semibold text-[#BF8639]">
              Property Address
            </h2>

            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="address1">First line of address*</Label>
                <Input
                  id="address1"
                  placeholder="Address line 1"
                  {...register('address1', { required: 'First line of address is required' })}
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
          </div>

          <div className="mt-6 flex justify-center">
            <Button type="submit" className="w-full">Pick Starting Date</Button>
          </div>
        </StepForm>
      ) : (
        <div className="grid gap-6">
          <h2 className="text-left text-2xl font-semibold text-[#BF8639]">
            Select Your First Cleaning Date
          </h2>

          <p className="text-white/90 text-sm">
            We work in your area on {serviceDayNames}. Please choose any of the following dates as your first cleaning date.
          </p>

          <div className="grid gap-6">
            <div>
              <h3 className="text-lg font-medium text-[#BF8639] mb-3">Available Dates</h3>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="date-select">Select a date*</Label>
                  <div className="relative">
                    <select
                      id="date-select"
                      value={selectedDate ? availableDates.findIndex(date => formatDate(date) === selectedDate) : ''}
                      onChange={(e) => {
                        const index = parseInt(e.target.value);
                        if (!isNaN(index) && index >= 0 && index < availableDates.length) {
                          handleDateSelection(availableDates[index]);
                        }
                      }}
                      className="appearance-none w-full rounded-md border border-[#BF8639]/40 bg-white/5 px-4 py-3 text-sm text-white cursor-pointer focus:border-[#BF8639] focus:outline-none focus:ring-2 focus:ring-[#BF8639]/20"
                    >
                      <option value="" disabled className="bg-[#013252] text-white">Select a date</option>
                      {availableDates.map((date, index) => (
                        <option key={index} value={index} className="bg-[#013252] text-white">
                          {getDayName(date)} - {formatDate(date)}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#BF8639]">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-[#BF8639] mb-3">Preferred Time</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setTimePreference('morning')}
                  className={`flex items-center justify-center rounded-md border px-4 py-3 text-center transition-all ${timePreference === 'morning'
                    ? 'border-[#BF8639] bg-[#BF8639]/10 ring-1 ring-[#BF8639]'
                    : 'border-white/20 bg-white/5 hover:border-white/50'
                    }`}
                >
                  <span>Morning (8am - 12pm)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTimePreference('afternoon')}
                  className={`flex items-center justify-center rounded-md border px-4 py-3 text-center transition-all ${timePreference === 'afternoon'
                    ? 'border-[#BF8639] bg-[#BF8639]/10 ring-1 ring-[#BF8639]'
                    : 'border-white/20 bg-white/5 hover:border-white/50'
                    }`}
                >
                  <span>Afternoon (12pm - 4pm)</span>
                </button>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="additionalNotes">Additional Notes</Label>
              <Input
                id="additionalNotes"
                placeholder="Gate Code/ How to find your property etc. OPTIONAL"
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              className="w-full"
              disabled={!selectedDate}
              onClick={handleFinalSubmit}
            >
              Confirm Booking
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
