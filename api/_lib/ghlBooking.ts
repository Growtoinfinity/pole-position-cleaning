/**
 * What happens in GHL when a regular residential booking is confirmed.
 *
 * Only for the standard residential flow — large/unusual and commercial are enquiries
 * that the team quotes by hand, and a flat is declined outright. None of those are a
 * won opportunity, so none of them come through here.
 *
 * Every step is best effort and independent: a failed tag must not cost us the
 * opportunity, and a failed opportunity must not cost us the workflow.
 */
import { GHL_LOCATION_ID } from './supabaseServer'

const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

/** Applied to every confirmed booking. Matches the tag already in the location, casing included. */
const BOOKED_TAG = 'appt booked'

/** Acquisition Pipeline → Booked. Ids read from the location, not guessed. */
const ACQUISITION_PIPELINE_ID = 'Ncu0CUWN5lRA59XfpQnE'
const ACQUISITION_BOOKED_STAGE_ID = 'bd73cc87-8122-4d50-b5ba-e0defa1cc49d'

/** Fired once the booking is confirmed and the contact is fully populated. */
const BOOKING_CONFIRMED_WORKFLOW_ID = '2ae73bb7-9ee4-41c5-9f21-829dd3792da8'

export type BookingConfirmation = {
  tagged: boolean
  opportunity: 'created' | 'updated' | 'failed'
  workflowTriggered: boolean
  errors: string[]
}

function getPit(): string | null {
  return process.env.GHL_PIT_TOKEN || null
}

function headers(pit: string): Record<string, string> {
  return {
    Authorization: `Bearer ${pit}`,
    Version: GHL_API_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

/** The slice of GHL's opportunity responses we actually read. */
type GhlBookingPayload = {
  id?: string
  opportunities?: Array<{ id?: string; pipelineId?: string; pipeline?: { id?: string } }>
} | null

async function readJson(response: Response): Promise<GhlBookingPayload> {
  try {
    return (await response.json()) as GhlBookingPayload
  } catch {
    return null
  }
}

/** Adds the tag without disturbing any the contact already carries. */
async function addTag(pit: string, contactId: string, tag: string): Promise<string | null> {
  const response = await fetch(`${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/tags`, {
    method: 'POST',
    headers: headers(pit),
    body: JSON.stringify({ tags: [tag] }),
  })
  if (response.ok) return null
  return `tag "${tag}" returned ${response.status}: ${JSON.stringify(await readJson(response))}`
}

/** The contact's existing opportunity in the acquisition pipeline, if it has one. */
async function findOpportunity(pit: string, contactId: string): Promise<string | null> {
  try {
    const url =
      `${GHL_API_BASE}/opportunities/search?location_id=${encodeURIComponent(GHL_LOCATION_ID)}` +
      `&contact_id=${encodeURIComponent(contactId)}`
    const response = await fetch(url, { method: 'GET', headers: headers(pit) })
    if (!response.ok) return null

    const payload = await readJson(response)
    const match = (payload?.opportunities ?? []).find(
      (o) => o?.pipelineId === ACQUISITION_PIPELINE_ID || o?.pipeline?.id === ACQUISITION_PIPELINE_ID,
    )
    return match?.id ?? null
  } catch {
    return null
  }
}

/**
 * Moves the acquisition opportunity to Booked/won, carrying the first clean price as its
 * value. Updates the existing one when there is one — a second opportunity for the same
 * contact would double-count the pipeline.
 */
async function upsertOpportunity(
  pit: string,
  args: { contactId: string; name: string; value: number | null },
): Promise<{ outcome: 'created' | 'updated' | 'failed'; error?: string }> {
  const existing = await findOpportunity(pit, args.contactId)

  const body: Record<string, unknown> = {
    pipelineId: ACQUISITION_PIPELINE_ID,
    pipelineStageId: ACQUISITION_BOOKED_STAGE_ID,
    status: 'won',
    name: args.name,
    ...(args.value !== null ? { monetaryValue: args.value } : {}),
  }

  if (existing) {
    const response = await fetch(`${GHL_API_BASE}/opportunities/${encodeURIComponent(existing)}`, {
      method: 'PUT',
      headers: headers(pit),
      body: JSON.stringify(body),
    })
    if (response.ok) return { outcome: 'updated' }
    return {
      outcome: 'failed',
      error: `opportunity update returned ${response.status}: ${JSON.stringify(await readJson(response))}`,
    }
  }

  const response = await fetch(`${GHL_API_BASE}/opportunities/`, {
    method: 'POST',
    headers: headers(pit),
    body: JSON.stringify({ ...body, locationId: GHL_LOCATION_ID, contactId: args.contactId }),
  })
  if (response.ok) return { outcome: 'created' }
  return {
    outcome: 'failed',
    error: `opportunity create returned ${response.status}: ${JSON.stringify(await readJson(response))}`,
  }
}

/** Drops the contact into a workflow — this is how automations are started now. */
async function triggerWorkflow(pit: string, contactId: string, workflowId: string): Promise<string | null> {
  const response = await fetch(
    `${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/workflow/${encodeURIComponent(workflowId)}`,
    { method: 'POST', headers: headers(pit), body: JSON.stringify({}) },
  )
  if (response.ok) return null
  return `workflow ${workflowId} returned ${response.status}: ${JSON.stringify(await readJson(response))}`
}

/**
 * Runs after the contact's fields have been written, never before — the workflow reads
 * those fields, so triggering it first would hand it a half-populated record.
 *
 * Never throws: the customer has already seen their confirmation by this point, and no
 * CRM failure should turn a completed booking into an error.
 */
export async function confirmResidentialBooking(args: {
  contactId: string
  contactName?: string | null
  firstCleanPrice: number | null
}): Promise<BookingConfirmation> {
  const result: BookingConfirmation = {
    tagged: false,
    opportunity: 'failed',
    workflowTriggered: false,
    errors: [],
  }

  const pit = getPit()
  if (!pit) {
    result.errors.push('GHL_PIT_TOKEN is not set — skipping booking confirmation')
    return result
  }

  const name = args.contactName?.trim()
    ? `${args.contactName.trim()} - window cleaning`
    : 'Website booking - window cleaning'

  // Independent on purpose: one failing must not stop the others
  const [tagError, opportunity, workflowError] = await Promise.all([
    addTag(pit, args.contactId, BOOKED_TAG).catch((e) => `tag failed: ${e}`),
    upsertOpportunity(pit, {
      contactId: args.contactId,
      name,
      value: args.firstCleanPrice,
    }).catch((e) => ({ outcome: 'failed' as const, error: `opportunity failed: ${e}` })),
    triggerWorkflow(pit, args.contactId, BOOKING_CONFIRMED_WORKFLOW_ID).catch(
      (e) => `workflow failed: ${e}`,
    ),
  ])

  result.tagged = !tagError
  if (tagError) result.errors.push(tagError)

  result.opportunity = opportunity.outcome
  if (opportunity.error) result.errors.push(opportunity.error)

  result.workflowTriggered = !workflowError
  if (workflowError) result.errors.push(workflowError)

  return result
}
