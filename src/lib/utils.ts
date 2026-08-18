import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sanitizePostcode(postcode: string): string {
  if (!postcode) return ''

  // Uppercase, and collapse spaces/dashes/underscores into a single space
  const normalised = postcode.toUpperCase().replace(/[\s\-_]+/g, ' ').trim()

  // If a space was typed, everything before it is the outward code.
  // This handles malformed inward codes like "GU8 89R" → "GU8"
  if (normalised.includes(' ')) {
    return normalised.split(' ')[0].replace(/[^A-Z0-9]/g, '')
  }

  // No space: strip the inward code (digit + two letters) from the end
  // e.g. "GU111ER" → "GU11", "GU1 1AA" without space → "GU1"
  const cleaned = normalised.replace(/[^A-Z0-9]/g, '')
  const outward = cleaned.replace(/\d[A-Z]{2}$/, '')

  return outward.length >= 2 ? outward : cleaned
}

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
