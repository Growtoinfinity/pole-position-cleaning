/**
 * What happens in GHL when a form reaches an outcome worth acting on.
 *
 * Three of them, and they differ in kind rather than degree:
 *   - a confirmed residential booking is a WON opportunity carrying a real price
 *   - a commercial quote request is an OPEN one the team still has to price by hand
 *   - a large/unusual quote request is the same, down a different workflow
 *
 * A declined flat reaches none of them — nothing to tag, nothing to move, nothing to
 * trigger for a job Kings will not do.
 *
 * Every step is best effort and independent: a failed tag must not cost us the
 * opportunity, and a failed opportunity must not cost us the workflow.
 */
import { ghlLocationId } from './supabaseServer.js'

const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

/** Matches the tag already in the location, casing included. */
const BOOKED_TAG = 'appt booked'

/** Not yet present in the location — GHL creates it on first use. */
const QUOTE_REQUESTED_TAG = 'quote requested'

/**
 * Acquisition Pipeline and its stages, in the GREENMASTER location.
 *
 * Not the Kings ids. Greenmaster is a snapshot clone, and a clone re-mints every id while
 * keeping the source one as `originId` — so the Kings values matched nothing and every
 * opportunity write failed quietly. Verify with `scripts/ghl-config-check.ts`.
 */
const ACQUISITION_PIPELINE_ID = 'QmQu4KbbylgPGwIbekcd'
const ACQUISITION_BOOKED_STAGE_ID = '86d782e1-460b-43c7-a4b3-e5e8e69d9191'
const ACQUISITION_QUOTE_REQUESTED_STAGE_ID = '2b557b54-f060-4f6a-aa06-c9c75ac57d52'

/** Fired once the outcome is reached and the contact is fully populated. */
const BOOKING_CONFIRMED_WORKFLOW_ID = 'cf54fd01-c126-44ae-becd-cd968b821bb8' // Regular Residential Booking Completed
const COMMERCIAL_QUOTE_WORKFLOW_ID = '9532f1ac-1ca9-4719-9901-3085e1c12cdb' // commercial quote requested
const LARGE_UNUSUAL_QUOTE_WORKFLOW_ID = '10a0ead7-9059-4e4c-8ce3-98f55f387d4a' // large/unusual quote requested

/**
 * Abandonment, split by how far the customer got.
 *
 * Someone who gave us contact details and little else needs a nudge to finish. Someone
 * who reached a price and walked is a warmer lead worth a human-ish conversation, so
 * they go to the bot instead. Two different asks, two different workflows.
 */
const ABANDONED_EARLY_WORKFLOW_ID = '6600da40-003e-4a8a-b6ef-b30727479e8d' // Incomplete info v3
const ABANDONED_LATE_WORKFLOW_ID = '59d953b8-41b7-4383-9d92-9d57367fbc45' // v3 - Bot Handover - Web Leads

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
      `${GHL_API_BASE}/opportunities/search?location_id=${encodeURIComponent(ghlLocationId())}` +
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
    body: JSON.stringify({ ...body, locationId: ghlLocationId(), contactId: args.contactId }),
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
  /**
   * Omit when the outcome has no automation yet. The tag, the opportunity and the
   * completion date still land, so the pipeline and the dashboard metric are correct —
   * nothing is messaged until a workflow is wired up.
   */
  workflowId?: string | null
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
    args.workflowId
      ? triggerWorkflow(pit, args.contactId, args.workflowId).catch((e) => `workflow failed: ${e}`)
      : Promise.resolve(null),
  ])

  result.tagged = !tagError
  if (tagError) result.errors.push(tagError)

  result.opportunity = opportunity.outcome
  if (opportunity.error) result.errors.push(opportunity.error)

  // False both when a workflow failed and when there is none to run; only the first of
  // those pushes an error, so the two are still tellable apart.
  result.workflowTriggered = Boolean(args.workflowId) && !workflowError
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
 * A quote the team has to price by hand: open, and deliberately carrying no monetary
 * value, since a fabricated figure would skew the pipeline. Commercial and large/unusual
 * share the tag and the stage but not the workflow — the team handles them differently.
 */
async function requestManualQuote(args: {
  contactId: string
  label: string | null
  suffix: string
  workflowId?: string | null
}): Promise<OutcomeResult> {
  return applyOutcome({
    contactId: args.contactId,
    tag: QUOTE_REQUESTED_TAG,
    opportunityName: opportunityName(args.label, args.suffix),
    stageId: ACQUISITION_QUOTE_REQUESTED_STAGE_ID,
    status: 'open',
    workflowId: args.workflowId,
  })
}

/**
 * A regular residential property we cannot put a number on yet.
 *
 * The conservatory roof is priced per glazed panel on the visit, so a customer who does
 * not know their panel count and asks for nothing but a roof clean has chosen a job with
 * no price at all. Recording that as a booking produced a WON opportunity worth £0 and a
 * contact tagged `appt booked` — a sale on the dashboard that was never priced, let alone
 * agreed. It is a quote request until the team has counted the panels.
 *
 * Deliberately no workflow. The tag, the stage and `booking_completion_date` all land, so
 * the pipeline and the dashboard metric are right, and nothing is messaged to the customer
 * until one is wired up. Pass a `workflowId` through `requestManualQuote` to change that.
 */
export async function confirmResidentialQuoteRequest(args: {
  contactId: string
  contactName?: string | null
}): Promise<OutcomeResult> {
  return requestManualQuote({
    contactId: args.contactId,
    label: args.contactName?.trim() || null,
    suffix: 'window cleaning quote',
  })
}

export async function confirmCommercialQuoteRequest(args: {
  contactId: string
  contactName?: string | null
  businessName?: string | null
}): Promise<OutcomeResult> {
  return requestManualQuote({
    contactId: args.contactId,
    label: args.businessName?.trim() || args.contactName?.trim() || null,
    suffix: 'commercial quote',
    workflowId: COMMERCIAL_QUOTE_WORKFLOW_ID,
  })
}

/**
 * Chases a submission that was left unfinished.
 *
 * Deliberately only the workflow — no tag, and no opportunity move. An abandoned form is
 * not a pipeline outcome, and marking one as such would put a lead that never asked for
 * anything into the same stage as one that did.
 *
 * Returns null when `stepReached` is outside 1–4: step 5 is a completed submission, and
 * anything else is not a state we chase.
 */
export async function notifyAbandonment(args: {
  contactId: string
  stepReached: number
}): Promise<{ triggered: boolean; workflowId: string; stage: 'early' | 'late' } | null> {
  const pit = getPit()
  if (!pit) return null

  let workflowId: string
  let stage: 'early' | 'late'

  if (args.stepReached <= 2) {
    workflowId = ABANDONED_EARLY_WORKFLOW_ID
    stage = 'early'
  } else if (args.stepReached <= 4) {
    workflowId = ABANDONED_LATE_WORKFLOW_ID
    stage = 'late'
  } else {
    return null
  }

  const error = await triggerWorkflow(pit, args.contactId, workflowId).catch(
    (e) => `workflow failed: ${e}`,
  )
  if (error) console.warn(`[abandonment] ${error}`)

  return { triggered: !error, workflowId, stage }
}

/** A large or unusual property: too big for the price book, so the team quotes it. */
export async function confirmLargeUnusualQuoteRequest(args: {
  contactId: string
  contactName?: string | null
}): Promise<OutcomeResult> {
  return requestManualQuote({
    contactId: args.contactId,
    label: args.contactName?.trim() || null,
    suffix: 'large/unusual quote',
    workflowId: LARGE_UNUSUAL_QUOTE_WORKFLOW_ID,
  })
}
