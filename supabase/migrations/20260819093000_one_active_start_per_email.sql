-- One in-flight submission per email, enforced by the database rather than by a read.
--
-- A rapid double-click, or a script posting straight at /api/submission, sends several
-- `start` calls at once. Checking for an existing row first cannot stop that: every
-- request selects before any of them inserts, so they all find nothing and all insert.
-- Measured on the sibling deployment, ten simultaneous posts produced ten rows; adding
-- the read-first check only brought it to five. A unique index is the only thing that
-- actually serialises them — one insert commits, the rest fail with 23505, and the route
-- adopts the winning row and hands back its token.
--
-- Scoped deliberately:
--   status = 'in_progress'  — an abandoned or completed row no longer blocks a new quote
--   step_reached = 1        — once someone moves past the contact step they are free to
--                             start a second submission later
-- so the only thing this forbids is the same person having two untouched step-1 rows at
-- once, which is never a real session and always a duplicate.

create unique index submissions_one_active_start_idx
  on submissions (email)
  where status = 'in_progress' and step_reached = 1 and email is not null;
