/**
 * What happens in GHL when a form reaches an outcome worth acting on.
 *
 * Three of them, and they differ in kind rather than degree:
 *   - a confirmed residential booking is a WON opportunity carrying a real price
 *   - a commercial quote request is an OPEN one the team still has to price by hand
 *   - a large/unusual quote request is the same, down a different workflow
 *
 * A property the form cannot quote reaches none of them — nothing to tag, nothing to
 * move, nothing to trigger for a job that was never booked.
 *
 * Every step is best effort and independent: a failed tag must not cost us the
 * opportunity, and a failed opportunity must not cost us the workflow.
 */
import { ghlLocationId } from './supabaseServer.js'

const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'

/** Matches the tag already in the location, casing included. */
const BOOKED_TAG = 'appt booked'

/** Present in the location, casing included — confirmed by `npm run check:ghl`. */
const QUOTE_REQUESTED_TAG = 'quote requested'

/**
 * Acquisition Pipeline and its stages, in the POLE POSITION CLEANING location
 * (gTgq0KNEOclOtud3I65l).
 *
 * Not the We Wash Everything ids, and not the Greenmaster ones further back. This
 * location is a snapshot clone, and a clone re-mints every id while keeping the source
 * one as `originId` — so the inherited values looked entirely plausible here and matched
 * nothing, and every opportunity write failed quietly. Each id below was read back from
 * the live location AND confirmed by decoding its `originId` (base64) to the id it
 * replaces, because matching on stage NAME alone would have been satisfied by a
 * same-named stage in a different pipeline.
 *
 * Verify with `npm run check:ghl`.
 */
const ACQUISITION_PIPELINE_ID = 'JoQlofMg2PMligPAzNhQ'
const ACQUISITION_BOOKED_STAGE_ID = 'df20f300-ac94-4820-b9a1-6826ecbec530'
const ACQUISITION_QUOTE_REQUESTED_STAGE_ID = '72897288-c31c-4097-add9-f19802a8fe75'

/**
 * Fired once the outcome is reached and the contact is fully populated.
 *
 * Read back from THIS location by name via `GET /workflows/?locationId=…` on 2026-09-19
 * and confirmed `published` — a draft workflow accepts the trigger call and then does
 * nothing at all, which is the same silent failure as a wrong id. `npm run check:ghl`
 * re-proves both.
 *
 * All five were the previous client's until that read. They named workflows that do not
 * exist in this location, so every automation this form has ever asked for — every
 * booking confirmation, every quote-request handover, every abandonment chase — was a
 * POST into nothing that came back looking like success.
 */
const BOOKING_CONFIRMED_WORKFLOW_ID = 'ace1b951-a7ce-4ce0-8f21-4c56fdc983bc' // Regular Residential Booking Completed

/**
 * The booking that is all quote request and no booking.
 *
 * A customer who picks only services this form cannot price has still completed the form
 * and still expects to hear back — but there is no price to confirm, so the booking
 * workflow would message them about an appointment that was never made. This one exists
 * for exactly that outcome and is why `confirmResidentialQuoteRequest` no longer runs
 * silently.
 */
const QUOTE_REQUEST_COMPLETED_WORKFLOW_ID = '76455c8a-0e65-4cbd-aac8-c1277cc94dd7' // Quote Request Booking Completed

const COMMERCIAL_QUOTE_WORKFLOW_ID = 'e170d7ea-206f-4b5e-9198-c992103bfeb5' // commercial quote requested
const LARGE_UNUSUAL_QUOTE_WORKFLOW_ID = '950bb2e5-c7aa-4b3e-afa8-36b32278f9fe' // large/unusual quote requested

/**
 * Abandonment, split by how far the customer got.
 *
 * Someone who gave us contact details and little else needs a nudge to finish. Someone
 * who reached a price and walked is a warmer lead whose opportunity the team wants
 * routed, so they go down the routing workflow instead. Two different asks, two
 * different workflows.
 */
const ABANDONED_EARLY_WORKFLOW_ID = '4684d4d3-90a0-4cb0-93ee-f5387e5e4897' // Incomplete info v3
const ABANDONED_LATE_WORKFLOW_ID = 'bb277dc6-a46d-437d-ba38-e102858395c0' // Web Leads - routing - update opportunity

/**
 * The same six ids paired with the names they are supposed to have, for `check:ghl`.
 *
 * The checker used to keep its OWN copy of this list, which meant it could only ever prove
 * that some ids existed — not that the ids this file actually POSTs to do. The two drifted
 * exactly as you would expect: the constants above were corrected and the checker went on
 * verifying the previous client's, reporting failures for workflows nothing referenced
 * while the real ones went unchecked.
 *
 * Reading them from here closes that gap. A `const` is not enough on its own — the values
 * have to be the same objects the functions below use, which is why these reference the
 * constants rather than repeating the strings.
 */
