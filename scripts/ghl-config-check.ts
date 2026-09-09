/**
 * Verifies every GHL identifier the form writes against the live location.
 *
 * This exists because of a bug that cost a week of leads. The Greenmaster location is a
 * snapshot clone of Kings, and cloning re-mints every id — GHL stores the source id as
 * `originId`, so the Kings ids looked entirely plausible and matched nothing. GHL then
 * discards an unknown custom field id *silently*: the contact write returns 200 and the
 * fields simply are not there. Nothing in the app could detect it.
 *
 * This form is a fork of that one, pointed at a third location, so it is the same hazard
 * a second time: every id in `FIELD` had to be read back from the We Wash Everything
 * sub-account rather than translated across, and nothing but this script can prove it was.
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

/**
 * Credentials may live in either file. `.env.local` is Vite's convention and was the
 * only one read here; `.env` is what most people actually create, and a check that
 * silently reports "set GHL_PIT_TOKEN" at someone who plainly has is worse than no
 * check. Later files win, matching Vite's own precedence.
 */
const ENV_FILES = ['.env', '.env.local']
import { FIELD, FIELD_KEY, CHECKLIST } from '../api/_lib/ghlFieldMap.js'

const API = 'https://services.leadconnectorhq.com'
const VERSION = '2021-07-28'

/**
 * The location every id in `FIELD` was read from — We Wash Everything
 * (`docs/pricing-api-wewasheverything.md` §1).
 *
 * Worth naming here because the failure it catches is confusing rather than obvious: run
 * against any other location and every single field check fails at once, which reads like
 * a broken script rather than a mis-set `GHL_LOCATION_ID`. It is the same id
 * `ghlLocationId()` refuses to guess at — that fallback used to be another client's
 * location, and one env-loading hiccup wrote this client's leads into their CRM.
 */
const EXPECTED_LOCATION = 'A9cGvKBunXk003dXUmSV'

/** Ids that must exist, and the human name to print when one does not. */
const PIPELINE = { id: 'eVOLJf7j1LPcUm0NyI8C', name: 'Acquisition Pipeline' }
const STAGES = [
  { id: 'a3e2fa44-883b-4b86-87c8-5cbbec9f4376', name: 'Booked' },
  { id: 'f0c9fcc0-06b8-451f-82b7-978d8d9b5ad3', name: 'Quote Requested' },
]
const WORKFLOWS = [
  { id: 'c2fab068-02f4-4c8f-b67f-9a4f3f3e320d', name: 'Regular Residential Booking Completed' },
  { id: '62fd5dd1-b251-4556-8a6e-9bc99e7a3a75', name: 'commercial quote requested' },
  { id: '115da78d-2755-400e-8a22-8f68ea2bbb14', name: 'large/unusual quote requested' },
  { id: '164b211d-827f-474b-8e14-a2f6ab5349f2', name: 'Incomplete info v3' },
  { id: 'ad5736b4-390e-4ddb-8960-0088f9ee8b28', name: 'v3 - Bot Handover - Web Leads' },
]
const TAGS = ['appt booked', 'quote requested']

function fromEnvFile(name: string): string {
  const line = ENV_FILES.flatMap((file) => {
    try {
      return readFileSync(file, 'utf8').split(/\r?\n/)
    } catch {
      return []
    }
  })
    .filter((l) => l.startsWith(`${name}=`))
    .pop()
  return line ? line.slice(name.length + 1).replace(/^['"]|['"]$/g, '').trim() : ''
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
  if (LOCATION !== EXPECTED_LOCATION) {
    warnings.push(
      `this is not the We Wash Everything location (${EXPECTED_LOCATION}) the ids in ` +
        'ghlFieldMap.ts were read from — expect every field below to fail, and check ' +
        'GHL_LOCATION_ID before believing any of it',
    )
  }

  // ── custom fields ──
  const fields = (await get(`/locations/${LOCATION}/customFields?model=contact`)).customFields ?? []
  const byId = new Map<string, any>(fields.map((f: any) => [f.id, f]))

  for (const [name, id] of Object.entries(FIELD)) {
    // A failure now, where it used to be a warning. The only two null ids this map ever
    // held were the 4- and 8-weekly price fields, and they were null because the location
    // has no such fields — it sells a 6- and 12-weekly cycle. There is no 4- or 8-weekly
    // service in this catalogue at all any more (§4), those entries are gone, and every
    // field the form now writes exists in this location. So a missing id is no longer a
    // known gap; it is a write that silently goes nowhere, which is the exact failure
    // this script exists to make visible.
    //
    // `!id` rather than `=== null` on purpose: it also catches an id blanked to '' while
    // someone was hunting one down, and it does not read as a dead comparison now that
    // `FIELD` holds no nullable value. An entry the location genuinely has not got should
    // be deleted from `FIELD`, not nulled.
    if (!id) {
      problems.push(`field ${name} — no id, so nothing is ever written to it`)
      continue
    }
    const field = byId.get(id)
    if (!field) {
      // Not `check()`: that pushes a pass onto `ok` the moment the id resolves, and the
      // key comparison below can then push a failure for the same field — one field on
      // both lists, and a "N passed" line inflated by exactly the number of mismatches.
      // Each field reports once, after both questions have been asked.
      problems.push(`field ${name} — id ${id} is not in this location`)
      continue
    }

    /**
     * Existing is not enough — it has to be the RIGHT field.
     *
     * An id read back from a new sub-account one line out of step still exists, so the
     * check above passes and the write lands somewhere real. That is worse than a discarded
     * write: a bedroom count sitting in the postcode field looks like data, and nothing
     * downstream can tell it is not. `FIELD_KEY` is what this compares against, which is
     * also the only reason the promise in `FIELD`'s docblock is now true.
     */
    const expected = FIELD_KEY[name as keyof typeof FIELD_KEY]
    if (field.fieldKey !== expected) {
      problems.push(
        `field ${name} — id ${id} is "${field.fieldKey}" in this location, not "${expected}"`,
      )
      continue
    }
    ok.push(`field ${name} -> ${field.fieldKey}`)
  }

  // A checkbox value that is not an exact option string is dropped as quietly as a bad id.
  // All eight of this catalogue's `booked_service_option` strings are checked (§4),
  // including the two one-off cleans the quote screen does not offer yet: `CHECKLIST` maps
  // the whole catalogue, and an option that has drifted should be caught before the day
  // something starts writing it, not after.
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
  } else {
    // The field id failed its own check above; say out loud that eight more checks did
    // not run, rather than letting the count quietly come up short.
    problems.push(
      `booked_services — the checkbox field was not found, so none of the ` +
        `${Object.keys(CHECKLIST).length} option strings could be verified`,
    )
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
