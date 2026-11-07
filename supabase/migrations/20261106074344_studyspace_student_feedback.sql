-- Student feedback inbox and private screenshot storage.
create table if not exists public.student_feedback (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('Bug report','Suggestion','Content issue','Accessibility','Other')),
  message text not null check (char_length(btrim(message)) between 10 and 4000),
  page text not null default '' check (char_length(page) <= 120),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  attachment_path text unique,
  status text not null default 'new' check (status in ('new','reviewing','resolved')),
  created_at timestamptz not null default now()
);

create index if not exists student_feedback_created_at_idx
  on public.student_feedback (created_at desc);
create index if not exists student_feedback_learner_created_idx
  on public.student_feedback (learner_id, created_at desc);

alter table public.student_feedback enable row level security;
revoke all on table public.student_feedback from public, anon;
grant select, insert, update on table public.student_feedback to authenticated;
grant all on table public.student_feedback to service_role;

drop policy if exists student_feedback_learner_insert on public.student_feedback;
create policy student_feedback_learner_insert
  on public.student_feedback for insert to authenticated
  with check (learner_id = (select auth.uid()) and public.is_active_studyspace_learner());

drop policy if exists student_feedback_admin_read on public.student_feedback;
create policy student_feedback_admin_read
  on public.student_feedback for select to authenticated
  using (public.is_studyspace_admin());

drop policy if exists student_feedback_admin_update on public.student_feedback;
create policy student_feedback_admin_update
  on public.student_feedback for update to authenticated
  using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'studyspace-feedback',
  'studyspace-feedback',
  false,
  5242880,
  array['image/png','image/jpeg','image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists studyspace_feedback_learner_upload on storage.objects;
create policy studyspace_feedback_learner_upload
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'studyspace-feedback'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_active_studyspace_learner()
  );

drop policy if exists studyspace_feedback_learner_cleanup on storage.objects;
create policy studyspace_feedback_learner_cleanup
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'studyspace-feedback'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_active_studyspace_learner()
  );

drop policy if exists studyspace_feedback_admin_read on storage.objects;
create policy studyspace_feedback_admin_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'studyspace-feedback'
    and public.is_studyspace_admin()
  );
