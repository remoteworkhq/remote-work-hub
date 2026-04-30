alter table sessions
  add column if not exists last_response_at timestamptz;

notify pgrst, 'reload schema';
