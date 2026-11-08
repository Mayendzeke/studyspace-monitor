-- Keep the student timetable current when its teacher adds or removes a learner.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'teacher_timetable_members'
  ) then
    alter publication supabase_realtime add table public.teacher_timetable_members;
  end if;
end $$;
