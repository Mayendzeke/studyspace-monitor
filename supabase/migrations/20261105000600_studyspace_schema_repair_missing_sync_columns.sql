-- Forward-only repair for production schema gaps found during verification.
-- Safe to apply more than once; existing rows and values are preserved.

alter table public.student_subjects
  add column if not exists period_ids jsonb not null default '[]'::jsonb;

alter table public.exercise_assignments
  add column if not exists available_at timestamptz not null default now();

-- Replace stale learner-read policies left by the earlier security migration.
-- PostgreSQL permissive policies are ORed, so both the old and new names must
-- be removed to ensure scheduled assessments remain hidden until release.
alter table public.exercise_sets enable row level security;
alter table public.exercise_questions enable row level security;
alter table public.exercise_answer_keys enable row level security;
alter table public.exercise_assignments enable row level security;
alter table public.learning_resources enable row level security;
alter table public.resource_assignments enable row level security;

drop policy if exists "exercise_sets_assigned_read" on public.exercise_sets;
drop policy if exists "exercise_sets_assigned_active_learner_read" on public.exercise_sets;
drop policy if exists "exercise_questions_assigned_read" on public.exercise_questions;
drop policy if exists "exercise_questions_assigned_active_learner_read" on public.exercise_questions;
drop policy if exists "exercise_assignments_learner_read" on public.exercise_assignments;
drop policy if exists "exercise_assignments_active_learner_read" on public.exercise_assignments;

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

drop policy if exists "resources_admin_manage" on public.learning_resources;
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

create policy "exercise_assignments_learner_read"
  on public.exercise_assignments for select to authenticated
  using (
    learner_id = auth.uid()
    and public.is_active_studyspace_learner()
    and available_at <= now()
  );

-- Authenticated administrators need table privileges for Content Studio.
-- RLS above keeps answer keys exclusively accessible to AAL2 administrators.
revoke all on public.exercise_answer_keys from anon;
grant select, insert, update, delete on public.exercise_answer_keys to authenticated;

grant select, insert, update, delete on public.exercise_sets,
  public.exercise_questions, public.exercise_assignments,
  public.learning_resources, public.resource_assignments to authenticated;

create index if not exists exercise_assignments_learner_available_at
  on public.exercise_assignments(learner_id, available_at);
