/**
 * Everything customer-facing that names the business. Kept in one place so a
 * rebrand is a single edit rather than a hunt through every step.
 *
 * Name, legal suffix and homepage are taken from the business's own GHL
 * location record (A9cGvKBunXk003dXUmSV), not from a guess.
 */
export const BRAND = {
  name: 'We Wash Everything',
  /** Short form for running copy where the full name reads clumsily */
  shortName: 'We Wash Everything',
  /** As registered — for the footer and anywhere the legal entity is named */
  legalName: 'We Wash Everything Ltd',
  homepageUrl: 'https://wewasheverything.com/',
} as const
