-- Keep timetable access on one permissive policy while allowing learner ownership
-- and MFA-verified StudySpace administrators.
drop policy if exists mia_timetable_owner_manage on public.student_timetable_entries;
drop policy if exists mia_timetable_admin_manage on public.student_timetable_entries;

create policy mia_timetable_owner_or_admin_manage
  on public.student_timetable_entries
  for all
  to authenticated
  using (
    (
      learner_id = (select auth.uid())
      and (select public.is_active_studyspace_learner())
    )
    or (select public.is_studyspace_admin())
  )
  with check (
    (
      learner_id = (select auth.uid())
      and (select public.is_active_studyspace_learner())
    )
    or (select public.is_studyspace_admin())
  );

create index if not exists student_timetable_learner_kind_day_starts_idx
  on public.student_timetable_entries (learner_id, timetable_kind, day_of_week, starts_at);
