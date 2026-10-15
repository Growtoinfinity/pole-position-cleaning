/**
 * Proves, offline, what the abandonment sweep does with a lead who has already booked.
 *
 *   npm run check:abandonment
 *
 * A booking the v3 bot makes over WhatsApp writes no completed submission here, so the
 * sweep asks the contact itself (`bookedSince`, api/_lib/ghlOutcomes.ts): tagged `appt booked`
 * with a `booking_completion_date` no more than a day before the row was created means
 * booked, and the row is marked and skipped. An older booking is a returning customer's
 * fresh enquiry and is chased. A contact GHL cannot answer for is neither chased nor marked,
 * so the next run asks again.
 *
 * No GHL, no Supabase: `fetch` is stubbed — Supabase is an in-memory `submissions` table, GHL
 * a recorder answering the contact read and the workflow call — and it throws on any other
 * host, so nothing in here can reach a live system.
 */
import { FIELD } from '../api/_lib/ghlFieldMap.js'
import { sweepAbandoned } from '../api/abandonment.js'

// "Web Leads - routing - update opportunity  - v3", copied from api/_lib/ghlOutcomes.ts so an id
// that drifts fails here.
const LATE = 'bb277dc6-a46d-437d-ba38-e102858395c0'
const STUB_SUPABASE = 'https://stub-project.supabase.invalid'
const GHL_ORIGIN = 'https://services.leadconnectorhq.com'
const LOCATION = 'abandonment-check-location'

type Json = Record<string, unknown>
type Row = Json & { token: string }

