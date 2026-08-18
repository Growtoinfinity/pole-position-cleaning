/**
 * Supabase `service_role` client — server-side only.
 *
 * RLS is on for `submissions` with no public policies, so every read/write has to
 * go through this key. Import this module ONLY from files under `api/`; importing it
 * from anything under `src/` would ship the service-role key in the browser bundle.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { GHL_LOCATION_ID_FALLBACK } from './webhooks'

/** Location id written onto every submission row. */
export const GHL_LOCATION_ID =
  process.env.GHL_LOCATION_ID || GHL_LOCATION_ID_FALLBACK

let cached: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/**
 * Throws when the env vars are missing so callers can degrade to "GHL only"
 * rather than silently writing nowhere.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached

  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side, no VITE_ prefix)',
    )
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'kings-quote-form' } },
  })

  return cached
}

export const SUBMISSIONS_TABLE = 'submissions'

/** Shape of a `submissions` row (mirrors the applied SQL schema). */
export type SubmissionRow = {
  id: string
  token: string
  location_id: string
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
