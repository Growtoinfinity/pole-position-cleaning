import type { PriceDisplay } from './usePriceDisplay'

/**
 * The shared truth about what the two quote screens are allowed to say — what the First
 * Clean total reads, and what the screen offers when nothing is picked yet.
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
 *
 * The two conservatory roof cleans are named separately even though they always cost the
 * same as each other (§4). They are two visits to two sides of one roof, and a note that
 * said "conservatory roof clean" while the customer had picked both would leave them
 * counting the total twice.
 */
export const SHORT_NAME = {
  frequency: 'external window cleaning',
  gutter: 'gutter clearance',
  fascia: 'fascia and soffit clean',
  conservatoryExternal: 'external conservatory roof clean',
  conservatoryInternal: 'internal conservatory roof clean',
} as const

/**
 * The one-line description under each add-on row, shared by both screens so a customer
 * who rotates their phone mid-decision reads the same sentence about the same service.
 *
 * The conservatory pair deliberately carries no rate and no panel count. This catalogue
 * prices roof cleaning from a house x bedroom table — there is no per-panel service in it
 * at all (§4) — and the internal clean returns exactly the external one's price, which is
 * the price sheet and not a bug. Naming the side of the roof each row cleans is what makes
 * two identical figures read as two jobs rather than as one row rendered twice.
 */
export const ADDON_DESCRIPTION = {
  gutter: 'Removal of debris and blockages from guttering',
  fascia: 'Cleaning of the external face',
  conservatoryExternal: 'The roof glass, frames and glazing bars, cleaned from outside',
  conservatoryInternal: 'The same roof, cleaned from inside the conservatory',
} as const

/**
 * What the customer is told to pick while nothing is selected.
 *
 * A flat is offered no add-ons at all — every one of the four is `not_applicable` for a
 * flat, permanently (§8), and the conservatory question is never asked — so the whole
 * add-on section is absent. Naming an add-on there sent that customer hunting for a
 * control the page does not render, so the copy has to follow what is actually on screen.
 */
export function nothingSelectedHint(offersAnyAddon: boolean): string {
  return offersAnyAddon
    ? 'Choose a frequency or an add-on to continue'
    : 'Choose a frequency to continue'
}

/** The breakdown panel before anything is picked — same promise, same two cases. */
export function emptyBreakdownText(offersAnyAddon: boolean): string {
  return offersAnyAddon
    ? 'Pick a frequency or an add-on and your price appears here.'
    : 'Pick a frequency and your price appears here.'
}

/**
 * How many add-ons the section is about to render decides whether its heading is plural.
 *
 * Counted, never assumed. A house is normally offered two rows and, with a conservatory,
 * four — every table now carries a `Town house` row too, so a townhouse is no longer the
 * short case it once was (§5) — while a flat is offered none. One row is the residue: any
 * single row the table drops on its own leaves an odd number behind, and a heading that
 * says "Add-ons" over one row is the kind of small wrongness a customer does not report.
 */
export function addonSectionHeading(rowCount: number): string {
  return rowCount === 1 ? 'One Time Add-on' : 'One Time Add-ons'
}

/**
 * A slot that carries no number.
 *
 * Keyed on "carries no number" rather than on a list of states, so it keeps working as
 * states come and go. It lost one when the per-panel roof service did: `on_visit` existed
 * only to let a customer who could not count their roof panels book anyway, and this
 * catalogue prices roof cleaning from a house x bedroom table (§4). Everything that is
 * genuinely unpriceable — not_priceable, oversized, unavailable — lands here as
 * `on_request`, and this guard's whole job is that £0 never reaches the screen.
 */
export function carriesNoPrice(display: PriceDisplay): boolean {
  return display.kind === 'on_request'
}

/** "a", "a and b", "a, b and c" — the note reads as a sentence, not a CSV. */
export function joinNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * The one wording for a row we will not put a number on, in both places it is read.
 *
 * A single pair of strings now that `on_visit` is gone: there is exactly one reason a
 * picked row carries no figure, and it is that we owe the customer a quote rather than
 * that the price is settled at the door. Written here rather than at the two call sites
 * so the sentence fragment and the standalone sentence cannot disagree.
 */
const UNPRICED_PHRASE = 'priced on request'
const UNPRICED_TOTAL_TEXT = 'Price on request'

export type TotalSummary = {
  /** Names of the picked lines the figure leaves out, in breakdown order */
  unpricedNames: string[]
  /** Nothing picked carries a number, so there is no figure to print — least of all £0 */
  everyLineUnpriced: boolean
  /** The figure is true but incomplete, so it has to name what it omits */
  someLinesUnpriced: boolean
  /** Sentence fragment for the note: "priced on request" */
  phrase: string
  /** Sentence for the total slot: "Price on request" */
  totalText: string
}

export function summariseSelection(lines: SelectedLine[]): TotalSummary {
  const unpriced = lines.filter((line) => carriesNoPrice(line.display))
  const everyLineUnpriced = lines.length > 0 && unpriced.length === lines.length

  return {
    unpricedNames: unpriced.map((line) => line.shortName),
    everyLineUnpriced,
    someLinesUnpriced: unpriced.length > 0 && !everyLineUnpriced,
    phrase: UNPRICED_PHRASE,
    totalText: UNPRICED_TOTAL_TEXT,
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

/** e.g. "+ gutter clearance and external conservatory roof clean, priced on request" */
export function unpricedNoteText(summary: TotalSummary): string {
  return `+ ${joinNames(summary.unpricedNames)}, ${summary.phrase}`
}
