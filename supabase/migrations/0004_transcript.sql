alter table sessions
  add column if not exists transcript jsonb;

notify pgrst, 'reload schema';
