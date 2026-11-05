-- Cloud-backed Monitor Content Studio: review workflow and resource metadata.
alter table public.exercise_assignments
  add column if not exists available_at timestamptz not null default now();

alter table public.exercise_sets
  add column if not exists review_status text not null default 'draft'
    check (review_status in ('draft','review','approved')),
  add column if not exists duration_minutes integer not null default 30
    check (duration_minutes between 1 and 300),
  add column if not exists due_date date;

alter table public.exercise_questions
  add column if not exists topic text not null default '',
  add column if not exists difficulty text not null default 'Standard'
    check (difficulty in ('Foundation','Standard','Advanced'));

alter table public.learning_resources
  add column if not exists topic text not null default '',
  add column if not exists resource_type text not null default 'Notes';

create index if not exists exercise_sets_author_status
  on public.exercise_sets(created_by, review_status, updated_at desc);
create index if not exists learning_resources_subject_date
  on public.learning_resources(subject_name, created_at desc);

-- Only an active AAL2 administrator may write or publish the content.
drop policy if exists "exercise_sets_admin_manage" on public.exercise_sets;
create policy "exercise_sets_admin_manage"
  on public.exercise_sets for all to authenticated
  using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());

drop policy if exists "exercise_questions_admin_manage" on public.exercise_questions;
create policy "exercise_questions_admin_manage"
  on public.exercise_questions for all to authenticated
  using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());

drop policy if exists "exercise_answer_keys_admin_only" on public.exercise_answer_keys;
create policy "exercise_answer_keys_admin_only"
  on public.exercise_answer_keys for all to authenticated
  using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());

drop policy if exists "learning_resources_admin_manage" on public.learning_resources;
create policy "learning_resources_admin_manage"
  on public.learning_resources for all to authenticated
  using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());

drop policy if exists "resource_assignments_admin_manage" on public.resource_assignments;
create policy "resource_assignments_admin_manage"
  on public.resource_assignments for all to authenticated
  using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());

drop policy if exists "exercise_assignments_admin_manage" on public.exercise_assignments;
create policy "exercise_assignments_admin_manage"
  on public.exercise_assignments for all to authenticated
  using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());

-- Learners can see only published assignments and associated questions.
drop policy if exists "exercise_sets_assigned_read" on public.exercise_sets;
create policy "exercise_sets_assigned_read"
  on public.exercise_sets for select to authenticated
  using (
    is_published
    and public.is_active_studyspace_learner()
    and exists (
      select 1 from public.exercise_assignments ea
      where ea.exercise_set_id = exercise_sets.id
        and ea.learner_id = auth.uid()
        and ea.available_at <= now()
    )
  );

drop policy if exists "exercise_questions_assigned_read" on public.exercise_questions;
create policy "exercise_questions_assigned_read"
  on public.exercise_questions for select to authenticated
  using (
    public.is_active_studyspace_learner()
    and exists (
      select 1 from public.exercise_assignments ea
      join public.exercise_sets es on es.id = ea.exercise_set_id
      where es.id = exercise_questions.exercise_set_id
        and ea.learner_id = auth.uid()
        and ea.available_at <= now()
        and es.is_published
    )
  );

drop policy if exists "exercise_assignments_learner_read" on public.exercise_assignments;
create policy "exercise_assignments_learner_read"
  on public.exercise_assignments for select to authenticated
  using (learner_id = auth.uid() and public.is_active_studyspace_learner() and available_at <= now());

-- Answer keys remain administrator-only. Students submit answers to a
-- trusted Edge Function, which calculates marks without exposing answer keys.
revoke all on public.exercise_answer_keys from anon, authenticated;
grant select, insert, update, delete on public.exercise_sets,
  public.exercise_questions, public.exercise_assignments,
  public.exercise_answer_keys, public.learning_resources,
  public.resource_assignments to authenticated;
