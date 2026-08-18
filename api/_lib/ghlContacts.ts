/**
 * GHL (Lead Connector) contact create/update via a Private Integration Token.
 *
 * Runs at S1 only: create the contact, and when the location rejects it as a duplicate,
 * update the existing record instead. Either way we come away with the contact id, which
 * is written to `submissions.contact_id`.
 *
 * Server-side only — the PIT must never reach the browser bundle.
 */
import { GHL_LOCATION_ID } from './supabaseServer'
import { toE164Phone } from '../../src/lib/phone'

const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

/** Custom field key behind `{{contact.webform_token}}`. */
const WEBFORM_TOKEN_FIELD_KEY = 'webform_token'

export type GhlContactInput = {
  fullName?: string | null
  email?: string | null
  phone?: string | null
  /** Written to the `webform_token` custom field so resume links work straight away. */
  webformToken?: string | null
  source?: string
}

export type GhlContactResult = {
  contactId: string | null
  /** 'created' | 'updated' | 'skipped' (no PIT configured) | 'failed' */
  outcome: 'created' | 'updated' | 'skipped' | 'failed'
  error?: string
}

function getPit(): string | null {
  return process.env.GHL_PIT_TOKEN || null
}

export function isGhlContactApiConfigured(): boolean {
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

/** "Jane Alice Smith" → { firstName: 'Jane', lastName: 'Alice Smith' } */
function splitName(fullName: string | null | undefined): { firstName?: string; lastName?: string } {
  const trimmed = (fullName ?? '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return {}
  const parts = trimmed.split(' ')
  if (parts.length === 1) return { firstName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function buildBody(input: GhlContactInput, includeLocation: boolean, includeCustomFields: boolean) {
  const { firstName, lastName } = splitName(input.fullName)
  const phone = toE164Phone(input.phone ?? undefined)

  const body: Record<string, unknown> = {}
  if (includeLocation) body.locationId = GHL_LOCATION_ID
  if (firstName) body.firstName = firstName
  if (lastName) body.lastName = lastName
  if (input.fullName?.trim()) body.name = input.fullName.trim()
  if (input.email) body.email = input.email
  if (phone) body.phone = phone
  body.source = input.source ?? 'kings-window-cleaning-quote-form'

  if (includeCustomFields && input.webformToken) {
    body.customFields = [{ key: WEBFORM_TOKEN_FIELD_KEY, field_value: input.webformToken }]
  }

  return body
}

/** The slice of GHL's contact responses we actually read. */
type GhlContactPayload = {
  id?: string
  contact?: { id?: string; email?: string }
  meta?: { contactId?: string; contact_id?: string }
  contacts?: Array<{ id?: string; email?: string }>
} | null

async function readJson(response: Response): Promise<GhlContactPayload> {
  try {
    return (await response.json()) as GhlContactPayload
  } catch {
    return null
  }
}

/** GHL reports duplicates as a 400 carrying the existing id in `meta.contactId`. */
function extractDuplicateId(payload: GhlContactPayload): string | null {
  return (
    payload?.meta?.contactId ??
    payload?.meta?.contact_id ??
    payload?.contact?.id ??
    null
  )
}

/** Last resort when a duplicate error arrives without `meta.contactId`. */
async function findContactIdByEmail(pit: string, email: string): Promise<string | null> {
  try {
    const url =
      `${GHL_API_BASE}/contacts/?locationId=${encodeURIComponent(GHL_LOCATION_ID)}` +
      `&query=${encodeURIComponent(email)}&limit=20`
    const response = await fetch(url, { method: 'GET', headers: headers(pit) })
    if (!response.ok) return null
    const payload = await readJson(response)
    const contacts = payload?.contacts ?? []
    const target = email.trim().toLowerCase()
    const match =
      contacts.find((c) => typeof c?.email === 'string' && c.email.trim().toLowerCase() === target) ??
      contacts[0]
    return match?.id ?? null
  } catch {
    return null
  }
}

async function updateContact(
  pit: string,
  contactId: string,
  input: GhlContactInput,
): Promise<GhlContactResult> {
  // locationId is rejected on update — only send the mutable fields
  let response = await fetch(`${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}`, {
    method: 'PUT',
    headers: headers(pit),
    body: JSON.stringify(buildBody(input, false, true)),
  })

  // A rejected custom-field key must not cost us the whole update
  if (response.status === 400 && input.webformToken) {
    response = await fetch(`${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}`, {
      method: 'PUT',
      headers: headers(pit),
      body: JSON.stringify(buildBody(input, false, false)),
    })
  }

  if (!response.ok) {
    const payload = await readJson(response)
    return {
      contactId,
      outcome: 'updated',
      error: `update returned ${response.status}: ${JSON.stringify(payload)}`,
    }
  }

  const payload = await readJson(response)
  return { contactId: payload?.contact?.id ?? contactId, outcome: 'updated' }
}

/**
 * Create the contact; if it already exists, update it. Resolves with the contact id
 * either way. Never throws — S1 must not fail because GHL is unhappy.
 */
export async function upsertGhlContact(input: GhlContactInput): Promise<GhlContactResult> {
  const pit = getPit()
  if (!pit) {
    return {
      contactId: null,
      outcome: 'skipped',
      error: 'GHL_PIT_TOKEN is not set — skipping contact create/update',
    }
  }

  try {
    let response = await fetch(`${GHL_API_BASE}/contacts/`, {
      method: 'POST',
      headers: headers(pit),
      body: JSON.stringify(buildBody(input, true, true)),
    })
    let payload = await readJson(response)

    // Retry without custom fields if that is what the 400 was about (a duplicate
    // response carries a contact id, so leave those alone).
    if (response.status === 400 && input.webformToken && !extractDuplicateId(payload)) {
      response = await fetch(`${GHL_API_BASE}/contacts/`, {
        method: 'POST',
        headers: headers(pit),
        body: JSON.stringify(buildBody(input, true, false)),
      })
      payload = await readJson(response)
    }

    if (response.ok) {
      const contactId = payload?.contact?.id ?? payload?.id ?? null
      return { contactId, outcome: 'created' }
    }

    // Already in the location → update it and take the id from the duplicate error
    let existingId = extractDuplicateId(payload)
    if (!existingId && input.email) {
      existingId = await findContactIdByEmail(pit, input.email)
    }

    if (existingId) {
      return await updateContact(pit, existingId, input)
    }

    return {
      contactId: null,
      outcome: 'failed',
      error: `create returned ${response.status}: ${JSON.stringify(payload)}`,
    }
  } catch (error) {
    return {
      contactId: null,
      outcome: 'failed',
      error: error instanceof Error ? error.message : 'Unknown GHL contact error',
    }
  }
}
