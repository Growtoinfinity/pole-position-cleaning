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
