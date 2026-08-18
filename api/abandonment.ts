/**
 * Chases submissions that were left unfinished.
 *
 * Runs on a schedule (Vercel Cron — see `vercel.json`). The original plan put this in a
 * `pg_cron` job with a Supabase Edge Function, but neither `pg_cron` nor `pg_net` is
 * installed in the project and no Edge Function exists; every piece of GHL plumbing
 * already lives in this repo, so the sweep lives here too.
 *
 * The rule, in one line: an `in_progress` submission with a GHL contact, untouched for
 * longer than the idle threshold, gets one workflow — which one depends on how far the
 * customer got — and is then marked so it is never chased twice.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  SUBMISSIONS_TABLE,
  type SubmissionRow,
} from './_lib/supabaseServer.js'
import { notifyAbandonment } from './_lib/ghlOutcomes.js'

/** How long a submission must sit untouched before it counts as abandoned. */
const DEFAULT_IDLE_MINUTES = 30

/**
 * Submissions older than this are left alone. Without it, the first run after a quiet
 * deploy would chase every stale row in the table at once — including people who walked
 * away weeks ago and would rightly find the message baffling.
 */
const DEFAULT_MAX_AGE_DAYS = 7

/** Kept small so a run finishes well inside the function timeout. */
const BATCH_LIMIT = 50

function intFromEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

/**
 * The endpoint is unauthenticated without this, and anyone who guessed the path could
 * fire real messages at real customers. Vercel Cron sends `Authorization: Bearer
 * $CRON_SECRET` automatically once the variable is set on the project.
 */
function isAuthorised(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const header = req.headers.authorization ?? ''
  return header === `Bearer ${secret}`
}

export type SweepResult = {
  scanned: number
  notified: number
  skipped: number
  failed: number
  byStage: { early: number; late: number }
}

/**
 * One pass over the abandoned submissions.
 *
 * A row is only marked once its workflow actually fired, so a transient GHL failure is
 * retried on the next run rather than silently swallowing the lead. The max-age window
 * is what stops a permanently failing row being retried forever.
 */
export async function sweepAbandoned(): Promise<SweepResult> {
  const supabase = getSupabaseAdmin()
  const result: SweepResult = {
    scanned: 0,
    notified: 0,
    skipped: 0,
    failed: 0,
    byStage: { early: 0, late: 0 },
  }

  const idleMinutes = intFromEnv('ABANDONMENT_IDLE_MINUTES', DEFAULT_IDLE_MINUTES)
  const maxAgeDays = intFromEnv('ABANDONMENT_MAX_AGE_DAYS', DEFAULT_MAX_AGE_DAYS)

  const now = Date.now()
  const idleBefore = new Date(now - idleMinutes * 60_000).toISOString()
  const notOlderThan = new Date(now - maxAgeDays * 24 * 60 * 60_000).toISOString()

  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .eq('status', 'in_progress')
    .eq('abandonment_notified', false)
    .not('contact_id', 'is', null)
    .lte('updated_at', idleBefore)
    .gte('updated_at', notOlderThan)
    .order('updated_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as SubmissionRow[]
  result.scanned = rows.length

  // Sequential on purpose: a burst of parallel workflow calls buys nothing here and
  // risks the rate limit, and this runs on a schedule with no one waiting on it.
  for (const row of rows) {
    if (!row.contact_id) {
      result.skipped += 1
      continue
    }

    const outcome = await notifyAbandonment({
      contactId: row.contact_id,
      stepReached: row.step_reached ?? 1,
    })

    // Step 5 or an unrecognised value — nothing to chase
    if (!outcome) {
      result.skipped += 1
      continue
    }

    if (!outcome.triggered) {
      result.failed += 1
      continue
    }

    const { error: markError } = await supabase
      .from(SUBMISSIONS_TABLE)
      .update({
        abandonment_notified: true,
        status: 'abandoned',
        updated_at: new Date().toISOString(),
      })
      .eq('token', row.token)

    if (markError) {
      // The workflow already fired, so leaving the flag unset would chase them twice
      console.error(`[abandonment] fired but could not mark ${row.token}: ${markError.message}`)
      result.failed += 1
      continue
    }

    result.notified += 1
    result.byStage[outcome.stage] += 1
  }

  return result
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isAuthorised(req)) {
    // Deliberately terse: this endpoint sends real messages to real customers
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: 'Submission store is not configured' })
  }

  try {
    const result = await sweepAbandoned()
    console.log(
      `[abandonment] scanned ${result.scanned}, notified ${result.notified} ` +
        `(${result.byStage.early} early, ${result.byStage.late} late), ` +
        `skipped ${result.skipped}, failed ${result.failed}`,
    )
    return res.status(200).json(result)
  } catch (error) {
    console.error('[abandonment] sweep failed:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Sweep failed',
    })
  }
}
