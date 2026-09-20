/**
 * The residential type as the price sheet sees it — the one place that mapping lives.
 *
 * It used to live in `StepRenderer`, which is a React component and therefore unreachable
 * from the `api/` routes. `/api/prefill` needs exactly this mapping to turn a posted
 * property into a pricing input, and a second copy is precisely how a flat once came back
 * from a resume with no priced kind at all. So it moved here: no imports beyond a type,
 * usable from the browser and the Node runtime alike.
 *
 * Takes plain strings rather than the step components' union types, because those live in
 * `.tsx` files the API cannot import. The unions still flow through unchanged at the call
 * sites that have them.
 */
import type { HouseKind } from './costing-calc.js'

/**
 * Null for Large/Unusual, which has no priced kind at all.
 *
 * A bungalow AND a townhouse are both priced as their base type, so each reports the
 * sub-type the customer picked rather than its own name.
 *
 * The townhouse half is load-bearing, not symmetry for its own sake. Unlike every sibling
 * contract on this API, this client has no `Town house` row: sending one is not folded to
 * Terraced, it is refused outright with `house_type_not_in_table`, and every row of the
 * quote dies with it. The owner's decision is that a townhouse is asked the same question
 * a bungalow is asked and priced on the answer — which `TownhouseTypeStep` already
 * collects, and which used to be discarded here.
 */
export function houseKindFor(
  type: string | null | undefined,
  bungalowKind: string | null | undefined,
  townhouseKind: string | null | undefined,
): HouseKind | null {
  if (type === 'bungalow') return (bungalowKind as HouseKind | null) ?? null
  if (type === 'townhouse') return (townhouseKind as HouseKind | null) ?? null
  if (type === 'flat') return 'flat'
  if (type === 'semi_detached' || type === 'terraced' || type === 'detached') return type
  return null
}
