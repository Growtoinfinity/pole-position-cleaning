import { toE164Phone } from '@/lib/utils'

let hasFiredLeadFormCompleteEvent = false

/** value: price of the customer's first clean, or 0 when no price was quoted (e.g. manual-quote flows) */
export function pushLeadFormCompleteEvent(value: number, email?: string, phone?: string) {
  if (hasFiredLeadFormCompleteEvent) return
  hasFiredLeadFormCompleteEvent = true
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({
    event: 'lead_form_complete',
    value,
    currency: 'GBP',
    user_data: {
      email,
      phone_number: toE164Phone(phone)
    }
  })
}
