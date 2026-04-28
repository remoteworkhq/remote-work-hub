-- Remote Work Hub: initial schema
-- Projects (registry of apps connected to the hub) + sessions (agent run history)

create extension if not exists "uuid-ossp";

create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  description text,
  github_repo text,
  vercel_project_id text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  status text not null default 'pending',
  prompt text,
  sandbox_id text,
  cost_usd numeric(10,4),
  duration_seconds integer,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists sessions_project_id_idx on sessions(project_id);
create index if not exists sessions_started_at_idx on sessions(started_at desc);

alter table projects enable row level security;
alter table sessions enable row level security;

-- Single-user mode: authenticated users see everything.
-- Tighten with per-user ownership once multi-user is needed.
create policy "auth read projects" on projects for select to authenticated using (true);
create policy "auth write projects" on projects for all to authenticated using (true) with check (true);
create policy "auth read sessions" on sessions for select to authenticated using (true);
create policy "auth write sessions" on sessions for all to authenticated using (true) with check (true);
