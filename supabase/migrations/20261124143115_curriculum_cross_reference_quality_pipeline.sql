alter table public.learning_material_review_queue
  add column if not exists research_status text not null default 'pending_administrator_verification'
    check (research_status in ('pending_administrator_verification','cross_referenced','insufficient_sources','conflicting_sources')),
  add column if not exists source_domains text[] not null default '{}'::text[],
  add column if not exists source_count integer not null default 0 check (source_count >= 0),
  add column if not exists quality_checks jsonb not null default '{}'::jsonb,
  add column if not exists generator_version text not null default 'curriculum-research-v2';

alter table public.learning_resources
  add column if not exists country text not null default '',
  add column if not exists institution text not null default '',
  add column if not exists grade text not null default '',
  add column if not exists course text not null default '',
  add column if not exists academic_year text not null default '',
  add column if not exists language text not null default 'English',
  add column if not exists source_references jsonb not null default '[]'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists material_key text,
  add column if not exists version_number integer not null default 1 check (version_number > 0);

create index if not exists learning_resources_academic_match_idx
  on public.learning_resources (country, education_level, grade, curriculum, course, subject_name, language);
create index if not exists learning_resources_material_key_version_idx
  on public.learning_resources (material_key, version_number desc) where material_key is not null;

create table if not exists public.curriculum_reference_registry (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  authority_name text not null default '',
  institution text not null default '',
  institution_type text not null default '',
  education_level text not null default '',
  grade text not null default '',
  curriculum text not null default '',
  course text not null default '',
  qualification_level text not null default '',
  subject_name text not null default '',
  module_code text not null default '',
  module_name text not null default '',
  language text not null default 'English',
  source_type text not null check (source_type in ('national_curriculum','exam_board_syllabus','school_course_outline','university_module_outline','official_handbook','past_paper','mark_scheme','ministry_resource','approved_textbook','other_authoritative')),
  title text not null,
  publisher text not null default '',
  source_url text not null,
  version_label text not null default '',
  academic_year text not null default '',
  verified_status text not null default 'pending' check (verified_status in ('pending','verified','rejected','expired')),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  last_checked_at timestamptz,
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_reference_registry_https check (source_url ~ '^https://')
);
create index if not exists curriculum_reference_registry_match_idx
  on public.curriculum_reference_registry (country, curriculum, education_level, grade, course, subject_name, language)
  where verified_status = 'verified';
create index if not exists curriculum_reference_registry_institution_idx
  on public.curriculum_reference_registry (institution, course, module_code)
  where verified_status = 'verified';
alter table public.curriculum_reference_registry enable row level security;
drop policy if exists curriculum_reference_registry_admin_manage on public.curriculum_reference_registry;
create policy curriculum_reference_registry_admin_manage
  on public.curriculum_reference_registry for all to authenticated
  using ((select is_studyspace_admin()))
  with check ((select is_studyspace_admin()));
grant select, insert, update, delete on public.curriculum_reference_registry to authenticated;

create table if not exists public.learning_material_revision_history (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.learning_resources(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null,
  content_snapshot jsonb not null,
  source_references jsonb not null default '[]'::jsonb,
  quality_checks jsonb not null default '{}'::jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  change_reason text not null default '',
  created_at timestamptz not null default now(),
  unique (resource_id, version_number)
);
alter table public.learning_material_revision_history enable row level security;
drop policy if exists learning_material_revision_history_admin_manage on public.learning_material_revision_history;
create policy learning_material_revision_history_admin_manage
  on public.learning_material_revision_history for all to authenticated
  using ((select is_studyspace_admin()))
  with check ((select is_studyspace_admin()));
grant select, insert, update, delete on public.learning_material_revision_history to authenticated;

comment on table public.curriculum_reference_registry is
  'Administrator-verified national curricula, examination syllabuses, institutional course outlines and module references used to ground Study Space learning content.';
comment on table public.learning_material_revision_history is
  'Immutable-by-workflow snapshots of approved learning material versions and their source/quality metadata.';
