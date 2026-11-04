-- Studyspace shared backend foundation
-- Apply in Supabase SQL Editor or with the Supabase CLI.
-- Never expose the service-role key in either frontend.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'learner' check (role in ('admin','learner')),
  account_status text not null default 'pending' check (account_status in ('pending','active','disabled')),
  full_name text not null default '',
  preferred_name text not null default '',
  country text not null default '',
  institution text not null default '',
  education_level text not null default '',
  grade text not null default '',
  curriculum text not null default '',
  academic_year text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enrolment_pins (
  id uuid primary key default gen_random_uuid(),
  pin_hash text not null unique,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  redeemed_by uuid unique references public.profiles(id),
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pin_redemption_pair check ((redeemed_by is null) = (redeemed_at is null))
);

create table if not exists public.pin_redemption_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  was_successful boolean not null default false,
  attempted_at timestamptz not null default now()
);

create table if not exists public.student_subjects (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  subject_code text,
  category text not null default 'Core',
  created_at timestamptz not null default now(),
  unique (learner_id, name)
);

create table if not exists public.planner_tasks (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid references public.student_subjects(id) on delete set null,
  title text not null,
  notes text not null default '',
  task_kind text not null default 'Study',
  due_at timestamptz,
  estimated_minutes integer not null default 30 check (estimated_minutes between 5 and 1440),
  priority text not null default 'Medium' check (priority in ('High','Medium','Low')),
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid references public.student_subjects(id) on delete set null,
  started_at timestamptz not null default now(),
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  reflection text not null default ''
);

