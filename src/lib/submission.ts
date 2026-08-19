/**
 * Client side of the Supabase submission-tracking layer.
 *
 * Every call here is best-effort: the customer's progress through the form is the
 * priority, so a backend failure is logged and swallowed rather than surfaced or retried.
 * The server owns all CRM traffic — the browser never talks to GHL.
 */
import type { CalcInput, CalcResult } from '@/lib/costing-calc'
import type { ContactFormValues } from '@/steps/step-0/ContactStep'
import type { Step } from '@/lib/form-steps'
import { useFormStore, type SubmissionSnapshot } from '@/stores/formStore'

const SUBMISSION_URL = '/api/submission'

async function post<T extends object>(action: string, body: unknown): Promise<T | null> {
  try {
    const response = await fetch(`${SUBMISSION_URL}?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.warn(`[submission:${action}] HTTP ${response.status}`, text)
      return null
    }

    return (await response.json().catch(() => null)) as T | null
  } catch (error) {
    console.warn(`[submission:${action}] request failed`, error)
    return null
  }
}

/**
 * S1 — creates the submission row (and the GHL contact behind it) exactly once per
 * session, then parks the token in the store. Safe to call again: it no-ops once a
 * token exists, so re-submitting the contact step never forks a second row.
 */
let startInFlight: Promise<string | null> | null = null

export async function ensureSubmissionStarted(
  contact: ContactFormValues,
): Promise<string | null> {
  const store = useFormStore.getState()
  if (store.token) return store.token

  // Concurrent callers share the one request. The token check above only helps once a
  // response has come back, so without this every click that lands before the first
  // response still sees `token: null` and starts its own submission — measured against
  // production, ten simultaneous calls produced ten rows (one contact, since the CRM
  // side dedupes on email). The disabled button makes this unreachable by hand; this
  // makes it unreachable at all.
  if (startInFlight) return startInFlight

  startInFlight = (async () => {
    const result = await post<{ token?: string; contactId?: string | null }>('start', {
      email: contact.email,
      contact,
      fields: { ...store.getFormSnapshot('contact'), contactData: contact },
    })

    const token = typeof result?.token === 'string' ? result.token : null
    if (token) {
      useFormStore.getState().setToken(token)
    }
    return token
  })()

  try {
    return await startInFlight
  } finally {
    startInFlight = null
  }
}

/**
 * S2 / S4 — records the step the user has just moved *to* along with the full form
 * snapshot, so `?token=` resume lands on the next unanswered question.
 */
export async function syncStep(arrivedAtStep: Step): Promise<void> {
  const store = useFormStore.getState()
  if (!store.token) return

  await post<{ ok?: boolean }>('step', {
    token: store.token,
    step: arrivedAtStep,
    fields: store.getFormSnapshot(arrivedAtStep),
  })
}

export type QuoteSyncResult = {
  /** Server-resolved result — authoritative over anything computed in the browser. */
  quote: CalcResult | null
}

/**
 * S3 — asks the server for the authoritative quote. The server writes it to `quote`
 * and pushes it to GHL in the same request, so the CRM price and the stored price
 * cannot drift apart.
 */
export async function syncQuote(args: {
  calcInput: CalcInput
  /** Extra context stored alongside the quote. */
  formData: Record<string, unknown>
  contactData: ContactFormValues | null
  arrivedAtStep: Step
}): Promise<QuoteSyncResult> {
  const store = useFormStore.getState()

  const result = await post<{ quote?: CalcResult }>('quote', {
    token: store.token,
    step: args.arrivedAtStep,
    calcInput: args.calcInput,
    formData: args.formData,
    contactData: args.contactData,
    continueUrl: store.getContinueUrl(),
    fields: store.getFormSnapshot(args.arrivedAtStep),
  })

  return { quote: result?.quote ?? null }
}

/** S5 — marks the submission completed and stamps the pipeline stage. */
let completeInFlight: Promise<void> | null = null

export async function completeSubmission(args: {
  pipelineStage: string
  arrivedAtStep: Step
}): Promise<void> {
  const store = useFormStore.getState()
  if (!store.token) return

  // Terminal step, so this is the expensive one to repeat: the server fires a GHL
  // workflow here, which is what actually messages the customer. The route now refuses
  // to re-run the outcome for an already-completed row, and this stops the duplicate
  // requests ever leaving the browser.
  if (completeInFlight) return completeInFlight

  completeInFlight = (async () => {
    await post<{ ok?: boolean }>('complete', {
      token: store.token as string,
      step: args.arrivedAtStep,
      pipelineStage: args.pipelineStage,
      fields: store.getFormSnapshot(args.arrivedAtStep),
    })
  })()

  try {
    await completeInFlight
  } finally {
    completeInFlight = null
  }
}

/** Resume — fetches the row behind a `?token=` link. */
export async function fetchSubmission(token: string): Promise<SubmissionSnapshot | null> {
  try {
    const response = await fetch(
      `${SUBMISSION_URL}?action=get&token=${encodeURIComponent(token)}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )

    if (!response.ok) {
      console.warn(`[submission:get] HTTP ${response.status} for token ${token}`)
      return null
    }

    const data = await response.json().catch(() => null)
    return data && typeof data.token === 'string' ? (data as SubmissionSnapshot) : null
  } catch (error) {
    console.warn('[submission:get] request failed', error)
    return null
  }
}
