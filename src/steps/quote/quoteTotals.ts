import type { PriceDisplay } from './usePriceDisplay'

/**
 * The shared truth about what the First Clean total is allowed to say.
 *
 * Both quote screens render the same quote, and a customer who rotates their phone
 * crosses between them mid-decision — so the predicate, the wording and the service
 * names all live here rather than being written twice and drifting.
 */

export type SelectedLine = {
  display: PriceDisplay
  /** Wording for the note under the total, where a full row label reads as a heading */
  shortName: string
}

/**
 * One name per service, used by both screens. Deliberately comma-free: these get joined
 * into a list, and a name containing its own comma reads as two extra list items.
 */
export const SHORT_NAME = {
  frequency: 'external window cleaning',
  internal: 'internal window clean',
  gutter: 'gutter clearance',
  fascia: 'fascia and soffit clean',
  conservatoryExternal: 'external conservatory roof clean',
  conservatoryInternal: 'internal conservatory roof clean',
} as const

/**
 * A slot that carries no number.
 *
 * Deliberately NOT keyed on `on_visit` alone. That state is declared in the pricing
 * types and mapped by usePriceDisplay, but nothing in the app or the API ever emits it —
 * the real "we can't price this yet" answers come back as not_priceable / unavailable and
 * land here as `on_request`. Keying on "carries no number" keeps the guard working
 * whichever arrives, and the guard's whole job is that £0 never reaches the screen.
 */
export function carriesNoPrice(display: PriceDisplay): boolean {
  return display.kind === 'on_visit' || display.kind === 'on_request'
}

/** "a", "a and b", "a, b and c" — the note reads as a sentence, not a CSV. */
export function joinNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export type TotalSummary = {
  /** Names of the picked lines the figure leaves out, in breakdown order */
  unpricedNames: string[]
  /** Nothing picked carries a number, so there is no figure to print — least of all £0 */
  everyLineUnpriced: boolean
  /** The figure is true but incomplete, so it has to name what it omits */
  someLinesUnpriced: boolean
  /** Sentence fragment for the note: "priced on the visit" / "priced on request" */
  phrase: string
  /** Sentence for the total slot: "Priced on the visit" / "Price on request" */
  totalText: string
}

export function summariseSelection(lines: SelectedLine[]): TotalSummary {
  const unpriced = lines.filter((line) => carriesNoPrice(line.display))
  const everyLineUnpriced = lines.length > 0 && unpriced.length === lines.length
  const allOnVisit =
    unpriced.length > 0 && unpriced.every((line) => line.display.kind === 'on_visit')

  return {
    unpricedNames: unpriced.map((line) => line.shortName),
    everyLineUnpriced,
    someLinesUnpriced: unpriced.length > 0 && !everyLineUnpriced,
    phrase: allOnVisit ? 'priced on the visit' : 'priced on request',
    totalText: allOnVisit ? 'Priced on the visit' : 'Price on request',
  }
}

/**
 * What the First Clean slot reads once the prices have landed.
 *
 * `firstCleanTotal` counts an unpriced row as 0, so a selection made up entirely of those
 * rows sums to nothing and printed as "£0" — the largest, greenest figure on the page,
 * which told the customer the booking was free. Words, never a free-looking number.
 */
export function firstCleanText(summary: TotalSummary, total: number): string {
  return summary.everyLineUnpriced ? summary.totalText : `£${total}`
}

/** e.g. "+ gutter clearance and external conservatory roof clean, priced on the visit" */
export function unpricedNoteText(summary: TotalSummary): string {
  return `+ ${joinNames(summary.unpricedNames)}, ${summary.phrase}`
}
