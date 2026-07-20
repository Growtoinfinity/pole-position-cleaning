const GOOGLE_ADS_ID = 'AW-652184762'

export function trackGenerateLeadConversion() {
  window.gtag?.('event', 'conversion', {
    send_to: `${GOOGLE_ADS_ID}/0FBqCP7C7Z8cELqZ_rYC`,
    value: 0,
    currency: 'GBP',
  })
}

let hasFiredSubmitLeadFormConversion = false

/** value: price of the customer's first clean, or 0 when no price was quoted (e.g. manual-quote flows) */
export function trackSubmitLeadFormConversion(value: number) {
  if (hasFiredSubmitLeadFormConversion) return
  hasFiredSubmitLeadFormConversion = true
  window.gtag?.('event', 'conversion', {
    send_to: `${GOOGLE_ADS_ID}/-YCxCO-DxtoBELqZ_rYC`,
    value,
    currency: 'GBP',
  })
}
