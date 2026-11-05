-- Teacher marking workflow for written assessment responses.
alter table public.exercise_attempts
  add column if not exists manual_marks jsonb not null default '{}'::jsonb,
  add column if not exists teacher_feedback text not null default '',
  add column if not exists marked_by uuid references public.profiles(id),
  add column if not exists marked_at timestamptz;

-- Students may read only their own saved attempts. They must never be able to
-- change score, total_points, manual marks or teacher feedback directly.
drop policy if exists "attempts_learner_manage" on public.exercise_attempts;
drop policy if exists "attempts_admin_read" on public.exercise_attempts;
drop policy if exists "attempts_learner_read" on public.exercise_attempts;
drop policy if exists "attempts_admin_manage" on public.exercise_attempts;

create policy "attempts_learner_read"
  on public.exercise_attempts for select to authenticated
  using (learner_id = auth.uid() and public.is_active_studyspace_learner());

create policy "attempts_admin_manage"
  on public.exercise_attempts for all to authenticated
  using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());

revoke insert, delete on public.exercise_attempts from anon, authenticated;
revoke update on public.exercise_attempts from anon;
grant select, update on public.exercise_attempts to authenticated;

create index if not exists exercise_attempts_marking_queue
  on public.exercise_attempts(marked_at, submitted_at desc);
