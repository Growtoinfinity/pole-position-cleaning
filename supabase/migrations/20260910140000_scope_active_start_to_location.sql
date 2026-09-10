-- Scope the one-active-start uniqueness to the location that owns the submission.
--
-- APPLIED to project wnbfqkvounnpvauigfrf on 2026-09-10. This file records what ran.
--
-- `submissions` is one table shared by every brand's webform, separated only by
-- `location_id`. This index was unique on (email, variant) with no location, so one
-- person with an untouched step-1 quote open at one brand collided with their own step-1
-- quote at another: the second insert failed 23505 and the route's recovery adopted the
-- FIRST brand's row, handing that customer the wrong resume token and writing the second
-- brand's answers against a contact in another GHL location.
--
-- `variant` stays in the key. It is traffic source (organic | google_ads), not tenant,
-- and one brand does split its funnel — dropping it would take that brand's per-variant
-- guarantee away and let its two funnels collide with each other.
--
-- Safe for every tenant already on the table: widening a uniqueness key can only ever
-- permit more rows, never reject one that was already valid. No row changes, no data
-- moves. Verified before applying: zero duplicates existed under the new key.
--
-- One transaction rather than CONCURRENTLY: at ~292 rows the lock is momentary, and this
-- way the table is never left without the constraint. On a large table, argue the other
-- way — build the replacement CONCURRENTLY first, then drop the old one.
--
-- Rollback is these two statements with the old key. No data migration either way.
--
-- NOTE: the two earlier files in this directory do not describe the live table. Neither
-- records the `variant` column (`text not null default 'organic'`), and both state this
-- index as unique on `email` alone. Read the live schema before trusting them.

drop index if exists submissions_one_active_start_idx;

create unique index submissions_one_active_start_idx
  on submissions (location_id, email, variant)
  where status = 'in_progress' and step_reached = 1 and email is not null;
