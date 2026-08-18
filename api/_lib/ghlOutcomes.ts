/**
 * What happens in GHL when a form reaches an outcome worth acting on.
 *
 * Two of them so far, and they differ in kind rather than degree:
 *   - a confirmed residential booking is a WON opportunity carrying a real price
 *   - a commercial quote request is an OPEN one the team still has to price by hand
 *
 * Large/unusual enquiries and declined flats reach neither — nothing to tag, nothing to
 * move, nothing to trigger.
 *
 * Every step is best effort and independent: a failed tag must not cost us the
 * opportunity, and a failed opportunity must not cost us the workflow.
 */
import { GHL_LOCATION_ID } from './supabaseServer'

const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

/** Matches the tag already in the location, casing included. */
const BOOKED_TAG = 'appt booked'

/** Not yet present in the location — GHL creates it on first use. */
const QUOTE_REQUESTED_TAG = 'quote requested'

/** Acquisition Pipeline and its stages. Ids read from the location, not guessed. */
const ACQUISITION_PIPELINE_ID = 'Ncu0CUWN5lRA59XfpQnE'
const ACQUISITION_BOOKED_STAGE_ID = 'bd73cc87-8122-4d50-b5ba-e0defa1cc49d'
const ACQUISITION_QUOTE_REQUESTED_STAGE_ID = '8dda8a12-7673-4ccc-9b85-2e2576a1b379'

/** Fired once the outcome is reached and the contact is fully populated. */
const BOOKING_CONFIRMED_WORKFLOW_ID = '2ae73bb7-9ee4-41c5-9f21-829dd3792da8'
const COMMERCIAL_QUOTE_WORKFLOW_ID = 'c0bbdd42-5353-4999-abe8-ccd005c1b73e'

export type OutcomeResult = {
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
 * Moves the acquisition opportunity to the given stage. Updates the existing one when
 * there is one — a second opportunity for the same contact would double-count the
 * pipeline.
 */
async function upsertOpportunity(
  pit: string,
  args: {
    contactId: string
    name: string
    stageId: string
    status: 'open' | 'won'
    value?: number | null
  },
): Promise<{ outcome: 'created' | 'updated' | 'failed'; error?: string }> {
  const existing = await findOpportunity(pit, args.contactId)

  const body: Record<string, unknown> = {
    pipelineId: ACQUISITION_PIPELINE_ID,
    pipelineStageId: args.stageId,
    status: args.status,
    name: args.name,
    ...(args.value !== null && args.value !== undefined ? { monetaryValue: args.value } : {}),
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
 * Runs after the contact's fields have been written, never before — the workflows read
 * those fields, so triggering one first would hand it a half-populated record.
 *
 * Never throws: the customer has already seen their confirmation by this point, and no
 * CRM failure should turn a completed form into an error for them.
 */
async function applyOutcome(args: {
  contactId: string
  tag: string
  opportunityName: string
  stageId: string
  status: 'open' | 'won'
  value?: number | null
  workflowId: string
}): Promise<OutcomeResult> {
  const result: OutcomeResult = {
    tagged: false,
    opportunity: 'failed',
    workflowTriggered: false,
    errors: [],
  }

  const pit = getPit()
  if (!pit) {
    result.errors.push('GHL_PIT_TOKEN is not set — skipping CRM outcome')
    return result
  }

  // Independent on purpose: one failing must not stop the others
  const [tagError, opportunity, workflowError] = await Promise.all([
    addTag(pit, args.contactId, args.tag).catch((e) => `tag failed: ${e}`),
    upsertOpportunity(pit, {
      contactId: args.contactId,
      name: args.opportunityName,
      stageId: args.stageId,
      status: args.status,
      value: args.value ?? null,
    }).catch((e) => ({ outcome: 'failed' as const, error: `opportunity failed: ${e}` })),
    triggerWorkflow(pit, args.contactId, args.workflowId).catch((e) => `workflow failed: ${e}`),
  ])

  result.tagged = !tagError
  if (tagError) result.errors.push(tagError)

  result.opportunity = opportunity.outcome
  if (opportunity.error) result.errors.push(opportunity.error)

  result.workflowTriggered = !workflowError
  if (workflowError) result.errors.push(workflowError)

  return result
}

function opportunityName(contactName: string | null | undefined, suffix: string): string {
  const trimmed = contactName?.trim()
  return trimmed ? `${trimmed} - ${suffix}` : `Website enquiry - ${suffix}`
}

/** A regular residential booking: won, with the first clean price as its value. */
export async function confirmResidentialBooking(args: {
  contactId: string
  contactName?: string | null
  firstCleanPrice: number | null
}): Promise<OutcomeResult> {
  return applyOutcome({
    contactId: args.contactId,
    tag: BOOKED_TAG,
    opportunityName: opportunityName(args.contactName, 'window cleaning'),
    stageId: ACQUISITION_BOOKED_STAGE_ID,
    status: 'won',
    value: args.firstCleanPrice,
    workflowId: BOOKING_CONFIRMED_WORKFLOW_ID,
  })
}

/**
 * A commercial quote request: open, and deliberately carrying no monetary value —
 * commercial work is priced by hand, and a fabricated figure would skew the pipeline.
 */
export async function confirmCommercialQuoteRequest(args: {
  contactId: string
  contactName?: string | null
  businessName?: string | null
}): Promise<OutcomeResult> {
  const label = args.businessName?.trim() || args.contactName?.trim() || null
  return applyOutcome({
    contactId: args.contactId,
    tag: QUOTE_REQUESTED_TAG,
    opportunityName: opportunityName(label, 'commercial quote'),
    stageId: ACQUISITION_QUOTE_REQUESTED_STAGE_ID,
    status: 'open',
    workflowId: COMMERCIAL_QUOTE_WORKFLOW_ID,
  })
}
