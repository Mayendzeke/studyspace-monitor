-- Studyspace security hardening migration
-- Apply after 20261104000100_studyspace_core.sql.

-- Learner clients may read their own attempts, but scores must be calculated by
-- a trusted server function. Do not accept client-submitted marks as authoritative.
drop policy if exists "attempts_learner_manage" on public.exercise_attempts;
create policy "attempts_learner_read_own" on public.exercise_attempts
  for select to authenticated using (learner_id = auth.uid());
create policy "attempts_admin_read_all" on public.exercise_attempts
  for select to authenticated using (public.is_studyspace_admin());
revoke insert, update, delete on public.exercise_attempts from authenticated;

-- Audit events are written by trusted functions using the service role or
-- tightly scoped database functions, never by arbitrary browser clients.
drop policy if exists "audit_actor_insert" on public.audit_events;
revoke insert, update, delete on public.audit_events from authenticated;

-- Private resource bucket access: admins manage objects; learners read only
-- objects assigned to their own account.
drop policy if exists "studyspace_resources_admin_all" on storage.objects;
create policy "studyspace_resources_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'studyspace-resources' and public.is_studyspace_admin())
  with check (bucket_id = 'studyspace-resources' and public.is_studyspace_admin());

drop policy if exists "studyspace_resources_assigned_read" on storage.objects;
create policy "studyspace_resources_assigned_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'studyspace-resources'
    and public.is_active_studyspace_learner()
    and exists (
      select 1
      from public.learning_resources lr
      join public.resource_assignments ra on ra.resource_id = lr.id
      where lr.storage_path = storage.objects.name
        and ra.learner_id = auth.uid()
    )
  );

-- Prevent authenticated clients from changing privileged profile fields.
-- Profile edits that are allowed to learners should be exposed through a
-- dedicated column-limited RPC, not a broad UPDATE policy.

-- Keep administrator profiles from being disabled by a learner-facing flow.
create or replace function public.guard_studyspace_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.account_status is distinct from old.account_status)
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_studyspace_admin() then
    raise exception 'Only an active administrator may change account role or status';
  end if;
  return new;
end;
$$;

drop trigger if exists studyspace_profile_privilege_guard on public.profiles;
create trigger studyspace_profile_privilege_guard
before update on public.profiles
for each row execute procedure public.guard_studyspace_profile_privileges();

create index if not exists idx_profiles_role_status on public.profiles(role, account_status);
create index if not exists idx_resources_subject_level on public.learning_resources(subject_name, education_level);
create index if not exists idx_exercise_sets_subject on public.exercise_sets(subject_name, education_level);
create index if not exists idx_assignments_due on public.exercise_assignments(learner_id, due_at);


-- Enforce account status at the data layer as well as in Supabase Auth.
-- A banned learner's already-issued JWT must not continue reading planner data.
create or replace function public.is_active_studyspace_learner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'learner' and account_status = 'active'
  );
$$;

drop policy if exists "subjects_owner_or_admin" on public.student_subjects;
create policy "subjects_active_learner_or_admin" on public.student_subjects for all to authenticated
using ((learner_id = auth.uid() and public.is_active_studyspace_learner()) or public.is_studyspace_admin())
with check ((learner_id = auth.uid() and public.is_active_studyspace_learner()) or public.is_studyspace_admin());

drop policy if exists "tasks_owner_or_admin" on public.planner_tasks;
create policy "tasks_active_learner_or_admin" on public.planner_tasks for all to authenticated
using ((learner_id = auth.uid() and public.is_active_studyspace_learner()) or public.is_studyspace_admin())
with check ((learner_id = auth.uid() and public.is_active_studyspace_learner()) or public.is_studyspace_admin());

drop policy if exists "sessions_owner_or_admin" on public.study_sessions;
create policy "sessions_active_learner_or_admin" on public.study_sessions for all to authenticated
using ((learner_id = auth.uid() and public.is_active_studyspace_learner()) or public.is_studyspace_admin())
with check ((learner_id = auth.uid() and public.is_active_studyspace_learner()) or public.is_studyspace_admin());

drop policy if exists "resources_assigned_read" on public.learning_resources;
create policy "resources_assigned_active_learner_read" on public.learning_resources for select to authenticated
using (public.is_active_studyspace_learner() and exists (
  select 1 from public.resource_assignments ra
  where ra.resource_id = learning_resources.id and ra.learner_id = auth.uid()
));

drop policy if exists "resource_assignments_learner_read" on public.resource_assignments;
create policy "resource_assignments_active_learner_read" on public.resource_assignments for select to authenticated
using (learner_id = auth.uid() and public.is_active_studyspace_learner());

drop policy if exists "exercise_sets_assigned_read" on public.exercise_sets;
create policy "exercise_sets_assigned_active_learner_read" on public.exercise_sets for select to authenticated
using (is_published and public.is_active_studyspace_learner() and exists (
  select 1 from public.exercise_assignments ea
  where ea.exercise_set_id = exercise_sets.id and ea.learner_id = auth.uid()
));

drop policy if exists "exercise_questions_assigned_read" on public.exercise_questions;
create policy "exercise_questions_assigned_active_learner_read" on public.exercise_questions for select to authenticated
using (public.is_active_studyspace_learner() and exists (
  select 1 from public.exercise_assignments ea
  join public.exercise_sets es on es.id = ea.exercise_set_id
  where es.id = exercise_questions.exercise_set_id and ea.learner_id = auth.uid() and es.is_published
));

drop policy if exists "exercise_assignments_learner_read" on public.exercise_assignments;
create policy "exercise_assignments_active_learner_read" on public.exercise_assignments for select to authenticated
using (learner_id = auth.uid() and public.is_active_studyspace_learner());

drop policy if exists "attempts_learner_read_own" on public.exercise_attempts;
create policy "attempts_active_learner_read_own" on public.exercise_attempts for select to authenticated
using (learner_id = auth.uid() and public.is_active_studyspace_learner());
