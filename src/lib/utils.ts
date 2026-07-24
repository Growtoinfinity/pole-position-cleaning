import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitizes a postcode input by removing spaces, dashes, and underscores,
 * then extracting the first 2 alphabets followed by numbers until another alphabet or end of string
 * @param postcode - The raw postcode input
 * @returns The sanitized postcode
 */
export function sanitizePostcode(postcode: string): string {
  if (!postcode) return ''
  
  // Remove all spaces, dashes, and underscores
  const cleaned = postcode.replace(/[\s\-_]/g, '').toUpperCase()
  
  // Find the first 2 alphabets
  const alphabetMatch = cleaned.match(/^([A-Z]{2})/)
  if (!alphabetMatch) return cleaned
  
  const firstTwoAlphabets = alphabetMatch[1]
  const remaining = cleaned.substring(2)
  
  // Extract numbers from the remaining string until we find another alphabet or reach the end
  const numberMatch = remaining.match(/^(\d+)/)
  if (!numberMatch) return firstTwoAlphabets
  
  const numbers = numberMatch[1]

  return firstTwoAlphabets + numbers
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
