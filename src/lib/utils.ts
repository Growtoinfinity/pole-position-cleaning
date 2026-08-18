import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Lives in its own dependency-free module so the server-side api/ routes can reuse it
export { toE164Phone } from "./phone"

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

