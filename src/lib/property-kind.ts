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
import type { HouseKind } from './costing-calc'

/**
 * Null for Large/Unusual, which has no priced kind at all. A bungalow is priced as its
 * base type, so it reports the sub-type the customer picked rather than "bungalow".
 */
export function houseKindFor(
  type: string | null | undefined,
  bungalowKind: string | null | undefined,
): HouseKind | null {
  if (type === 'bungalow') return (bungalowKind as HouseKind | null) ?? null
  if (type === 'townhouse') return 'townhouse'
  if (type === 'flat') return 'flat'
  if (type === 'semi_detached' || type === 'terraced' || type === 'detached') return type
  return null
}
