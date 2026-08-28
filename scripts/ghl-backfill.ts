/**
 * Replays the CRM field write for leads captured while the ids were wrong.
 *
 * Every Greenmaster lead taken before the id remap reached GHL with its name, email and
 * phone and essentially nothing else: GHL discards an unknown custom field id in silence,
 * so the property, the prices and the booking never landed. The data was never lost — it
 * is all in `submissions.form_data` — so it can simply be written again, correctly.
 *
 *   npm run backfill:ghl            # dry run, writes nothing
 *   npm run backfill:ghl -- --apply # do it
 *
 * Two deliberate limits.
 *
 * It writes CUSTOM FIELDS ONLY. It does not tag, does not touch opportunities and does
 * not trigger a workflow. Those are how GHL sends things, and the booking-confirmed and
 * abandonment workflows send real SMS and email — replaying them would message people
 * about a quote they asked for days ago. Fixing stored data must not spam the customer.
 *
 * It is scoped to one location. `submissions` is shared with Kings, and Greenmaster's
 * field ids on a Kings contact would be the same silent-drop bug pointed the other way.
 * The location filter is not a convenience, it is the safety property.
 *
 * Rows replay oldest first, per contact, so the end state is what the CRM would hold if
 * the ids had been right from the start.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  let text = ''
  try {
    text = readFileSync('.env.local', 'utf8')
  } catch {
    return
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (!match) continue
    const [, key, raw] = match
    if (!process.env[key]) process.env[key] = raw.replace(/^['"]|['"]$/g, '').trim()
  }
}
loadEnvLocal()

// Imported after the env is populated: these modules read process.env when called, but
// keeping the order explicit means a future top-level read cannot silently capture ''.
const { syncGhlContact } = await import('../api/_lib/ghlContacts.js')
const { buildContactWrite, FIELD } = await import('../api/_lib/ghlFieldMap.js')

const APPLY = process.argv.includes('--apply')
const LOCATION = process.env.GHL_LOCATION_ID || ''
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!LOCATION || !SUPABASE_URL || !SERVICE_ROLE || !process.env.GHL_PIT_TOKEN) {
  console.error('Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GHL_PIT_TOKEN and GHL_LOCATION_ID.')
  process.exit(2)
}

/** id -> the name it has in FIELD, so the report reads as fields rather than hashes. */
const NAME_BY_ID = new Map<string, string>(
  Object.entries(FIELD)
    .filter(([, id]) => typeof id === 'string' && id)
    .map(([name, id]) => [id as string, name]),
)

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase
    .from('submissions')
    .select('id, token, contact_id, form_data, quote, completed_at, status, form_type, created_at')
    .eq('location_id', LOCATION) // the safety property — never widen this
    .not('contact_id', 'is', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Supabase read failed:', error.message)
    process.exit(1)
  }

  const rows = data ?? []
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN — nothing will be written'}`)
  console.log(`location ${LOCATION}: ${rows.length} submissions with a contact\n`)

  let written = 0
  let failed = 0

  for (const row of rows) {
    const snapshot = (row.form_data ?? {}) as Record<string, any>
    const priceTable = (snapshot.priceTable ?? null) as any
    const label = `${row.contact_id}  ${String(row.created_at).slice(0, 16)}  ${row.status}/${row.form_type}`

    const { write } = buildContactWrite(snapshot, {
      webformToken: row.token ?? null,
      quote: (row.quote ?? null) as any,
      completedAt: row.completed_at ?? null,
      priceTable,
    })

    const names = write.customFields.map((f) => NAME_BY_ID.get(f.id) ?? f.id)
    if (!names.length) {
      console.log(`  skip  ${label}  — nothing to write`)
      continue
    }

    if (!APPLY) {
      console.log(`  would ${label}  — ${names.length} fields: ${names.join(', ')}`)
      continue
    }

    const result = await syncGhlContact({
      contactId: row.contact_id,
      snapshot,
      webformToken: row.token ?? null,
      quote: (row.quote ?? null) as any,
      completedAt: row.completed_at ?? null,
      priceTable,
    })

    if (result.outcome === 'failed') {
      failed += 1
      console.log(`  FAIL  ${label}  — ${result.error ?? 'unknown'}`)
    } else {
      written += 1
      console.log(`  ok    ${label}  — ${names.length} fields`)
    }
  }

  console.log(
    APPLY
      ? `\n${written} written, ${failed} failed.`
      : `\nDry run only. Re-run with --apply to write.`,
  )
  if (failed) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(2)
})
