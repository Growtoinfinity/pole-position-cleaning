/**
 * Where Pole Position Cleaning works.
 *
 * This file used to do two jobs: decide whether a postcode is covered, and generate the
 * dates the booking step offered. The second job is gone with the date picker — the round
 * decides which day a property is cleaned, so the form has no business proposing one.
 *
 * That also closes an open question rather than leaving it open: the round days were never
 * supplied for this business, and the old code papered over it by offering Monday to Friday
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
/**
 * The 25 outward codes Pole Position covers. Bournemouth and the surrounding
 * Dorset/Hampshire border.
 *
 * Confirmed twice, from two independent sources that agree exactly: `coverage.covered` in
 * their pricing config (`docs/pricing_api_poleposition.md` §1), and the list given
 * directly by the business on 2026-09-19. That matters more than usual here — see the
 * drift warning below — because a copied list with one source is a guess about the round,
 * and this one is not.
 *
 * `COVERED_AREAS` is EMPTY on purpose. The obvious shortcut is a single `'BH'` area rule,
 * and it would be wrong: BH19 (Swanage) and BH20 (Wareham) are absent from BOTH lists, so
 * an area rule would promise two districts the business has not said it travels to. Every
 * district is therefore named individually, including SP6, which is outside BH altogether.
 *
 * ⚠ There is still no drift guard. Coverage is not part of the pricing API — there is no
 * coverage endpoint to read — so this list is a COPY, and it goes stale silently the day
 * the business changes its round. Re-check it when the price book is next updated.
 */
export const COVERED_AREAS: readonly string[] = []

export const COVERED_DISTRICTS: readonly string[] = [
  'BH1',
  'BH2',
  'BH3',
  'BH4',
  'BH5',
  'BH6',
  'BH7',
  'BH8',
  'BH9',
  'BH10',
  'BH11',
  'BH12',
  'BH13',
  'BH14',
  'BH15',
  'BH16',
  'BH17',
  'BH18',
  'BH21',
  'BH22',
  'BH23',
  'BH24',
  'BH25',
  'BH31',
  'SP6',
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
