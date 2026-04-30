create table if not exists project_logs (
  id uuid primary key default gen_random_uuid(),
  project_slug text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_logs_slug_idx
  on project_logs (project_slug, created_at desc);

alter table project_logs enable row level security;

notify pgrst, 'reload schema';
