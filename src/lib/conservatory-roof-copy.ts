/**
 * Display copy for the conservatory roof add-ons.
 *
 * Deliberately carries no rate and no panel count. Both roof cleans are priced from a
 * house x bedroom table in the pricing API's own book — there is no per-panel service
 * anywhere in this catalogue and `conservatory_roof_panels` is not even in this client's
 * `field_mapping` (§4, §5) — so the form no longer asks how many panels a roof has, and
 * the "to be confirmed on visit" label that answer used to produce is gone with it.
 *
 * A number repeated here would go stale the moment the source changed, which is the other
 * half of why this line says what is included rather than what it costs.
 *
 * NOTE: both quote screens now take their add-on descriptions from
 * `src/steps/quote/quoteTotals.ts` (`ADDON_DESCRIPTION`), which names the side of the roof
 * each of the two rows cleans. This constant has no importer left in the tree; keep the
 * two in agreement, or retire this one.
 */
export const CONSERVATORY_ROOF_PRICE_SUBTEXT =
  'Frames, sills and glazing are fully included.'
