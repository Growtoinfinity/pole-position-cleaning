/**
 * Supabase secret-key client — server-side only.
 *
 * RLS is on for `submissions` with no public policies, so every read/write has to
 * go through this key. Import this module ONLY from files under `api/`; importing it
 * from anything under `src/` would ship a secret key in the browser bundle.
 *
 * There is deliberately NO publishable (formerly anon) key anywhere in this project.
 * Nothing under `src/` talks to Supabase — the browser only ever calls the `api/`
 * routes — so a publishable key would have no consumer. If a screen ever does need
 * to query Supabase directly, that is the point to add one, and it belongs in a
 * separate client that is safe to bundle.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The GHL location — written onto every submission row, every contact we create and
 * every pricing call.
 *
 * Read LAZILY, for the same reason `apiKey()` in pricingApi.ts is: `vite.config.ts`
 * imports the api/ modules at config time, so a module-level `process.env` read captures
 * the value BEFORE loadEnv has populated it. As a const this resolved to the empty
 * string and then to its fallback on every dev request.
 *
 * And there is no fallback any more. It used to default to another client's location id,
 * which meant a single env-loading hiccup silently sent this client's pricing calls,
 * contacts and opportunities into someone else's CRM. An unset location is a
 * misconfiguration; it must fail loudly rather than succeed against the wrong account.
 */
export function ghlLocationId(): string {
  return process.env.GHL_LOCATION_ID || ''
}

export function isGhlLocationConfigured(): boolean {
  return Boolean(ghlLocationId())
}

let cached: SupabaseClient | null = null
let warnedAboutLegacyKey = false

/**
 * The server-side key, read LAZILY for the same reason `ghlLocationId()` is.
 *
 * Supabase is retiring the legacy `service_role` JWT in favour of secret keys
 * (`sb_secret_…`), so `SUPABASE_SECRET_KEY` is what this form asks for. Both are
 * passed to `createClient` the same way and carry the same RLS-bypassing authority,
 * so the swap is the variable name and nothing else.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` is still accepted, and this is the ONLY reason why:
 * production reads its environment from Vercel, not from this repo, so a deploy that
 * lands before the new variable has been pushed would otherwise fail `getSupabaseAdmin`
 * on every request and drop every submission on the floor. It warns once so the
 * fallback cannot be load-bearing by accident.
 *
 * REMOVE THE FALLBACK once `vercel env ls production` shows SUPABASE_SECRET_KEY:
 * delete the `legacy` branch below, the two names in scripts/vercel-env-push.sh and
 * vite.config.ts, and the variable itself from Vercel.
 */
function supabaseSecretKey(): string {
  const secret = process.env.SUPABASE_SECRET_KEY
  if (secret) return secret

  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (legacy && !warnedAboutLegacyKey) {
    warnedAboutLegacyKey = true
    console.warn(
      '[supabase] Falling back to deprecated SUPABASE_SERVICE_ROLE_KEY. Supabase is ' +
        'retiring it — set SUPABASE_SECRET_KEY (sb_secret_…) and delete the old variable.',
    )
  }

  return legacy || ''
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && supabaseSecretKey())
}

/**
 * Throws when the env vars are missing so callers can degrade to "GHL only"
 * rather than silently writing nowhere.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached

  const url = process.env.SUPABASE_URL
  const secretKey = supabaseSecretKey()

  if (!url || !secretKey) {
    throw new Error(
      'Supabase is not configured: set SUPABASE_URL and SUPABASE_SECRET_KEY (server-side, no VITE_ prefix)',
    )
  }

  cached = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'pole-position-quote-form' } },
  })

  return cached
}

export const SUBMISSIONS_TABLE = 'submissions'

/** Shape of a `submissions` row (mirrors the applied SQL schema). */
export type SubmissionRow = {
  id: string
  token: string
  /**
   * The tenant. `submissions` is ONE table shared by every brand's webform — as of
   * 2026-09-10 it holds two other live brands alongside this one — and this column is the
   * only thing separating them. Every read that is not by `token` must filter on it.
   */
  location_id: string
  /**
   * Traffic source, NOT tenant: 'organic' | 'google_ads'. `not null default 'organic'`,
   * and this form never sets it, so every row it writes is 'organic'. It is here because
   * the live table has it and `select('*')` returns it — one brand does split its funnel,
   * and the unique index on active step-1 submissions includes this column.
   */
  variant: string
  contact_id: string | null
  email: string | null
  step_reached: number | null
  status: string | null
  form_type: string | null
  form_data: Record<string, unknown> | null
  quote: Record<string, unknown> | null
  pipeline_stage: string | null
  abandonment_notified: boolean | null
  created_at: string | null
  updated_at: string | null
  completed_at: string | null
}
