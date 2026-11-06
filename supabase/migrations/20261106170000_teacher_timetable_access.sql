-- Allow authenticated administrators with the existing MFA-gated helper to manage learner timetables.
-- is_studyspace_admin() already checks active admin role and aal2 assurance.
drop policy if exists mia_timetable_admin_manage on public.student_timetable_entries;
create policy mia_timetable_admin_manage
  on public.student_timetable_entries
  for all
  to authenticated
  using ((select public.is_studyspace_admin()))
  with check ((select public.is_studyspace_admin()));

-- Timetable data is private to signed-in learners and MFA-verified administrators.
revoke all on table public.student_timetable_entries from anon;
grant select, insert, update, delete on table public.student_timetable_entries to authenticated;
