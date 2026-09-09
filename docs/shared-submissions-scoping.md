# The shared `submissions` table, and the scoping that is not there yet

**Status: parked, deliberately.** Nothing in this document is applied. The code in `api/`
is kept identical to the sibling deployments on purpose, so that when this is fixed it is
fixed once, for every brand, rather than one repo drifting ahead of the others.

Written up here rather than left as a migration file so it cannot be picked up by a
`supabase db push` before that decision is made.

---

## The shape

Every brand's webform writes to ONE table: `public.submissions` in Supabase project
`wnbfqkvounnpvauigfrf`. RLS is on with no public policies, so all access goes through the
service-role key, server-side only.

Measured 2026-09-10:

| location_id | rows | in progress | completed | abandoned |
|---|---|---|---|---|
| `zfgtbqDWRUrkaHTmvrO7` | 212 | 5 | 96 | 111 |
| `g33Zu2XHv885wDNtYvZC` | 80 | 1 | 24 | 55 |
| `A9cGvKBunXk003dXUmSV` (this one) | 0 | — | — | — |

`location_id` is `not null` and is set on every insert. It is the only thing separating
tenants.

`variant` is **not** a tenant key — it is traffic source, `not null default 'organic'`,
and only `zfgtbqDWRUrkaHTmvrO7` uses more than one value (`organic` + `google_ads`). This
form never sets it, so every row it writes is `organic`.

## The two migration files in this repo do not describe this table

Neither records the `variant` column, and both state the active-start index as unique on
`email` alone. The live index is:

```sql
CREATE UNIQUE INDEX submissions_one_active_start_idx
  ON submissions (email, variant)
  WHERE status = 'in_progress' AND step_reached = 1 AND email IS NOT NULL;
```

Read the live schema before trusting `supabase/migrations/`.

## What is unscoped

`location_id` is written on insert and never read. Three paths select without it, in this
repo and in the siblings alike:

| Read | Filters on |
|---|---|
| `api/abandonment.ts` — the 15-minute sweep | status, notified flag, idle window |
| `api/submission.ts` — burst dedupe | email, status, step |
| `api/submission.ts` — 23505 adopt | email, status, step |

Lookups by `token` are fine as they stand: a token is a random uuid and is therefore its
own capability. Everything else is not.

### What the sweep actually does with another brand's row

`notifyAbandonment` takes only a `contactId` and fires *this deployment's* workflow id
with *this deployment's* PIT. So the outcome depends on the token's scope:

- **Location-scoped PIT** (the normal case): the trigger fails, `result.failed` climbs and
  the row is deliberately not marked — so it is re-scanned every 15 minutes until it ages
  out. Wasted calls and batch slots (limit 50, oldest first), no wrong messages.
- **Agency-scoped PIT**: the trigger succeeds. Another brand's customer receives this
  brand's abandonment message, and the row *is* marked `abandoned` + `notified`, so the
  brand that owns the lead never chases it.

Which one applies has not been established, and establishing it means probing another
client's contacts, which is not something to do casually.

Whether it has already happened cannot be told from the data: both sweeps mark rows the
same way, so there is no fingerprint distinguishing "chased its own lead" from "chased
someone else's".

### The collision the index allows

Because the unique index carries no `location_id`, one person with an untouched step-1
quote open at one brand collides with their own step-1 quote at another. The second
insert fails `23505`, and the adopt path — also unscoped — returns the first brand's row.
The customer gets that brand's resume token, and `pushToCrm` writes this brand's answers
against a `contact_id` living in a different GHL location.

How likely: of 248 distinct emails in the table, **1** already appears under two brands.
The covered state (`in_progress` at `step_reached = 1`) is transient, and held 0 rows when
measured. Rare, not theoretical.

Note that the ordinary double-click — the case the index was written for — is already
handled client-side: `ContactStep.tsx` disables the submit button and shows "Sending…" for
the whole round trip. The index earns its keep against the paths that never touch a
button: a script posting straight at `/api/submission`, two tabs, or a client-side retry
after a timeout.

## The fix, when it is time

Two halves, and the first is not much use without the second.

**1. Scope the three reads.** Add `.eq('location_id', ghlLocationId())` to each. On its
own this converts silent cross-brand adoption into a loud failure — better, but a customer
whose email is in flight at another brand still cannot start a quote.

**2. Widen the index.** This is what actually removes the collision:

```sql
DROP INDEX IF EXISTS submissions_one_active_start_idx;

CREATE UNIQUE INDEX submissions_one_active_start_idx
  ON submissions (location_id, email, variant)
  WHERE status = 'in_progress' AND step_reached = 1 AND email IS NOT NULL;
```

Same name, same predicate, one extra column at the front.

**Why it is safe for the brands already on the table.** Widening a uniqueness key can only
ever permit more rows; it can never reject one that is already valid. No row changes, no
data moves. Each brand keeps exactly the guarantee the index was written for — one active
step-1 submission per email per variant — now held per brand instead of globally, which is
what the code already assumes.

`variant` stays in the key. It is inert for this brand, but `zfgtbqDWRUrkaHTmvrO7` splits
its funnel and would otherwise see `organic` and `google_ads` start colliding with each
other.

Done in one transaction rather than `CONCURRENTLY`: at ~292 rows the lock is momentary,
and the table is never left without the constraint. On a large table, argue the opposite.

**Rollback** is the same two statements with the old key. No data migration either way.

## Ordering

The index change is shared: it affects every brand on the table, so it wants doing once,
with the sibling deployments picking up the read scoping in the same window. A repo that
adds the filters alone starts failing inserts that used to succeed — which is why this one
does not.
