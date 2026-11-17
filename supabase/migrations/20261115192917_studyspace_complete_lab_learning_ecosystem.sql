create table if not exists public.lab_generated_materials (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  subject_name text not null check (char_length(subject_name) between 1 and 120),
  topic text not null check (char_length(topic) between 1 and 180),
  material_type text not null check (material_type in (
    'revision_notes','flashcards','practice_quiz','worked_examples','study_guide',
    'glossary','concept_map','case_study','lab_report','formula_sheet',
    'study_plan','question_bank'
  )),
  title text not null check (char_length(title) between 1 and 180),
  summary text not null default '',
  content jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 160000),
  source_type text not null default 'topic' check (source_type in ('topic','pasted_notes','assigned_material')),
  source_label text not null default '',
  difficulty text not null default 'mixed' check (difficulty in ('foundation','standard','challenge','mixed')),
  question_count integer not null default 0 check (question_count between 0 and 30),
  tags text[] not null default '{}',
  is_favourite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lab_generated_materials_learner_updated_idx on public.lab_generated_materials (learner_id, updated_at desc);
create index if not exists lab_generated_materials_learner_subject_idx on public.lab_generated_materials (learner_id, subject_name, topic);
alter table public.lab_generated_materials enable row level security;
drop policy if exists lab_generated_materials_owner_manage on public.lab_generated_materials;
create policy lab_generated_materials_owner_manage on public.lab_generated_materials
  for all to authenticated
  using (learner_id = (select auth.uid()) and (select is_active_studyspace_learner()))
  with check (learner_id = (select auth.uid()) and (select is_active_studyspace_learner()));
grant select, insert, update, delete on public.lab_generated_materials to authenticated;

create table if not exists public.lab_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  material_id uuid references public.lab_generated_materials(id) on delete set null,
  subject_name text not null check (char_length(subject_name) between 1 and 120),
  topic text not null check (char_length(topic) between 1 and 180),
  material_snapshot jsonb not null check (jsonb_typeof(material_snapshot) = 'object' and octet_length(material_snapshot::text) <= 160000),
  responses jsonb not null default '{}'::jsonb check (jsonb_typeof(responses) = 'object'),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  score numeric(8,2) check (score is null or score >= 0),
  max_score numeric(8,2) check (max_score is null or max_score >= 0),
  percentage numeric(5,2) check (percentage is null or percentage between 0 and 100),
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 86400),
  mode text not null default 'practice' check (mode in ('practice','timed','exam')),
  status text not null default 'in_progress' check (status in ('in_progress','submitted')),
  attempt_number integer not null default 1 check (attempt_number > 0),
  retake_mode text not null default 'original' check (retake_mode in ('original','full_retake','incorrect_only','fresh_variant')),
  retake_of uuid references public.lab_practice_attempts(id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index if not exists lab_practice_attempts_learner_created_idx on public.lab_practice_attempts (learner_id, created_at desc);
create index if not exists lab_practice_attempts_material_created_idx on public.lab_practice_attempts (material_id, created_at desc);
create index if not exists lab_practice_attempts_learner_subject_idx on public.lab_practice_attempts (learner_id, subject_name, topic);
alter table public.lab_practice_attempts enable row level security;
drop policy if exists lab_practice_attempts_owner_manage on public.lab_practice_attempts;
create policy lab_practice_attempts_owner_manage on public.lab_practice_attempts
  for all to authenticated
  using (learner_id = (select auth.uid()) and (select is_active_studyspace_learner()))
  with check (learner_id = (select auth.uid()) and (select is_active_studyspace_learner()));
grant select, insert, update, delete on public.lab_practice_attempts to authenticated;

comment on table public.lab_generated_materials is 'Private learner-owned generated learning materials for subject Labs; separate from teacher-assigned resources.';
comment on table public.lab_practice_attempts is 'Private learner-owned Lab practice history and retakes; never used as official teacher-assigned marks.';