let checks = 0
let failures = 0
function record(name: string, passed: boolean, detail: string) {
  checks += 1
  if (!passed) failures += 1
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${passed ? '' : `\n        ${detail}`}`)
}
const show = (value: unknown) => JSON.stringify(value)
const same = (a: unknown, b: unknown) => show(a) === show(b)

let db: Row[] = []
/** `<contact> <workflow>` for every workflow fired. */
let fired: string[] = []
/** Every contact the guard read (GET /contacts/{id}). */
let contactReads: string[] = []
/** What GHL holds for a contact: its tags and its `booking_completion_date`. Not listed = untagged; 'down' = 503. */
let contactBook: Record<string, { tags: string[]; bookedOn?: string } | 'down'> = {}

/** The PostgREST filters the sweep uses, and no others — an unknown one is a loud stub error. */
function matches(value: unknown, condition: string): boolean {
  if (condition === 'not.is.null') return value !== null && value !== undefined
  const [op, ...rest] = condition.split('.')
  const want = rest.join('.')
  if (op === 'eq') return String(value) === want
  if (op === 'lte') return String(value) <= want
  if (op === 'gte') return String(value) >= want
  // `.in('status', [...])` — `(a,b)`, a value quoted only when it carries a reserved character.
  if (op === 'in') return want.slice(1, -1).split(',').map((v) => v.replace(/^"|"$/g, '')).includes(String(value))
  throw new Error(`abandonment-check stub: unhandled PostgREST filter "${condition}"`)
}

async function stubFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const body = (typeof init.body === 'string' && init.body ? JSON.parse(init.body) : null) as Json | null
  const json = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

  if (url.origin === STUB_SUPABASE && url.pathname === '/rest/v1/submissions') {
    const filters = [...url.searchParams].filter(([key]) => !['select', 'order', 'limit', 'offset', 'columns'].includes(key))
    // `form_data->>origin=eq.webform` is PostgREST's JSON-as-text path, which the sweep filters on.
    const valueAt = (row: Row, key: string) => {
      const [column, path] = key.split('->>')
      return path === undefined ? row[column] : (row[column] as Record<string, unknown> | null | undefined)?.[path]
    }
    const hits = db.filter((row) => filters.every(([key, condition]) => matches(valueAt(row, key), condition)))
    if (method === 'PATCH') for (const row of hits) Object.assign(row, body)
    else if (method !== 'GET') throw new Error(`abandonment-check stub: unhandled ${method} on submissions`)
    return json(200, hits)
  }

  if (url.origin === GHL_ORIGIN) {
    const contact = url.pathname.match(/^\/contacts\/([^/]+)$/)
    if (method === 'GET' && contact) {
      const id = decodeURIComponent(contact[1])
      contactReads.push(id)
      const held = contactBook[id]
      if (held === 'down') return json(503, { message: 'abandonment-check stub: contact read refused' })
      const customFields = held?.bookedOn ? [{ id: FIELD.bookingCompletionDate, value: held.bookedOn }] : []
      return json(200, { contact: { id, tags: held?.tags ?? [], customFields } })
    }
    const workflow = url.pathname.match(/^\/contacts\/([^/]+)\/workflow\/([^/]+)$/)
    if (method === 'POST' && workflow) {
      fired.push(`${decodeURIComponent(workflow[1])} ${decodeURIComponent(workflow[2])}`)
      return json(200, {})
    }
    throw new Error(`abandonment-check stub: unexpected GHL call ${method} ${url.pathname}`)
  }

  throw new Error(`abandonment-check: refused a request to ${url.origin} — nothing here may leave the machine`)
}

// Stays in place until the process exits: from here on, no request can leave the machine.
globalThis.fetch = stubFetch as typeof fetch
Object.assign(process.env, {
  GHL_PIT_TOKEN: 'stub-pit-not-a-token',
  GHL_LOCATION_ID: LOCATION,
  SUPABASE_URL: STUB_SUPABASE,
  SUPABASE_SECRET_KEY: 'sb_secret_stub',
})
delete process.env.ABANDONMENT_IDLE_MINUTES
delete process.env.ABANDONMENT_MAX_AGE_DAYS

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()
const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)
const booked = (bookedOn?: string, tag = 'appt booked') => ({ tags: ['quote calculated', 'fb', tag], bookedOn })

/** A row a visitor started on the form, begun 50 minutes ago and idle for 40, left at the quote step. */
const idleRow = (token: string, contactId: string, extra: Json = {}): Row => ({
  id: token, token, location_id: LOCATION, contact_id: contactId, email: 'nobody@example.com', step_reached: 3,
  status: 'in_progress', form_type: 'standard', form_data: { origin: 'webform' }, quote: null, pipeline_stage: null,
  abandonment_notified: false, created_at: minutesAgo(50), updated_at: minutesAgo(40), completed_at: null, ...extra,
})

console.log('\nThe abandonment sweep and a lead who has already booked')

contactBook = {
  'c-bot': booked(day(0)), // booked today, over WhatsApp
  'c-case': booked(day(0), 'Appt Booked'), // the tag's casing is not ours to rely on
  'c-evening': booked(day(1)), // booked yesterday: inside the day's grace
  'c-nodate': booked(undefined), // tagged before the date was written: read as booked
  'c-old': booked(day(10)), // booked ten days ago, enquiring again
  'c-down': 'down', // GHL refuses the read
}
const tokens = ['bot', 'case', 'evening', 'nodate', 'old', 'fresh', 'down']
db = tokens.map((t) => idleRow(t, `c-${t}`))
const result = await sweepAbandoned()
const byToken = (token: string) => db.find((r) => r.token === token)!
record(
  'a contact tagged `appt booked` within a day of the row  ->  no workflow; an old booking and an untagged contact are chased',
  same([...fired].sort(), [`c-fresh ${LATE}`, `c-old ${LATE}`]) && result.notified === 2 && result.skipped === 4 && result.failed === 1,
  `${fired.join('; ') || 'nothing'} — ${show(result)}`,
)
record(
  'a booked row is marked and its status left alone, so it is not read again; a chased one is abandoned',
  ['bot', 'case', 'evening', 'nodate'].every((t) => byToken(t).abandonment_notified === true && byToken(t).status === 'in_progress') &&
    ['old', 'fresh'].every((t) => byToken(t).abandonment_notified === true && byToken(t).status === 'abandoned'),
  tokens.map((t) => `${t} ${byToken(t).status}/${byToken(t).abandonment_notified}`).join(', '),
)
record(
  'a contact that cannot be read  ->  not chased, not marked, left for the next run',
  byToken('down').abandonment_notified === false && byToken('down').status === 'in_progress' && !fired.some((line) => line.startsWith('c-down')),
  `down ${byToken('down').status}/${byToken('down').abandonment_notified}`,
)
record('the guard reads each swept contact once', same([...contactReads].sort(), tokens.map((t) => `c-${t}`).sort()), show(contactReads))

contactBook['c-down'] = booked(day(10)) // GHL answers again: an old booking, so it is chased
contactReads = []
fired = []
await sweepAbandoned()
record(
  'next run  ->  only the unread contact is asked about again, and chased once',
  same(contactReads, ['c-down']) && same(fired, [`c-down ${LATE}`]) && byToken('down').status === 'abandoned',
  `${show(contactReads)}; ${fired.join('; ') || 'nothing'}`,
)

console.log(`\n${checks - failures}/${checks} passed`)
if (failures > 0) {
  console.error(`\n${failures} abandonment case(s) would chase a booked lead, or lose an unbooked one.`)
  process.exit(1)
}
console.log('The sweep leaves a booked lead alone, chases an old booking, and retries a contact it could not read.\n')
