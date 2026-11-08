-- Publish the tables used for learner assessment-result and timetable alerts.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='student_timetable_entries'
  ) then
    alter publication supabase_realtime add table public.student_timetable_entries;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='exercise_attempts'
  ) then
    alter publication supabase_realtime add table public.exercise_attempts;
  end if;
end $$;
