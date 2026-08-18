/**
 * Phone normalisation, kept dependency-free so `api/` routes can import it
 * (the `@/` alias and `utils.ts`'s clsx/tailwind-merge imports do not belong server-side).
 */

/**
 * Best-effort conversion of a UK phone number to E.164 format (e.g. +447123456789).
 * Returns the input unchanged (digits/plus only) if it doesn't look like a UK number.
 */
export function toE164Phone(phone: string | undefined): string | undefined {
  if (!phone) return undefined

  const cleaned = phone.trim().replace(/[^\d+]/g, '')
  if (!cleaned) return undefined

  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('0')) return `+44${cleaned.slice(1)}`
  if (cleaned.startsWith('44')) return `+${cleaned}`
  // UK national number typed without its leading 0, e.g. "7809103225"
  if (/^[1-9]\d{9}$/.test(cleaned)) return `+44${cleaned}`

  return cleaned
}
