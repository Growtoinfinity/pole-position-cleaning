-- Submission-tracking layer behind the v3 quote form.
-- Applied to the `webforms-v3` project (ref wnbfqkvounnpvauigfrf) on 2026-08-18.

create table submissions (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid() unique,
  location_id text not null,
  contact_id text,
  email text,
  step_reached int default 1,
  status text default 'in_progress',       -- in_progress | abandoned | completed
  form_type text,                           -- 'standard' | 'commercial' | 'large_unusual'
  form_data jsonb default '{}',
  quote jsonb,
  pipeline_stage text,
  abandonment_notified boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

-- RLS on with no public policies: all access goes through the service_role key, server-side only
alter table submissions enable row level security;

-- Resume (?token=) and the abandonment sweep are the two hot lookups
create index submissions_token_idx on submissions (token);
create index submissions_status_updated_idx on submissions (status, updated_at);
create index submissions_email_idx on submissions (email);
