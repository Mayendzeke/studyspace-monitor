-- Account-scoped deletion ledger for offline-first, multi-device planner sync.
create table if not exists public.student_sync_deletions (
  id bigint generated always as identity primary key,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  entity text not null check (entity in ('subjects','tasks','sessions','academicPeriods','events','resources')),
  cloud_id uuid not null,
  deleted_at timestamptz not null default now(),
  unique (learner_id, entity, cloud_id)
);

create index if not exists student_sync_deletions_owner_date
  on public.student_sync_deletions(learner_id, deleted_at desc);

alter table public.student_sync_deletions enable row level security;
drop policy if exists "student_sync_deletions_owner_read" on public.student_sync_deletions;
create policy "student_sync_deletions_owner_read"
  on public.student_sync_deletions for select to authenticated
  using (learner_id = auth.uid() and public.is_active_studyspace_learner());
drop policy if exists "student_sync_deletions_owner_insert" on public.student_sync_deletions;
create policy "student_sync_deletions_owner_insert"
  on public.student_sync_deletions for insert to authenticated
  with check (learner_id = auth.uid() and public.is_active_studyspace_learner());
grant select, insert on public.student_sync_deletions to authenticated;