create table if not exists public.learning_resources (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  title text not null,
  description text not null default '',
  subject_name text not null,
  education_level text not null default '',
  curriculum text not null default '',
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.resource_assignments (
  resource_id uuid not null references public.learning_resources(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (resource_id, learner_id)
);

create table if not exists public.exercise_sets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  title text not null,
  instructions text not null default '',
  subject_name text not null,
  education_level text not null default '',
  grade text not null default '',
  curriculum text not null default '',
  question_count integer not null default 0 check (question_count >= 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercise_questions (
  id uuid primary key default gen_random_uuid(),
  exercise_set_id uuid not null references public.exercise_sets(id) on delete cascade,
  position integer not null check (position > 0),
  question_type text not null check (question_type in ('multiple_choice','fill_blank','true_false','matching','word_puzzle','short_answer')),
  prompt text not null,
  content jsonb not null default '{}'::jsonb,
  explanation text not null default '',
  points numeric(7,2) not null default 1 check (points > 0),
  unique (exercise_set_id, position)
);

create table if not exists public.exercise_answer_keys (
  question_id uuid primary key references public.exercise_questions(id) on delete cascade,
  answer_key jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.exercise_assignments (
  id uuid primary key default gen_random_uuid(),
  exercise_set_id uuid not null references public.exercise_sets(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  due_at timestamptz,
  assigned_at timestamptz not null default now(),
  unique (exercise_set_id, learner_id)
);

create table if not exists public.exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.exercise_assignments(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  score numeric(8,2) not null default 0,
  total_points numeric(8,2) not null default 0,
  submitted_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_pin_attempts_user_time on public.pin_redemption_attempts(user_id, attempted_at desc);\ncreate index if not exists idx_subjects_learner on public.student_subjects(learner_id);
create index if not exists idx_tasks_learner_due on public.planner_tasks(learner_id, due_at);
create index if not exists idx_sessions_learner_date on public.study_sessions(learner_id, started_at desc);
create index if not exists idx_resource_assignments_learner on public.resource_assignments(learner_id);
create index if not exists idx_exercise_assignments_learner on public.exercise_assignments(learner_id);
create index if not exists idx_attempts_learner on public.exercise_attempts(learner_id, submitted_at desc);
create index if not exists idx_audit_events_created on public.audit_events(created_at desc);

create or replace function public.is_studyspace_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and account_status = 'active'
  );
$$;

create or replace function public.handle_new_studyspace_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, preferred_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.raw_user_meta_data->>'preferred_name','')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_studyspace on auth.users;
create trigger on_auth_user_created_studyspace
after insert on auth.users
for each row execute procedure public.handle_new_studyspace_user();

create or replace function public.redeem_studyspace_pin(pin_digest text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  redeemed_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'learner' and account_status = 'pending'
  ) then
    raise exception 'This account is not eligible for enrolment';
  end if;

  update public.enrolment_pins
  set redeemed_by = auth.uid(), redeemed_at = now()
  where pin_hash = pin_digest
    and redeemed_by is null
    and redeemed_at is null
    and revoked_at is null
    and expires_at > now()
  returning id into redeemed_id;

  if redeemed_id is null then
    return false;
  end if;

  update public.profiles set account_status = 'active', updated_at = now()
  where id = auth.uid();

  insert into public.pin_redemption_attempts(user_id,was_successful) values (auth.uid(),true);\n\n  insert into public.audit_events(actor_id,event_type,target_type,target_id)
  values (auth.uid(),'enrolment_pin_redeemed','profile',auth.uid()::text);

  return true;
end;
$$;

revoke all on function public.redeem_studyspace_pin(text) from public;
grant execute on function public.redeem_studyspace_pin(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.enrolment_pins enable row level security;\nalter table public.pin_redemption_attempts enable row level security;
alter table public.student_subjects enable row level security;
alter table public.planner_tasks enable row level security;
alter table public.study_sessions enable row level security;
alter table public.learning_resources enable row level security;
alter table public.resource_assignments enable row level security;
alter table public.exercise_sets enable row level security;
alter table public.exercise_questions enable row level security;
alter table public.exercise_answer_keys enable row level security;
alter table public.exercise_assignments enable row level security;
alter table public.exercise_attempts enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles_read_self_or_admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_studyspace_admin());
-- Learner profile writes will be exposed through a restricted RPC; learners cannot
-- directly modify role or account_status. Admins can manage profiles. 
create policy "profiles_update_admin_only" on public.profiles for update to authenticated
using (public.is_studyspace_admin()) with check (public.is_studyspace_admin());

create policy "pins_admin_all" on public.enrolment_pins for all to authenticated
using (public.is_studyspace_admin()) with check (public.is_studyspace_admin());

create policy "subjects_owner_or_admin" on public.student_subjects for all to authenticated
using (learner_id = auth.uid() or public.is_studyspace_admin())
with check (learner_id = auth.uid() or public.is_studyspace_admin());

create policy "tasks_owner_or_admin" on public.planner_tasks for all to authenticated
using (learner_id = auth.uid() or public.is_studyspace_admin())
with check (learner_id = auth.uid() or public.is_studyspace_admin());

create policy "sessions_owner_or_admin" on public.study_sessions for all to authenticated
using (learner_id = auth.uid() or public.is_studyspace_admin())
with check (learner_id = auth.uid() or public.is_studyspace_admin());

create policy "resources_admin_manage" on public.learning_resources for all to authenticated
using (public.is_studyspace_admin()) with check (public.is_studyspace_admin());
create policy "resources_assigned_read" on public.learning_resources for select to authenticated
using (exists (select 1 from public.resource_assignments ra where ra.resource_id = id and ra.learner_id = auth.uid()));

create policy "resource_assignments_admin_manage" on public.resource_assignments for all to authenticated
using (public.is_studyspace_admin()) with check (public.is_studyspace_admin());
create policy "resource_assignments_learner_read" on public.resource_assignments for select to authenticated
using (learner_id = auth.uid());

create policy "exercise_sets_admin_manage" on public.exercise_sets for all to authenticated
using (public.is_studyspace_admin()) with check (public.is_studyspace_admin());
create policy "exercise_sets_assigned_read" on public.exercise_sets for select to authenticated
using (is_published and exists (
  select 1 from public.exercise_assignments ea
  where ea.exercise_set_id = exercise_sets.id and ea.learner_id = auth.uid()
));

create policy "exercise_questions_admin_manage" on public.exercise_questions for all to authenticated
using (public.is_studyspace_admin()) with check (public.is_studyspace_admin());
create policy "exercise_questions_assigned_read" on public.exercise_questions for select to authenticated
using (exists (
  select 1 from public.exercise_assignments ea
  join public.exercise_sets es on es.id = ea.exercise_set_id
  where es.id = exercise_questions.exercise_set_id and ea.learner_id = auth.uid() and es.is_published
));

-- Correct answers are never readable by learner clients.
create policy "exercise_answer_keys_admin_only" on public.exercise_answer_keys for all to authenticated
using (public.is_studyspace_admin()) with check (public.is_studyspace_admin());

create policy "exercise_assignments_admin_manage" on public.exercise_assignments for all to authenticated
using (public.is_studyspace_admin()) with check (public.is_studyspace_admin());
create policy "exercise_assignments_learner_read" on public.exercise_assignments for select to authenticated
using (learner_id = auth.uid());

create policy "attempts_learner_manage" on public.exercise_attempts for all to authenticated
using (learner_id = auth.uid()) with check (learner_id = auth.uid());
create policy "attempts_admin_read" on public.exercise_attempts for select to authenticated
using (public.is_studyspace_admin());

create policy "audit_admin_read" on public.audit_events for select to authenticated
using (public.is_studyspace_admin());
create policy "audit_actor_insert" on public.audit_events for insert to authenticated
with check (actor_id = auth.uid());

-- Private bucket. Upload/download policies should be added with the storage integration
-- so each object path is tied to a resource assignment or admin-owned resource.
insert into storage.buckets (id, name, public)
values ('studyspace-resources','studyspace-resources',false)
on conflict (id) do nothing;
