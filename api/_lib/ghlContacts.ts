/**
 * All GHL traffic, via a Private Integration Token. This is the only path to the CRM —
 * the inbound webhook triggers it replaced are gone.
 *
 * Per step we create-or-find the contact and write every known field onto it. Nothing is
 * triggered here — workflows are being rebuilt and will be wired up separately.
 * Server-side only; the PIT must never reach the browser bundle.
 */
import { ghlLocationId } from './supabaseServer.js'
import { buildContactWrite, type GhlContactWrite } from './ghlFieldMap.js'
import { toE164Phone } from '../../src/lib/phone.js'
import type { CalcResult } from '../../src/lib/costing-calc.js'
import type { PriceTable } from '../../src/lib/pricing.js'

const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

/**
 * GHL answers in well under a second in normal operation. Without a bound, a hung
 * connection here holds the whole invocation open until the platform kills it — and the
 * price push runs on the same request the customer is waiting on for their quote.
 */
const GHL_TIMEOUT_MS = 8000

/** Distinguishes "GHL took too long" from "the call failed", which read very differently in logs. */
function fetchFailureReason(error: unknown): string {
  return error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'failed'
}

export type GhlSyncResult = {
  contactId: string | null
  /** How the contact record itself was resolved. */
  outcome: 'created' | 'updated' | 'skipped' | 'failed'
  /** Frequency + selected add-ons, once a quote exists — the won opportunity's value. */
  firstCleanPrice?: number | null
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
      `${GHL_API_BASE}/contacts/?locationId=${encodeURIComponent(ghlLocationId())}` +
      `&query=${encodeURIComponent(email)}&limit=20`
    const response = await fetch(url, {
      method: 'GET',
      headers: headers(pit),
      signal: AbortSignal.timeout(GHL_TIMEOUT_MS),
    })
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
  const body: Record<string, unknown> = { locationId: ghlLocationId(), source: 'we-wash-everything-quote-form' }
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

  let response: Response
  try {
    response = await fetch(`${GHL_API_BASE}/contacts/`, {
      method: 'POST',
      headers: headers(pit),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GHL_TIMEOUT_MS),
    })
  } catch (error) {
    return { contactId: null, outcome: 'failed', error: `create ${fetchFailureReason(error)}` }
  }
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

  // Caught here rather than left to `syncGhlContact`: a throw out of this function loses
  // the contact id resolved above, and that id is what `rememberContactId` stores.
  let response: Response
  try {
    response = await fetch(`${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}`, {
      method: 'PUT',
      headers: headers(pit),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GHL_TIMEOUT_MS),
    })
  } catch (error) {
    return `field write ${fetchFailureReason(error)}`
  }

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

    const { write, firstCleanPrice } = buildContactWrite(args.snapshot, {
      webformToken: args.webformToken ?? null,
      quote: args.quote ?? null,
      completedAt: args.completedAt ?? null,
      priceTable: args.priceTable ?? null,
    })
    const writeError = await writeContactFields(pit, contactId, write)
    if (writeError) error = error ? `${error}; ${writeError}` : writeError

    return { contactId, outcome, firstCleanPrice, error }
  } catch (error) {
    return {
      contactId: args.contactId ?? null,
      outcome: 'failed',
      error: error instanceof Error ? error.message : 'Unknown GHL error',
    }
  }
}
