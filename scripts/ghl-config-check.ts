/**
 * Verifies every GHL identifier the form writes against the live location.
 *
 * This exists because of a bug that cost a week of leads. The Greenmaster location is a
 * snapshot clone of Kings, and cloning re-mints every id — GHL stores the source id as
 * `originId`, so the Kings ids looked entirely plausible and matched nothing. GHL then
 * discards an unknown custom field id *silently*: the contact write returns 200 and the
 * fields simply are not there. Nothing in the app could detect it.
 *
 * So the check has to come from outside the app. Run it after any rebrand, any snapshot
 * import, and before pointing this form at a new location:
 *
 *   npm run check:ghl
 *
 * Reads GHL_PIT_TOKEN and GHL_LOCATION_ID from the environment or .env.local. Read-only:
 * it fetches and compares, and writes nothing.
 */
import { readFileSync } from 'node:fs'
import { FIELD, CHECKLIST } from '../api/_lib/ghlFieldMap.js'

const API = 'https://services.leadconnectorhq.com'
const VERSION = '2021-07-28'

/** Ids that must exist, and the human name to print when one does not. */
const PIPELINE = { id: 'QmQu4KbbylgPGwIbekcd', name: 'Acquisition Pipeline' }
const STAGES = [
  { id: '86d782e1-460b-43c7-a4b3-e5e8e69d9191', name: 'Booked' },
  { id: '2b557b54-f060-4f6a-aa06-c9c75ac57d52', name: 'Quote Requested' },
]
const WORKFLOWS = [
  { id: 'cf54fd01-c126-44ae-becd-cd968b821bb8', name: 'Regular Residential Booking Completed' },
  { id: '9532f1ac-1ca9-4719-9901-3085e1c12cdb', name: 'commercial quote requested' },
  { id: '10a0ead7-9059-4e4c-8ce3-98f55f387d4a', name: 'large/unusual quote requested' },
  { id: '6600da40-003e-4a8a-b6ef-b30727479e8d', name: 'Incomplete info v3' },
  { id: '59d953b8-41b7-4383-9d92-9d57367fbc45', name: 'v3 - Bot Handover - Web Leads' },
]
const TAGS = ['appt booked', 'quote requested']

function fromEnvFile(name: string): string {
  try {
    const line = readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.startsWith(`${name}=`))
      .pop()
    return line ? line.slice(name.length + 1).replace(/^['"]|['"]$/g, '').trim() : ''
  } catch {
    return ''
  }
}

const PIT = process.env.GHL_PIT_TOKEN || fromEnvFile('GHL_PIT_TOKEN')
const LOCATION = process.env.GHL_LOCATION_ID || fromEnvFile('GHL_LOCATION_ID')

if (!PIT || !LOCATION) {
  console.error('Set GHL_PIT_TOKEN and GHL_LOCATION_ID (env or .env.local).')
  process.exit(2)
}

async function get(path: string): Promise<any> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${PIT}`, Version: VERSION, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`${path} -> ${response.status}`)
  return response.json()
}

const problems: string[] = []
const warnings: string[] = []
const ok: string[] = []

function check(condition: boolean, label: string, detail: string) {
  if (condition) ok.push(label)
  else problems.push(`${label} — ${detail}`)
}

async function main() {
  console.log(`Location ${LOCATION}\n`)

  // ── custom fields ──
  const fields = (await get(`/locations/${LOCATION}/customFields?model=contact`)).customFields ?? []
  const byId = new Map<string, any>(fields.map((f: any) => [f.id, f]))

  for (const [name, id] of Object.entries(FIELD)) {
    if (id === null) {
      // Not a failure the code can fix — the location simply has not got the field.
      warnings.push(`${name} — no field in this location, so nothing is written`)
      continue
    }
    const field = byId.get(id)
    check(Boolean(field), `field ${name}`, `id ${id} is not in this location`)
    if (field) ok[ok.length - 1] = `field ${name} -> ${field.fieldKey}`
  }

  // A checkbox value that is not an exact option string is dropped as quietly as a bad id.
  const checkbox = byId.get(FIELD.bookedServices)
  if (checkbox) {
    const options: string[] = checkbox.picklistOptions ?? []
    for (const value of Object.values(CHECKLIST)) {
      check(
        options.includes(value),
        `checklist option "${value}"`,
        `not an option on ${checkbox.fieldKey} — GHL will drop it`,
      )
    }
  }

  // ── pipeline and stages ──
  // A 401 here is not a broken check, it is the answer: the Private Integration Token has
  // no opportunities scope, so every pipeline write fails however right the ids are.
  let pipelines: any[] = []
  try {
    pipelines = (await get(`/opportunities/pipelines?locationId=${LOCATION}`)).pipelines ?? []
  } catch (error) {
    const unauthorised = error instanceof Error && error.message.includes('401')
    problems.push(
      unauthorised
        ? 'opportunities — the PIT token has no opportunities scope, so pipeline writes ' +
          'cannot work. Add opportunities.readonly and opportunities.write to the token in GHL.'
        : `opportunities — could not read pipelines: ${error}`,
    )
  }
  if (pipelines.length) {
    const pipeline = pipelines.find((p: any) => p.id === PIPELINE.id)
    check(Boolean(pipeline), `pipeline ${PIPELINE.name}`, `id ${PIPELINE.id} is not in this location`)
    for (const stage of STAGES) {
      const found = (pipeline?.stages ?? []).some((s: any) => s.id === stage.id)
      check(found, `stage ${stage.name}`, `id ${stage.id} is not on ${PIPELINE.name}`)
    }
  }

  // ── workflows ──
  const workflows = (await get(`/workflows/?locationId=${LOCATION}`)).workflows ?? []
  for (const wanted of WORKFLOWS) {
    const found = workflows.find((w: any) => w.id === wanted.id)
    check(Boolean(found), `workflow ${wanted.name}`, `id ${wanted.id} is not in this location`)
    // A draft workflow accepts the trigger call and then does nothing at all.
    if (found && found.status !== 'published') {
      warnings.push(`workflow ${wanted.name} is ${found.status}, so triggering it does nothing`)
    }
  }

  // ── tags ──
  const tags = ((await get(`/locations/${LOCATION}/tags`)).tags ?? []).map((t: any) => t.name)
  for (const tag of TAGS) {
    check(tags.includes(tag), `tag "${tag}"`, 'not in this location (GHL creates it on first use)')
  }

  // ── report ──
  console.log(`${ok.length} checks passed`)
  for (const line of ok) console.log(`  ok    ${line}`)
  if (warnings.length) {
    console.log(`\n${warnings.length} warnings`)
    for (const line of warnings) console.log(`  warn  ${line}`)
  }
  if (problems.length) {
    console.log(`\n${problems.length} FAILURES`)
    for (const line of problems) console.log(`  FAIL  ${line}`)
    process.exit(1)
  }
  console.log('\nEvery id resolves in this location.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(2)
})
