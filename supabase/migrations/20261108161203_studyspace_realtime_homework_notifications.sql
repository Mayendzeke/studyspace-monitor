do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'exercise_assignments'
  ) then
    alter publication supabase_realtime add table public.exercise_assignments;
  end if;
end
$$;