export const WORKFLOWS: ReadonlyArray<{ id: string; name: string }> = [
  { id: BOOKING_CONFIRMED_WORKFLOW_ID, name: 'Regular Residential Booking Completed' },
  { id: QUOTE_REQUEST_COMPLETED_WORKFLOW_ID, name: 'Quote Request Booking Completed' },
  { id: COMMERCIAL_QUOTE_WORKFLOW_ID, name: 'commercial quote requested' },
  { id: LARGE_UNUSUAL_QUOTE_WORKFLOW_ID, name: 'large/unusual quote requested' },
  { id: ABANDONED_EARLY_WORKFLOW_ID, name: 'Incomplete info v3' },
  { id: ABANDONED_LATE_WORKFLOW_ID, name: 'Web Leads - routing - update opportunity' },
]

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
  /** Set on a 400 refusing a duplicate — it names the opportunity already there. */
  code?: string
  meta?: { existingId?: string }
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

  const payload = await readJson(response)

  // `/opportunities/search` is eventually consistent, so a contact who completes twice in
  // quick succession looks like it has no opportunity when it already has one — we then
  // try to create a second, and GHL refuses. It also tells us which one is in the way, so
  // this is recoverable rather than a lost pipeline move. Seen for real while backfilling:
  // two submissions seconds apart, the first created, the second 400'd, and the stage
  // change was dropped on the floor.
  const existingId = payload?.meta?.existingId
  if (response.status === 400 && existingId) {
    const retry = await fetch(`${GHL_API_BASE}/opportunities/${encodeURIComponent(existingId)}`, {
      method: 'PUT',
      headers: headers(pit),
      body: JSON.stringify(body),
    })
    if (retry.ok) return { outcome: 'updated' }
    return {
      outcome: 'failed',
      error: `opportunity update after duplicate returned ${retry.status}: ${JSON.stringify(await readJson(retry))}`,
    }
  }

  return {
    outcome: 'failed',
    error: `opportunity create returned ${response.status}: ${JSON.stringify(payload)}`,
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
 * Two ways to get here, and they are both "completed the form, bought nothing priced":
 *
 *  - the customer selected ONLY quote-request services (pressure washing), which carry no
 *    price by design and never will;
 *  - every row they did select came back unpriced, which on this client means the pricing
 *    API could not answer and the quote screen showed no numbers at all.
 *
 * Recording either as a booking produced a WON opportunity worth £0 and a contact tagged
 * `appt booked` — a sale on the dashboard that was never priced, let alone agreed. It is a
 * quote request until the team has put a number on it.
 *
 * Unlike the other manual-quote outcomes this one DOES message the customer: they filled
 * the form in and are owed an acknowledgement, and "Quote Request Booking Completed" is
 * the workflow that sends it. It is deliberately not the booking workflow, which would
 * confirm an appointment that was never made.
 */
export async function confirmResidentialQuoteRequest(args: {
  contactId: string
  contactName?: string | null
}): Promise<OutcomeResult> {
  return requestManualQuote({
    contactId: args.contactId,
    label: args.contactName?.trim() || null,
    suffix: 'window cleaning quote',
    workflowId: QUOTE_REQUEST_COMPLETED_WORKFLOW_ID,
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

/**
 * Replays an outcome onto a contact whose original opportunity write failed.
 *
 * Every Greenmaster lead before the id remap reached GHL with no opportunity at all: the
 * pipeline and stage ids were Kings' and, once those were fixed, the PIT token still had
 * no opportunities scope. Both are resolved, so the pipeline can be rebuilt from what the
 * submissions already record.
 *
 * DELIBERATELY WITHOUT THE WORKFLOW. `applyOutcome` only fires one when it is given an id,
 * and none is given here. Those workflows send real SMS and email, and replaying them
 * would message people about a quote they asked for days ago. GHL may still react to the
 * stage change through its own automations — that is the account's configuration, not
 * something this function asks for.
 *
 * `storedStage` is `submissions.pipeline_stage`, the stage the server settled on rather
 * than the one the browser proposed. Null means the form was never completed, and that
 * returns null: an abandoned form is not a pipeline outcome, and recording one would put a
 * lead that never asked for anything into the same stage as one that did.
 */
export async function backfillOutcome(args: {
  contactId: string
  storedStage: string | null
  contactName?: string | null
  businessName?: string | null
  firstCleanPrice?: number | null
}): Promise<OutcomeResult | null> {
  const name = args.contactName?.trim() || null

  switch (args.storedStage) {
    case 'booked':
      return applyOutcome({
        contactId: args.contactId,
        tag: BOOKED_TAG,
        opportunityName: opportunityName(name, 'window cleaning'),
        stageId: ACQUISITION_BOOKED_STAGE_ID,
        status: 'won',
        value: args.firstCleanPrice ?? null,
      })

    case 'commercial_enquiry':
      return applyOutcome({
        contactId: args.contactId,
        tag: QUOTE_REQUESTED_TAG,
        opportunityName: opportunityName(args.businessName?.trim() || name, 'commercial quote'),
        stageId: ACQUISITION_QUOTE_REQUESTED_STAGE_ID,
        status: 'open',
      })

    case 'large_unusual_enquiry':
      return applyOutcome({
        contactId: args.contactId,
        tag: QUOTE_REQUESTED_TAG,
        opportunityName: opportunityName(name, 'large/unusual quote'),
        stageId: ACQUISITION_QUOTE_REQUESTED_STAGE_ID,
        status: 'open',
      })

    case 'residential_quote_request':
      return applyOutcome({
        contactId: args.contactId,
        tag: QUOTE_REQUESTED_TAG,
        opportunityName: opportunityName(name, 'window cleaning quote'),
        stageId: ACQUISITION_QUOTE_REQUESTED_STAGE_ID,
        status: 'open',
      })

    default:
      return null
  }
}
