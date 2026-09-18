/**
 * Everything customer-facing that names the business. Kept in one place so a
 * rebrand is a single edit rather than a hunt through every step.
 *
 * Name, legal suffix and homepage are taken from the business's own GHL
 * location record (gTgq0KNEOclOtud3I65l), not from a guess. The legal suffix
 * is the one printed on the logo artwork.
 *
 * The GHL record's `website` field is blank, so the homepage is derived from
 * the account's own email domain (info@polepositioncleaning.co.uk) — correct
 * it here if the business uses a different address.
 */
export const BRAND = {
  name: 'Pole Position Cleaning',
  /** Short form for running copy where the full name reads clumsily */
  shortName: 'Pole Position',
  /** As registered — for the footer and anywhere the legal entity is named */
  legalName: 'Pole Position Cleaning Ltd',
  homepageUrl: 'https://www.polepositioncleaning.co.uk/',
} as const
