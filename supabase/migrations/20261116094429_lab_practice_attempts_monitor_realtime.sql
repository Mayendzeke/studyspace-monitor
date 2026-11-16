-- Publish learner-owned formative Lab attempts for MFA-protected Monitor refresh.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lab_practice_attempts'
  ) then
    alter publication supabase_realtime add table public.lab_practice_attempts;
  end if;
end
$$;
