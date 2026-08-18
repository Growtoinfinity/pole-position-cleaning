/**
 * Step vocabulary shared by the browser store and the `api/` routes.
 *
 * Deliberately dependency-free (no `@/` alias, no imports at all) so
 * `api/submission.ts` can import it directly under the Vercel Node runtime.
 */

export type Step =
  | 'contact'
  | 'residentialType'
  | 'residentialLargePropertyDetails'
  | 'residentialLargeAddress'
  | 'residentialFlatNotSupported'
  | 'residentialThanks'
  | 'bungalowType'
  | 'bungalowTypeMobile'
  | 'townhouseType'
  | 'townhouseTypeMobile'
  | 'propertyDetails'
  | 'residentialFrequency'
  | 'residentialQuote'
  | 'residentialBook'
  | 'commercialDetails'
  | 'commercialThanks'
  | 'thankYou'

export type FormType = 'standard' | 'commercial' | 'large_unusual'

/**
 * This repo's steps collapsed onto the v3 S1–S5 scale that `submissions.step_reached`
 * records. The exact step is kept separately in `form_data.currentStep`, which is what
 * resume actually navigates to — `step_reached` is for filtering and the abandonment job.
 */
export const STEP_REACHED: Record<Step, number> = {
  contact: 1,

  residentialType: 2,
  residentialFlatNotSupported: 2,
  bungalowType: 2,
  bungalowTypeMobile: 2,
  townhouseType: 2,
  townhouseTypeMobile: 2,
  propertyDetails: 2,
  residentialLargePropertyDetails: 2,
  residentialLargeAddress: 2,
  commercialDetails: 2,

  residentialFrequency: 3,
  residentialQuote: 3,

  residentialBook: 4,

  residentialThanks: 5,
  commercialThanks: 5,
  thankYou: 5,
}

export function isStep(value: unknown): value is Step {
  return typeof value === 'string' && value in STEP_REACHED
}

export function stepReachedFor(step: string, fallback = 1): number {
  return isStep(step) ? STEP_REACHED[step] : fallback
}

/** Coarse fallback used only when `form_data.currentStep` is missing or unrecognised. */
export function stepForReached(reached: number | null | undefined): Step {
  switch (reached) {
    case 5:
      return 'thankYou'
    case 4:
      return 'residentialBook'
    case 3:
      return 'residentialFrequency'
    case 2:
      return 'residentialType'
    default:
      return 'contact'
  }
}

/**
 * Which v3 workflow this submission belongs to, as soon as the branch is known.
 * Returns null when the step carries no branch signal, so an already-set value is left alone.
 */
export function deriveFormType(
  step: string | null | undefined,
  fields: Record<string, unknown> | null | undefined,
): FormType | null {
  const f = fields ?? {}
  const contactType = (f.contactData as { propertyType?: unknown } | null | undefined)
    ?.propertyType

  if (step === 'commercialDetails' || step === 'commercialThanks') return 'commercial'
  if (f.propertyType === 'commercial' || contactType === 'commercial') {
    return 'commercial'
  }

  if (
    step === 'residentialLargePropertyDetails' ||
    step === 'residentialLargeAddress' ||
    step === 'residentialThanks'
  ) {
    return 'large_unusual'
  }
  if (f.residentialType === 'large_unusual' || f.largeUnusualAddress) return 'large_unusual'

  if (f.propertyType === 'residential' || contactType === 'residential') {
    return 'standard'
  }

  return null
}

/**
 * `standard` must never clobber a branch that was already committed to —
 * a later generic step should not drag a commercial lead back to standard.
 */
export function mergeFormType(
  existing: string | null | undefined,
  next: FormType | null,
): FormType | null {
  if (!next) return (existing as FormType) ?? null
  if (next === 'standard' && (existing === 'commercial' || existing === 'large_unusual')) {
    return existing
  }
  return next
}
