/**
 * All GHL traffic, via a Private Integration Token. This is the only path to the CRM —
 * the inbound webhook triggers it replaced are gone.
 *
 * Per step we create-or-find the contact and write every known field onto it. Nothing is
 * triggered here — workflows are being rebuilt and will be wired up separately.
 * Server-side only; the PIT must never reach the browser bundle.
 */
import { GHL_LOCATION_ID } from './supabaseServer'
import { buildContactWrite, type GhlContactWrite } from './ghlFieldMap'
import { toE164Phone } from '../../src/lib/phone'
import type { CalcResult } from '../../src/lib/costing-calc'
import type { PriceTable } from '../../src/lib/pricing'

const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

export type GhlSyncResult = {
  contactId: string | null
  /** How the contact record itself was resolved. */
  outcome: 'created' | 'updated' | 'skipped' | 'failed'
  error?: string
}

type GhlPayload = {
  id?: string
  contact?: { id?: string; email?: string }
  meta?: { contactId?: string; contact_id?: string }
  contacts?: Array<{ id?: string; email?: string }>
} | null

function getPit(): string | null {
  return process.env.GHL_PIT_TOKEN || null
}

export function isGhlConfigured(): boolean {
  return Boolean(getPit())
}

function headers(pit: string): Record<string, string> {
  return {
    Authorization: `Bearer ${pit}`,
    Version: GHL_API_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

async function readJson(response: Response): Promise<GhlPayload> {
  try {
    return (await response.json()) as GhlPayload
  } catch {
    return null
  }
}

/** GHL reports duplicates as a 400 carrying the existing id in `meta.contactId`. */
function duplicateId(payload: GhlPayload): string | null {
  return payload?.meta?.contactId ?? payload?.meta?.contact_id ?? payload?.contact?.id ?? null
}

/** Last resort when a duplicate error arrives without `meta.contactId`. */
async function findByEmail(pit: string, email: string): Promise<string | null> {
  try {
    const url =
      `${GHL_API_BASE}/contacts/?locationId=${encodeURIComponent(GHL_LOCATION_ID)}` +
      `&query=${encodeURIComponent(email)}&limit=20`
    const response = await fetch(url, { method: 'GET', headers: headers(pit) })
    if (!response.ok) return null
    const payload = await readJson(response)
    const target = email.trim().toLowerCase()
    const contacts = payload?.contacts ?? []
    const match =
      contacts.find((c) => typeof c?.email === 'string' && c.email.trim().toLowerCase() === target) ??
      contacts[0]
    return match?.id ?? null
  } catch {
    return null
  }
}

/**
 * Create the contact, or return the id of the one that already exists. Deliberately sends
 * only the standard identity fields — custom fields go in a separate write so one rejected
 * field can never cost us the whole contact.
 */
async function createOrFindContact(
  pit: string,
  identity: { fullName?: string; email?: string | null; phone?: string | null },
): Promise<{ contactId: string | null; outcome: 'created' | 'updated' | 'failed'; error?: string }> {
  const body: Record<string, unknown> = { locationId: GHL_LOCATION_ID, source: 'kings-window-cleaning-quote-form' }
  const trimmed = (identity.fullName ?? '').trim().replace(/\s+/g, ' ')
  if (trimmed) {
    const parts = trimmed.split(' ')
    body.firstName = parts[0]
    if (parts.length > 1) body.lastName = parts.slice(1).join(' ')
    body.name = trimmed
  }
  if (identity.email) body.email = identity.email
  const phone = toE164Phone(identity.phone ?? undefined)
  if (phone) body.phone = phone

  const response = await fetch(`${GHL_API_BASE}/contacts/`, {
    method: 'POST',
    headers: headers(pit),
    body: JSON.stringify(body),
  })
  const payload = await readJson(response)

  if (response.ok) {
    return { contactId: payload?.contact?.id ?? payload?.id ?? null, outcome: 'created' }
  }

  let existing = duplicateId(payload)
  if (!existing && identity.email) existing = await findByEmail(pit, identity.email)
  if (existing) return { contactId: existing, outcome: 'updated' }

  return {
    contactId: null,
    outcome: 'failed',
    error: `create returned ${response.status}: ${JSON.stringify(payload)}`,
  }
}

/** Writes standard + custom fields onto an existing contact. `locationId` is rejected here. */
async function writeContactFields(
  pit: string,
  contactId: string,
  write: GhlContactWrite,
): Promise<string | undefined> {
  const body: Record<string, unknown> = { ...write }
  if (!write.customFields.length) delete body.customFields

  const response = await fetch(`${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}`, {
    method: 'PUT',
    headers: headers(pit),
    body: JSON.stringify(body),
  })

  if (response.ok) return undefined

  const payload = await readJson(response)
  return `field write returned ${response.status}: ${JSON.stringify(payload)}`
}

/**
 * One call per form step: resolve the contact and push every field we know onto it.
 * Never throws — a CRM problem must not fail the request.
 *
 * Nothing is triggered in GHL from here. Workflows will be rebuilt from scratch and wired
 * up separately; until then this only keeps the contact record accurate.
 */
export async function syncGhlContact(args: {
  contactId?: string | null
  snapshot: Record<string, any>
  webformToken?: string | null
  quote?: CalcResult | null
  /** ISO timestamp, set only when the submission is being closed out. */
  completedAt?: string | null
  /** Per-row API prices, written verbatim when present. */
  priceTable?: PriceTable | null
}): Promise<GhlSyncResult> {
  const pit = getPit()
  if (!pit) {
    return {
      contactId: args.contactId ?? null,
      outcome: 'skipped',
      error: 'GHL_PIT_TOKEN is not set — skipping CRM sync',
    }
  }

  try {
    const contact = args.snapshot?.contactData ?? {}

    let contactId = args.contactId ?? null
    let outcome: GhlSyncResult['outcome'] = 'updated'
    let error: string | undefined

    if (!contactId) {
      const resolved = await createOrFindContact(pit, {
        fullName: contact.fullName,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
      })
      contactId = resolved.contactId
      outcome = resolved.outcome
      error = resolved.error
    }

    if (!contactId) {
      return { contactId: null, outcome: 'failed', error }
    }

    const write = buildContactWrite(args.snapshot, {
      webformToken: args.webformToken ?? null,
      quote: args.quote ?? null,
      completedAt: args.completedAt ?? null,
      priceTable: args.priceTable ?? null,
    })
    const writeError = await writeContactFields(pit, contactId, write)
    if (writeError) error = error ? `${error}; ${writeError}` : writeError

    return { contactId, outcome, error }
  } catch (error) {
    return {
      contactId: args.contactId ?? null,
      outcome: 'failed',
      error: error instanceof Error ? error.message : 'Unknown GHL error',
    }
  }
}
