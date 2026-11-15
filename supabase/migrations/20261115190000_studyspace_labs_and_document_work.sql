-- Shared StudySpace labs and document workspaces.
-- Student records are private by default; Monitor can inspect lab work and
-- explicitly submitted document work through administrator-only policies.

create table if not exists public.student_lab_work (
  learner_id uuid not null references public.profiles(id) on delete cascade,
  lab_area text not null check (lab_area in ('maths','physics','chemistry','biology')),
  activity_key text not null check (length(activity_key) between 1 and 120),
  title text not null default '',
  live_state jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  status text not null default 'in_progress'
    check (status in ('in_progress','completed','submitted')),
  last_accessed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  score numeric(6,2),
  feedback text not null default '',
  updated_at timestamptz not null default now(),
  primary key (learner_id, lab_area, activity_key)
);

create index if not exists student_lab_work_recent_idx
  on public.student_lab_work (updated_at desc);
create index if not exists student_lab_work_area_status_idx
  on public.student_lab_work (lab_area, status, updated_at desc);

alter table public.student_lab_work enable row level security;
drop policy if exists "lab_work_owner_manage" on public.student_lab_work;
create policy "lab_work_owner_manage"
  on public.student_lab_work for all to authenticated
  using (
    (learner_id = auth.uid() and public.is_active_studyspace_learner())
    or (public.is_studyspace_admin() and coalesce(((select auth.jwt()) ->> 'aal'), '') = 'aal2')
  )
  with check (
    (learner_id = auth.uid() and public.is_active_studyspace_learner())
    or (public.is_studyspace_admin() and coalesce(((select auth.jwt()) ->> 'aal'), '') = 'aal2')
  );
grant select, insert, update, delete on public.student_lab_work to authenticated;

create table if not exists public.lab_assignments (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  lab_area text not null check (lab_area in ('maths','physics','chemistry','biology')),
  activity_key text not null default '',
  title text not null,
  instructions text not null default '',
  due_at timestamptz,
  required boolean not null default false,
  status text not null default 'assigned'
    check (status in ('assigned','in_progress','submitted','reviewed','cancelled')),
  assigned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lab_assignments_learner_due_idx
  on public.lab_assignments (learner_id, due_at, created_at desc);
alter table public.lab_assignments enable row level security;
drop policy if exists "lab_assignments_admin_manage" on public.lab_assignments;
create policy "lab_assignments_admin_manage"
  on public.lab_assignments for all to authenticated
  using (public.is_studyspace_admin() and coalesce(((select auth.jwt()) ->> 'aal'), '') = 'aal2')
  with check (public.is_studyspace_admin() and coalesce(((select auth.jwt()) ->> 'aal'), '') = 'aal2');
drop policy if exists "lab_assignments_learner_read" on public.lab_assignments;
create policy "lab_assignments_learner_read"
  on public.lab_assignments for select to authenticated
  using (learner_id = auth.uid() and public.is_active_studyspace_learner());
grant select, insert, update, delete on public.lab_assignments to authenticated;

create table if not exists public.lab_controls (
  lab_area text primary key check (lab_area in ('maths','physics','chemistry','biology')),
  enabled boolean not null default true,
  student_message text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.lab_controls (lab_area, enabled)
values ('maths',true),('physics',true),('chemistry',true),('biology',true)
on conflict (lab_area) do nothing;
alter table public.lab_controls enable row level security;
drop policy if exists "lab_controls_admin_manage" on public.lab_controls;
create policy "lab_controls_admin_manage"
  on public.lab_controls for all to authenticated
  using (public.is_studyspace_admin() and coalesce(((select auth.jwt()) ->> 'aal'), '') = 'aal2')
  with check (public.is_studyspace_admin() and coalesce(((select auth.jwt()) ->> 'aal'), '') = 'aal2');
drop policy if exists "lab_controls_learner_read" on public.lab_controls;
create policy "lab_controls_learner_read"
  on public.lab_controls for select to authenticated
  using (public.is_active_studyspace_learner());
grant select, insert, update, delete on public.lab_controls to authenticated;

create table if not exists public.student_document_work (
  learner_id uuid not null references public.profiles(id) on delete cascade,
  resource_key text not null check (length(resource_key) between 1 and 240),
  document_name text not null default '',
  page_count integer not null default 0 check (page_count >= 0),
  annotations jsonb not null default '[]'::jsonb,
  form_values jsonb not null default '{}'::jsonb,
  submitted boolean not null default false,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (learner_id, resource_key)
);
create index if not exists student_document_work_submitted_idx
  on public.student_document_work (submitted_at desc) where submitted = true;
alter table public.student_document_work enable row level security;
drop policy if exists "document_work_owner_manage" on public.student_document_work;
create policy "document_work_owner_manage"
  on public.student_document_work for all to authenticated
  using (learner_id = auth.uid() and public.is_active_studyspace_learner())
  with check (learner_id = auth.uid() and public.is_active_studyspace_learner());
drop policy if exists "document_work_admin_submitted_read" on public.student_document_work;
create policy "document_work_admin_submitted_read"
  on public.student_document_work for select to authenticated
  using (public.is_studyspace_admin() and coalesce(((select auth.jwt()) ->> 'aal'), '') = 'aal2' and submitted = true);
grant select, insert, update, delete on public.student_document_work to authenticated;

-- Keep timestamps consistent without depending on another migration's
-- private helper function.
create or replace function public.set_studyspace_labs_updated_at()
returns trigger
language plpgsql
set search_path = public
as $
begin
  new.updated_at := now();
  return new;
end;
$;

do $
declare table_name text;
begin
  foreach table_name in array array['student_lab_work','lab_assignments','lab_controls','student_document_work']
  loop
    execute format('drop trigger if exists %I on public.%I', 'touch_' || table_name || '_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_studyspace_labs_updated_at()',
      'touch_' || table_name || '_updated_at', table_name
    );
  end loop;
end $;

-- Enable Supabase Realtime for live student/monitor collaboration when the
-- standard publication is present. Existing memberships are left untouched.
do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['student_lab_work','lab_assignments','lab_controls','student_document_work']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;
