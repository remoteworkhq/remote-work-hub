-- Sessions v2: persistent multi-project session tracking
-- Apply in Supabase SQL Editor.

alter table sessions
  add column if not exists project_slug text,
  add column if not exists thread_id text,
  add column if not exists last_active_at timestamptz not null default now(),
  add column if not exists repo text;

-- Drop the not-null FK so we can insert without a projects row.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'sessions' and column_name = 'project_id' and is_nullable = 'NO'
  ) then
    alter table sessions alter column project_id drop not null;
  end if;
end $$;

-- One live sandbox per slug (idempotent spawn).
create unique index if not exists sessions_one_active_per_slug
  on sessions (project_slug)
  where status = 'ready';

create index if not exists sessions_status_idx on sessions (status);
create index if not exists sessions_last_active_idx on sessions (last_active_at desc);

-- Reset RLS to server-only (service_role writes; deny everything else).
-- Hub backend uses the service-role key; no direct browser access.
drop policy if exists "auth read sessions" on sessions;
drop policy if exists "auth write sessions" on sessions;
drop policy if exists "auth read projects" on projects;
drop policy if exists "auth write projects" on projects;

-- Keep RLS enabled but with no policies = nobody but service_role can touch.
alter table sessions enable row level security;
alter table projects enable row level security;
