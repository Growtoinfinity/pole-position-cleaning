-- Scope the one-active-start uniqueness to the location that owns the submission.
--
-- WHY THIS IS NEEDED
--
-- `submissions` is ONE table shared by every brand's webform, separated only by
-- `location_id`. As of 2026-09-10 it holds two live tenants — 212 rows under
-- zfgtbqDWRUrkaHTmvrO7 and 80 under g33Zu2XHv885wDNtYvZC — and We Wash Everything
-- (A9cGvKBunXk003dXUmSV) is about to become the third.
--
-- `submissions_one_active_start_idx` is unique on (email, variant) and carries no
-- `location_id`. So one person who has an untouched step-1 quote open with one brand and
-- then starts one with another collides: the second insert fails 23505, and the route's
-- recovery path adopts "the row that beat us" — which is the OTHER brand's row. That
-- hands the customer someone else's resume token and pushes this brand's answers onto a
-- contact living in a different GHL location.
--
-- The application-side fix (scoping every read by `location_id`) closes the corruption
-- but cannot close the collision: while this index stands, the second brand simply
-- cannot insert. Only widening the key does that.
--
-- DRIFT NOTE. The live table also carries `variant text not null default 'organic'`,
-- which distinguishes traffic source — not tenant; zfgtbqDWRUrkaHTmvrO7 has both
-- 'organic' and 'google_ads' rows. No migration in this repo records that column or the
-- (email, variant) index, so the two earlier files under this directory do not describe
-- the database as it actually is. This one is written against what is really there.
--
-- `variant` is kept in the key even though it is inert for this brand: We Wash Everything
-- runs a single variant, so every row it writes takes the 'organic' default and the term
-- never discriminates anything here. It stays because dropping it would silently take a
-- guarantee away from the brand that DOES split traffic — zfgtbqDWRUrkaHTmvrO7 would go
-- from one active start per email per variant to one per email, and its google_ads and
-- organic funnels would start colliding with each other. This index is shared; it has to
-- be right for every tenant on it, not just the one prompting the change.
--
-- WHY IT IS SAFE FOR THE OTHER TENANTS
--
-- Widening a uniqueness key can only ever permit more rows; it can never reject a row
-- that was already valid. Every existing row keeps its meaning, and each brand goes on
-- getting exactly one active step-1 submission per email per variant — the guarantee the
-- original index was written for, now actually held per brand instead of globally.
--
-- Done in one transaction rather than CONCURRENTLY on purpose: the table is ~292 rows,
-- so the lock is momentary, and this way the table is never left without the constraint.

begin;

drop index if exists submissions_one_active_start_idx;

create unique index submissions_one_active_start_idx
  on submissions (location_id, email, variant)
  where status = 'in_progress' and step_reached = 1 and email is not null;

commit;
