/**
 * Browser side of the pricing API.
 *
 * The browser never talks to the v3 bot directly — it sends no CORS headers, and its
 * credential can write to customer records. Everything here goes through `/api/pricing`,
 * which holds the key.
 *
 * One fetch covers a whole property. Clicking a frequency or ticking an add-on costs
 * nothing: neither moves a price, they only select rows out of a table that has already
 * been fetched. That is what keeps a nine-row table at one round trip instead of nine
 * per interaction, against a 60-calls-per-minute budget shared by the whole site.
 */
import type { CalcInput } from '@/lib/costing-calc'
import type { PriceTable } from '@/lib/pricing'
import { useFormStore } from '@/stores/formStore'

const PRICING_URL = '/api/pricing'

export type PriceTableResult = {
  table: PriceTable | null
  /** Why there is no table, when there isn't one. */
  reason: string | null
}

/**
 * Fetches every price this property needs.
 *
 * Never throws and never rejects: a pricing outage must not be able to take the lead
 * form down with it. A null table means "fall back to the local book", which the caller
 * does silently.
 */
export async function fetchPriceTable(
  calcInput: CalcInput,
  action: 'table' | 'commit' = 'table',
): Promise<PriceTableResult> {
  const token = useFormStore.getState().token

  try {
    const response = await fetch(`${PRICING_URL}?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, calcInput }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.warn(`[pricing] HTTP ${response.status}`, text)
      return { table: null, reason: `http_${response.status}` }
    }

    const data = (await response.json().catch(() => null)) as {
      ok?: boolean
      reason?: string
      table?: PriceTable | null
    } | null

    if (!data?.ok || !data.table) {
      return { table: null, reason: data?.reason ?? 'no_table' }
    }

    return { table: data.table, reason: null }
  } catch (error) {
    console.warn('[pricing] request failed', error)
    return { table: null, reason: 'network' }
  }
}
