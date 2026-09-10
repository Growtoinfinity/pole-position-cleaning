# Scoping the shared `submissions` table to one brand

**Runbook. The database half is already done — do not repeat it. The code half must be
applied to every webform repo separately.**

---

## The situation

Every brand's webform writes to ONE table: `public.submissions` in Supabase project
`wnbfqkvounnpvauigfrf`. RLS is on with no public policies, so all access goes through the
service-role key, server-side only.

`location_id` (`not null`, the GHL location id) is the **only** thing separating tenants.

As measured 2026-09-10:

| location_id | brand | rows |
|---|---|---|
| `zfgtbqDWRUrkaHTmvrO7` | Kings | 212 |
| `g33Zu2XHv885wDNtYvZC` | Greenmaster | 80 |
| `A9cGvKBunXk003dXUmSV` | We Wash Everything | 0 |

`variant` is **not** a tenant key — it is traffic source (`organic` | `google_ads`),
`not null default 'organic'`. Only Kings uses more than one value.

## The bug

`location_id` was written on insert and then never read. Three queries found rows by
something another brand's customer could also match:

1. **The abandonment sweep** — no identifying key at all. It asks "who has gone quiet?"
   and the answer spanned every brand.
2. **The burst-dedupe lookup** — keyed on `email`, which is not unique across brands.
3. **The 23505 adopt** — same.

Plus the unique index `submissions_one_active_start_idx` was on `(email, variant)` with
no location, so the collision those two lookups then mishandled was *guaranteed* rather
than merely possible.

Everything else — six of the ten queries — is keyed on `token`, a `gen_random_uuid()`.
A uuid is unguessable, so holding one is the authorisation and it can only ever match one
row. **Those six need no change.** Adding `location_id` to them is harmless but pointless.

### What it actually caused

- **Wrong-brand adoption.** One person with an untouched step-1 quote open at two brands:
  the second insert fails `23505`, the recovery adopts the *first* brand's row, and that
  customer gets the wrong resume token while the second brand's answers are written
  against a contact in a different GHL location.
- **Cross-brand abandonment chasing.** The sweep fires *this* deployment's workflow ids at
  *another* brand's contact ids using *this* deployment's PIT. If that token is
  location-scoped the trigger simply fails and the row is re-scanned every 15 minutes
  forever, burning batch slots (limit 50, oldest first). If it is agency-scoped the
  trigger succeeds — the other brand's customer receives your message, and the row is
  marked notified so the brand that owns the lead never chases it.

Rarity, for calibration: of 248 distinct emails in the table, 1 already appeared under two
brands. The vulnerable state (`in_progress` at `step_reached = 1`) is transient and held 0
rows when measured. Rare — not theoretical.

---

## Part 1 — the database. DONE. Do not repeat.

Applied to `wnbfqkvounnpvauigfrf` on 2026-09-10 as migration
`scope_active_start_to_location`:

```sql
drop index if exists submissions_one_active_start_idx;

create unique index submissions_one_active_start_idx
  on submissions (location_id, email, variant)
  where status = 'in_progress' and step_reached = 1 and email is not null;
```

Same name, same predicate, one extra column at the front of the key.

**This is a shared table — one application covers every brand.** Running it again is
harmless but unnecessary. Confirm it is in place with:

```sql
select indexdef from pg_indexes
where tablename = 'submissions' and indexname = 'submissions_one_active_start_idx';
```

You want to see `btree (location_id, email, variant)`.

**Why it was safe:** widening a uniqueness key can only ever permit more rows — it can
never reject one that was already valid. No row changed and no data moved. Each brand
keeps exactly the guarantee the index was written for (one active step-1 submission per
email per variant), now held per brand rather than globally, which is what the code always
assumed.

`variant` stays in the key because Kings splits its funnel; dropping it would let Kings'
`organic` and `google_ads` starts collide with each other.

**Rollback** is the same two statements with `(email, variant)`.

---

## Part 2 — the code. Apply to EVERY webform repo.

Three one-line changes, all in `api/`. Each adds `.eq('location_id', ghlLocationId())`.

### 2.1 `api/abandonment.ts` — the sweep

Add the filter as the first condition on the select:

