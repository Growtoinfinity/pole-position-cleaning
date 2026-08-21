/**
 * Work the customer's response must not wait for, and that must not be dropped either.
 *
 * A serverless function can be frozen the instant it responds, so a floating promise is
 * not guaranteed to finish — which is precisely how the price push would be lost for the
 * abandoning lead it exists to serve. `waitUntil` keeps the invocation alive until the
 * work settles, so the write survives without sitting in front of the response.
 *
 * It is not universally available. `waitUntil` resolves the request context through a
 * global symbol and, when there is none, silently does nothing — `getContext().waitUntil?.()`
 * in `@vercel/functions`. Silently doing nothing is the entire failure this module exists
 * to prevent, so the context is checked rather than assumed: without one we await instead,
 * which is right both under `npm run dev` (a long-lived process, where waiting costs
 * nothing real) and on any runtime that does not provide a context.
 */
import { waitUntil } from '@vercel/functions'

/** The key `@vercel/functions` reads the request context from. */
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context')

type ContextHolder = {
  get?: () => { waitUntil?: (promise: Promise<unknown>) => void } | undefined
}

function hasWaitUntil(): boolean {
  const holder = (globalThis as unknown as Record<symbol, ContextHolder | undefined>)[
    REQUEST_CONTEXT
  ]
  return typeof holder?.get?.()?.waitUntil === 'function'
}

/**
 * Hands `work` to the platform to finish after the response, or awaits it when the
 * platform cannot. Never rejects: the caller is on a customer's path, and a background
 * failure must not surface there.
 */
export async function runAfterResponse(work: Promise<unknown>, label: string): Promise<void> {
  const guarded = work.catch((error) => {
    console.warn(`[${label}] background work failed:`, error)
  })

  if (hasWaitUntil()) {
    waitUntil(guarded)
    return
  }

  await guarded
}
