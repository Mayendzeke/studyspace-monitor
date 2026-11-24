create table if not exists public.assessment_schedule_preferences (
  learner_id uuid primary key references public.profiles(id) on delete cascade,
  timezone text not null default 'Africa/Mbabane',
  available_windows jsonb not null default '[]'::jsonb,
  daily_minutes_limit integer not null default 120 check (daily_minutes_limit between 20 and 360),
  preferred_assessment_days smallint[] not null default array[1,2,3,4,5]::smallint[],
  question_count integer not null default 10 check (question_count = 10),
  updated_at timestamptz not null default now()
);
alter table public.assessment_schedule_preferences enable row level security;
drop policy if exists assessment_schedule_preferences_owner_manage on public.assessment_schedule_preferences;
create policy assessment_schedule_preferences_owner_manage on public.assessment_schedule_preferences
  for all to authenticated
  using (learner_id = (select auth.uid()) and (select is_active_studyspace_learner()))
  with check (learner_id = (select auth.uid()) and (select is_active_studyspace_learner()));
grant select, insert, update, delete on public.assessment_schedule_preferences to authenticated;

create table if not exists public.assessment_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  period_type text not null check (period_type in ('weekly','monthly','quarterly')),
  period_start date not null,
  period_end date not null,
  policy text not null default 'balanced' check (policy = 'balanced'),
  status text not null default 'planned' check (status in ('planned','needs_availability','capacity_conflict','published','failed')),
  schedule_hash text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (learner_id, period_type, period_start)
);
create index if not exists assessment_schedule_runs_learner_period_idx on public.assessment_schedule_runs (learner_id, period_start desc);
alter table public.assessment_schedule_runs enable row level security;
drop policy if exists assessment_schedule_runs_owner_read on public.assessment_schedule_runs;
create policy assessment_schedule_runs_owner_read on public.assessment_schedule_runs
  for select to authenticated using (learner_id = (select auth.uid()) and (select is_active_studyspace_learner()));
grant select on public.assessment_schedule_runs to authenticated;

create table if not exists public.assessment_schedule_items (
  id uuid primary key default gen_random_uuid(),
  schedule_run_id uuid not null references public.assessment_schedule_runs(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid references public.student_subjects(id) on delete set null,
  subject_name text not null,
  assessment_type text not null check (assessment_type in ('weekly_subject','monthly_subject','quarterly_exam')),
  scheduled_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 240),
  question_count integer not null default 10 check (question_count between 1 and 100),
  difficulty_score numeric(5,2) not null default 3,
  workload_score numeric(7,2) not null default 1,
  status text not null default 'scheduled' check (status in ('scheduled','generated','published','completed','overdue','conflict')),
  exercise_assignment_id uuid references public.exercise_assignments(id) on delete set null,
  schedule_key text not null unique,
  version_seed text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assessment_schedule_items_learner_date_idx on public.assessment_schedule_items (learner_id, scheduled_at);
create index if not exists assessment_schedule_items_run_idx on public.assessment_schedule_items (schedule_run_id);
alter table public.assessment_schedule_items enable row level security;
drop policy if exists assessment_schedule_items_owner_read on public.assessment_schedule_items;
create policy assessment_schedule_items_owner_read on public.assessment_schedule_items
  for select to authenticated using (learner_id = (select auth.uid()) and (select is_active_studyspace_learner()));
grant select on public.assessment_schedule_items to authenticated;

create table if not exists public.learning_material_review_queue (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  title text not null,
  summary text not null default '',
  subject_name text not null,
  topic text not null default '',
  material_type text not null default 'study_notes',
  content jsonb not null,
  country text not null default '',
  institution text not null default '',
  education_level text not null default '',
  grade text not null default '',
  course text not null default '',
  curriculum text not null default '',
  academic_year text not null default '',
  language text not null default 'English',
  source_references jsonb not null default '[]'::jsonb,
  profile_snapshot jsonb not null default '{}'::jsonb,
  generator text not null default 'hybrid_ai',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text not null default '',
  published_resource_id uuid references public.learning_resources(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists learning_material_review_queue_status_created_idx on public.learning_material_review_queue (status, created_at desc);
create index if not exists learning_material_review_queue_learner_subject_idx on public.learning_material_review_queue (learner_id, subject_name, topic);
alter table public.learning_material_review_queue enable row level security;
drop policy if exists learning_material_review_admin_read on public.learning_material_review_queue;
create policy learning_material_review_admin_read on public.learning_material_review_queue for select to authenticated using ((select is_studyspace_admin()));
drop policy if exists learning_material_review_admin_update on public.learning_material_review_queue;
create policy learning_material_review_admin_update on public.learning_material_review_queue for update to authenticated using ((select is_studyspace_admin())) with check ((select is_studyspace_admin()));
drop policy if exists learning_material_review_student_approved_read on public.learning_material_review_queue;
create policy learning_material_review_student_approved_read on public.learning_material_review_queue
  for select to authenticated using (learner_id = (select auth.uid()) and status = 'approved' and (select is_active_studyspace_learner()));
grant select, update on public.learning_material_review_queue to authenticated;

create table if not exists public.assessment_question_bank (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  curriculum text not null,
  education_level text not null,
  grade text not null default '',
  course text not null default '',
  subject_name text not null,
  language text not null default 'English',
  topic text not null,
  question_type text not null,
  prompt text not null,
  content jsonb not null default '{}'::jsonb,
  answer_key jsonb not null,
  explanation text not null default '',
  points numeric(7,2) not null default 1 check (points > 0),
  difficulty text not null default 'moderate',
  source_type text not null default 'ai_generated',
  source_reference text not null default '',
  fingerprint text not null unique,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assessment_question_bank_cohort_idx
  on public.assessment_question_bank (country, curriculum, education_level, grade, course, subject_name, topic)
  where verification_status = 'verified';
alter table public.assessment_question_bank enable row level security;
drop policy if exists assessment_question_bank_admin_manage on public.assessment_question_bank;
create policy assessment_question_bank_admin_manage on public.assessment_question_bank for all to authenticated
  using ((select is_studyspace_admin())) with check ((select is_studyspace_admin()));
grant select, insert, update, delete on public.assessment_question_bank to authenticated;

create table if not exists public.assessment_question_exposures (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.assessment_question_bank(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  assessment_item_id uuid references public.assessment_schedule_items(id) on delete set null,
  exposed_at timestamptz not null default now(),
  unique (question_id, learner_id, assessment_item_id)
);
create index if not exists assessment_question_exposures_learner_recent_idx on public.assessment_question_exposures (learner_id, exposed_at desc);
alter table public.assessment_question_exposures enable row level security;
drop policy if exists assessment_question_exposures_admin_manage on public.assessment_question_exposures;
create policy assessment_question_exposures_admin_manage on public.assessment_question_exposures for all to authenticated
  using ((select is_studyspace_admin())) with check ((select is_studyspace_admin()));
grant select, insert, update, delete on public.assessment_question_exposures to authenticated;
