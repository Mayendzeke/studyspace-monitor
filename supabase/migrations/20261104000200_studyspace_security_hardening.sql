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
