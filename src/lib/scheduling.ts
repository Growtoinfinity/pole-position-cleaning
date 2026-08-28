/**
 * Where Greenmaster works.
 *
 * This file used to do two jobs: decide whether a postcode is covered, and generate the
 * dates the booking step offered. The second job is gone with the date picker — the round
 * decides which day a property is cleaned, so the form has no business proposing one.
 *
 * That also closes an open question rather than leaving it open: the round days were never
 * supplied for Greenmaster, and the old code papered over it by offering Monday to Friday
 * everywhere. Nothing needs them now.
 */

/**
 * Coverage, as two separate ideas.
 *
 * `COVERED_AREAS` are whole postcode AREAS — every district inside them is covered, so DH
 * covers DH1 through DH9 without listing them. The old matcher could not express this: it
 * only ever compared full outward codes, and a bare "DH" entry failed to match "DH1"
 * because the character after the prefix was a digit.
 *
 * `COVERED_DISTRICTS` are individual outward codes covered outside those areas.
 */
export const COVERED_AREAS: readonly string[] = ['DH', 'SR']

export const COVERED_DISTRICTS: readonly string[] = [
  'NE8',
  'NE9',
  'NE10',
  'NE31',
  'NE35',
  'NE36',
  'NE37',
  'NE38',
]

/** The outward code — "DH1 4AB" and "dh14ab" both give "DH1". */
export function outwardCodeOf(postcode: string): string {
  const normalised = (postcode ?? '').toUpperCase().replace(/[\s\-_]+/g, ' ').trim()
  if (!normalised) return ''
  // A typed space always separates outward from inward
  if (normalised.includes(' ')) return normalised.split(' ')[0].replace(/[^A-Z0-9]/g, '')
  // No space: strip the inward code (digit + two letters) off the end
  const cleaned = normalised.replace(/[^A-Z0-9]/g, '')
  return cleaned.replace(/\d[A-Z]{2}$/, '') || cleaned
}

/** The letters at the front of an outward code: "DH1" -> "DH", "NE31" -> "NE". */
function areaOf(outwardCode: string): string {
  return (outwardCode.match(/^[A-Z]{1,2}/) || [''])[0]
}

/** Is this postcode inside the service area? */
export function isPostcodeCovered(postcode: string): boolean {
  const outwardCode = outwardCodeOf(postcode)
  if (!outwardCode) return false

  if (COVERED_AREAS.includes(areaOf(outwardCode))) return true
  return COVERED_DISTRICTS.includes(outwardCode)
}
