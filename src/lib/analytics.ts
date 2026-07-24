let hasFiredLeadFormCompleteEvent = false

/** value: price of the customer's first clean, or 0 when no price was quoted (e.g. manual-quote flows) */
export function pushLeadFormCompleteEvent(value: number) {
  if (hasFiredLeadFormCompleteEvent) return
  hasFiredLeadFormCompleteEvent = true
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ event: 'lead_form_complete', value, currency: 'GBP' })
}
