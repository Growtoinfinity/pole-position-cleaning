const GOOGLE_ADS_ID = 'AW-652184762'

export function trackGenerateLeadConversion() {
  window.gtag?.('event', 'conversion', {
    send_to: `${GOOGLE_ADS_ID}/0FBqCP7C7Z8cELqZ_rYC`,
    value: 1.0,
    currency: 'GBP',
  })
}

let hasFiredSubmitLeadFormConversion = false

export function trackSubmitLeadFormConversion() {
  if (hasFiredSubmitLeadFormConversion) return
  hasFiredSubmitLeadFormConversion = true
  window.gtag?.('event', 'conversion', {
    send_to: `${GOOGLE_ADS_ID}/-YCxCO-DxtoBELqZ_rYC`,
  })
}
