import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * TEMPORARY diagnostic — delete once the deployment is confirmed configured.
 *
 * The Vercel dashboard listed every variable, yet /api/pricing answered
 * `not_configured` and Vercel Cron got a 401 from /api/abandonment. Both mean the
 * running function cannot see the values. This reports what the function's own
 * `process.env` actually holds.
 *
 * Reports names and value LENGTHS only. No value is ever returned: a length tells an
 * operator whether a paste truncated or picked up a stray quote, and tells an attacker
 * nothing. `candidates` scans for near-miss key names, which is where a typo or a
 * trailing space in the NAME (invisible in the dashboard) would show up.
 */
const NAMES = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GHL_LOCATION_ID',
  'GHL_PIT_TOKEN',
  'PRICING_API_KEY',
  'PRICING_API_URL',
  'CRON_SECRET',
  'ABANDONMENT_IDLE_MINUTES',
  'ABANDONMENT_MAX_AGE_DAYS',
]

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const seen: Record<string, string> = {}
  for (const name of NAMES) {
    const value = process.env[name]
    seen[name] =
      value === undefined ? 'ABSENT' : value === '' ? 'EMPTY' : `present (${value.length} chars)`
  }

  return res.status(200).json({
    vercelEnv: process.env.VERCEL_ENV ?? null,
    region: process.env.VERCEL_REGION ?? null,
    node: process.version,
    totalEnvKeys: Object.keys(process.env).length,
    // JSON.stringify keeps a trailing space visible; a bare name in a list would not
    candidates: Object.keys(process.env)
      .filter((k) => /SUPA|GHL|PRICING|CRON|ABANDON/i.test(k))
      .map((k) => JSON.stringify(k)),
    seen,
  })
}
