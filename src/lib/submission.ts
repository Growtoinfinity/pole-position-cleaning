/**
 * Client side of the Supabase submission-tracking layer.
 *
 * Every call here is best-effort: GHL delivery and the UI are the priority paths, so a
 * Supabase failure is logged and swallowed rather than surfaced or retried. The one
 * exception is `syncQuote`, whose caller needs to know whether the server managed to
 * fire the residentialFrequency webhook so it can fall back to the client-side send.
 */
import type { CalcInput, CalcResult } from '@/lib/costing-calc'
import type { ContactFormData } from '@/lib/unified-payload'
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
export async function ensureSubmissionStarted(
  contact: ContactFormData,
): Promise<string | null> {
  const store = useFormStore.getState()
  if (store.token) return store.token

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
  /** Server-calculated result — authoritative over anything computed in the browser. */
  quote: CalcResult | null
  /** True when the server already fired the residentialFrequency GHL webhook. */
  ghlForwarded: boolean
}

/**
 * S3 — asks the server for the authoritative quote. The server writes it to `quote`
 * and pushes it to GHL in the same request, so the CRM price and the stored price
 * cannot drift apart.
 */
export async function syncQuote(args: {
  calcInput: CalcInput
  /** The same `data` object `sendStepData('residentialFrequency', …)` would receive. */
  formData: Record<string, unknown>
  contactData: ContactFormData | null
  arrivedAtStep: Step
}): Promise<QuoteSyncResult> {
  const store = useFormStore.getState()

  const result = await post<{ quote?: CalcResult; ghlForwarded?: boolean }>('quote', {
    token: store.token,
    step: args.arrivedAtStep,
    calcInput: args.calcInput,
    formData: args.formData,
    contactData: args.contactData,
    continueUrl: store.getContinueUrl(),
    fields: store.getFormSnapshot(args.arrivedAtStep),
  })

  return {
    quote: result?.quote ?? null,
    ghlForwarded: result?.ghlForwarded === true,
  }
}

/** S5 — marks the submission completed and stamps the pipeline stage. */
export async function completeSubmission(args: {
  pipelineStage: string
  arrivedAtStep: Step
}): Promise<void> {
  const store = useFormStore.getState()
  if (!store.token) return

  await post<{ ok?: boolean }>('complete', {
    token: store.token,
    step: args.arrivedAtStep,
    pipelineStage: args.pipelineStage,
    fields: store.getFormSnapshot(args.arrivedAtStep),
  })
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