```ts
const { data, error } = await supabase
  .from(SUBMISSIONS_TABLE)
  .select('*')
  .eq('location_id', ghlLocationId())   // <-- add
  .eq('status', 'in_progress')
  .eq('abandonment_notified', false)
  .not('contact_id', 'is', null)
  .lte('updated_at', idleBefore)
  .gte('updated_at', notOlderThan)
  .order('updated_at', { ascending: true })
  .limit(BATCH_LIMIT)
```

`ghlLocationId` also has to be added to the import from `./_lib/supabaseServer.js` — it is
usually not imported in this file yet:

```ts
import {
  getSupabaseAdmin,
  ghlLocationId,          // <-- add
  isSupabaseConfigured,
  SUBMISSIONS_TABLE,
  type SubmissionRow,
} from './_lib/supabaseServer.js'
```

**This is the highest-value of the three** — it is the only query with no identifying key
of its own, and the only one that reaches out and messages people.

### 2.2 `api/submission.ts` — the burst-dedupe lookup

In the `start` path, the "did someone just double-post?" read:

```ts
const { data: recent } = await supabase
  .from(SUBMISSIONS_TABLE)
  .select('*')
  .eq('location_id', ghlLocationId())   // <-- add
  .eq('email', email)
  .eq('status', 'in_progress')
  .eq('step_reached', 1)
  .gte('created_at', since)
  .order('created_at', { ascending: true })
  .limit(1)
```

### 2.3 `api/submission.ts` — the 23505 adopt

The recovery after a unique-violation:

```ts
const { data: winner } = await supabase
  .from(SUBMISSIONS_TABLE)
  .select('*')
  .eq('location_id', ghlLocationId())   // <-- add
  .eq('email', email)
  .eq('status', 'in_progress')
  .eq('step_reached', 1)
  .order('created_at', { ascending: true })
  .limit(1)
  .maybeSingle()
```

`ghlLocationId` is normally already imported in `submission.ts` — check before adding it.

### Leave alone

Do **not** add the filter to the `token`-keyed queries (`loadRow`, `applyStep`,
`rememberContactId`, `recordPipelineStage`, and the sweep's mark-as-notified update). They
are already single-tenant by construction, and touching them is churn.

The two `.insert()` calls already write `location_id`. Leave them.

---

## Ordering, and why it matters

**The database half must be in place before the code half goes live.**

Scoping the adopt query while the index is still global turns a cross-brand collision from
"adopts the wrong row" into "insert fails, finds no winner, throws" — the customer cannot
start a quote at all. Louder, but still broken.

Since Part 1 is already applied to the shared database, this ordering constraint is
satisfied for every repo. The code changes can now go out independently, at whatever pace
suits each deployment.

---

## Verifying a repo is done

From the repo root — this should list every query and flag any that is neither
token-keyed nor location-scoped:

```bash
node -e '
const fs=require("fs");
for(const f of ["api/submission.ts","api/abandonment.ts","api/prefill.ts"]){
  const lines=fs.readFileSync(f,"utf8").split(/\r?\n/);
  lines.forEach((l,i)=>{
    if(!l.includes(".from(SUBMISSIONS_TABLE)")) return;
    const c=lines.slice(i,i+12);
    const op=c.find(x=>/\.(select|insert|update)\(/.test(x))||"";
    const kind=op.includes(".insert(")?"INSERT":op.includes(".update(")?"UPDATE":"SELECT";
    const fl=c.filter(x=>/\.(eq|not|lte|gte)\(/.test(x)).map(x=>x.trim().replace(/^\./,""));
    const tok=fl.some(x=>x.startsWith("eq(\x27token\x27"));
    const loc=fl.some(x=>x.startsWith("eq(\x27location_id\x27"));
    const v=kind==="INSERT"?"writes location_id":tok?"token-keyed":loc?"location-scoped":"*** UNSCOPED ***";
    console.log((f+":"+(i+1)).padEnd(26), kind.padEnd(7), v);
  });
}'
```

A finished repo shows no `*** UNSCOPED ***`. Then `npx tsc -p tsconfig.api.json` to catch a
missing `ghlLocationId` import.

## A caveat that is not fixed by any of this

`ghlLocationId()` reads `GHL_LOCATION_ID` from the environment and returns `''` when it is
unset. A deployment missing that variable will filter on `location_id = ''`, match nothing,
and quietly do nothing at all — the sweep will report `scanned 0` forever.

That is the safe direction to fail, but it is silent. `isGhlLocationConfigured()` exists
for this; consider having the sweep refuse loudly rather than sweep an empty set.
