-- Cross-device student planner sync and private personal resource storage.
-- Applied after the Studyspace classroom foundation migration.

-- Add the metadata required for safe two-way synchronisation.
alter table public.student_subjects
  add column if not exists color text not null default '#8db9ff',
  add column if not exists description text not null default '',
  add column if not exists target_mark integer,
  add column if not exists updated_at timestamptz not null default now();

alter table public.planner_tasks
  add column if not exists updated_at timestamptz not null default now();

alter table public.study_sessions
  add column if not exists updated_at timestamptz not null default now();

alter table public.academic_periods
  add column if not exists display_kind text not null default 'Term',
  add column if not exists notes text not null default '',
  add column if not exists updated_at timestamptz not null default now();

alter table public.academic_events
  add column if not exists updated_at timestamptz not null default now();

alter table public.student_goals
  add column if not exists reminder_settings jsonb not null default '{"enabled":false,"time":"16:00","days":["Monday","Tuesday","Wednesday","Thursday","Friday"]}'::jsonb;

-- Private student-owned files. Teacher-assigned files remain in learning_resources
-- and are accessed through resource_assignments.
create table if not exists public.learner_personal_resources (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  subject_name text not null default '',
  topic text not null default '',
  resource_type text not null default 'Personal',
  description text not null default '',
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learner_personal_resources_owner_date
  on public.learner_personal_resources(learner_id, created_at desc);

alter table public.learner_personal_resources enable row level security;

drop policy if exists "personal_resources_owner_manage" on public.learner_personal_resources;
create policy "personal_resources_owner_manage"
  on public.learner_personal_resources
  for all to authenticated
  using (learner_id = auth.uid() and public.is_active_studyspace_learner())
  with check (learner_id = auth.uid() and public.is_active_studyspace_learner());

grant select, insert, update, delete on public.learner_personal_resources to authenticated;
grant select, insert, update, delete on public.student_subjects to authenticated;
grant select, insert, update, delete on public.planner_tasks to authenticated;
grant select, insert, update, delete on public.study_sessions to authenticated;
grant select, insert, update, delete on public.academic_periods to authenticated;
grant select, insert, update, delete on public.academic_events to authenticated;
grant select, insert, update, delete on public.student_goals to authenticated;

-- Personal files use a distinct path segment under the current authenticated
-- learner's UUID. This policy cannot grant access to teacher-owned resources.
drop policy if exists "studyspace_personal_files_owner_manage" on storage.objects;
create policy "studyspace_personal_files_owner_manage"
  on storage.objects
  for all to authenticated
  using (
    bucket_id = 'studyspace-resources'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'personal'
    and public.is_active_studyspace_learner()
  )
  with check (
    bucket_id = 'studyspace-resources'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'personal'
    and public.is_active_studyspace_learner()
  );

-- A common updated_at trigger makes last-write conflict resolution consistent.
create or replace function public.touch_studyspace_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'student_subjects',
    'planner_tasks',
    'study_sessions',
    'academic_periods',
    'academic_events',
    'student_goals',
    'learner_personal_resources'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', 'touch_' || table_name || '_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_studyspace_updated_at()',
      'touch_' || table_name || '_updated_at',
      table_name
    );
  end loop;
end $$;
