-- Studyspace: teacher-owned weekly timetable, safe direct messaging and cohort progress.
-- All student-visible records remain scoped through RLS. Group averages are returned
-- only as aggregate values and never expose another learner's individual marks.

create table if not exists public.teacher_timetable_entries (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  subject_name text not null check (char_length(btrim(subject_name)) between 1 and 100),
  education_level text not null default '' check (char_length(education_level) <= 80),
  grade text not null default '' check (char_length(grade) <= 80),
  curriculum text not null default '' check (char_length(curriculum) <= 120),
  course text not null default '' check (char_length(course) <= 160),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  location text not null default '' check (char_length(location) <= 120),
  notes text not null default '' check (char_length(notes) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_timetable_valid_time check (ends_at > starts_at)
);

create index if not exists teacher_timetable_entries_teacher_day_time_idx
  on public.teacher_timetable_entries(teacher_id, is_active, day_of_week, starts_at);

create table if not exists public.teacher_timetable_members (
  entry_id uuid not null references public.teacher_timetable_entries(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (entry_id, learner_id)
);

create index if not exists teacher_timetable_members_learner_entry_idx
  on public.teacher_timetable_members(learner_id, entry_id);

alter table public.teacher_timetable_entries enable row level security;
alter table public.teacher_timetable_members enable row level security;

create policy teacher_timetable_admin_manage
  on public.teacher_timetable_entries
  for all to authenticated
  using ((select public.is_studyspace_admin()))
  with check ((select public.is_studyspace_admin()));

create policy teacher_timetable_assigned_learner_read
  on public.teacher_timetable_entries
  for select to authenticated
  using (
    (select public.is_active_studyspace_learner())
    and exists (
      select 1 from public.teacher_timetable_members m
      where m.entry_id = teacher_timetable_entries.id
        and m.learner_id = (select auth.uid())
    )
  );

create policy teacher_timetable_members_admin_manage
  on public.teacher_timetable_members
  for all to authenticated
  using ((select public.is_studyspace_admin()))
  with check ((select public.is_studyspace_admin()));

create policy teacher_timetable_members_self_read
  on public.teacher_timetable_members
  for select to authenticated
  using (
    learner_id = (select auth.uid())
    and (select public.is_active_studyspace_learner())
  );

grant select, insert, update, delete on public.teacher_timetable_entries to authenticated;
grant select, insert, update, delete on public.teacher_timetable_members to authenticated;
revoke all on public.teacher_timetable_entries, public.teacher_timetable_members from anon;

-- A connection is a student-to-student invitation. A pending invitation grants
-- no messaging rights; direct messaging unlocks only after the addressee accepts.
create table if not exists public.student_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  pair_low uuid generated always as (least(requester_id, addressee_id)) stored,
  pair_high uuid generated always as (greatest(requester_id, addressee_id)) stored,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_connections_not_self check (requester_id <> addressee_id),
  constraint student_connections_unique_pair unique (pair_low, pair_high)
);

create index if not exists student_connections_addressee_status_idx
  on public.student_connections(addressee_id, status, created_at desc);
create index if not exists student_connections_requester_status_idx
  on public.student_connections(requester_id, status, created_at desc);

alter table public.student_connections enable row level security;

create policy student_connections_participant_read
  on public.student_connections
  for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

create policy student_connections_learner_invite
  on public.student_connections
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and (select public.is_active_studyspace_learner())
    and exists (
      select 1 from public.profiles p
      where p.id = addressee_id and p.role = 'learner' and p.account_status = 'active'
    )
  );

create policy student_connections_recipient_respond
  on public.student_connections
  for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (
    addressee_id = (select auth.uid())
    and status in ('accepted', 'rejected')
  );

grant select, insert on public.student_connections to authenticated;
grant update(status, updated_at) on public.student_connections to authenticated;
revoke all on public.student_connections from anon;

-- Shared predicate used by direct-message RLS and private attachment access.
create or replace function public.can_message_studyspace_user(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_other is not null
    and p_other <> (select auth.uid())
    and exists (
      select 1
      from public.profiles other_profile
      where other_profile.id = p_other
        and other_profile.account_status = 'active'
        and (
          ((select public.is_studyspace_admin()) and other_profile.role = 'learner')
          or ((select public.is_active_studyspace_learner()) and other_profile.role = 'admin')
          or (
            (select public.is_active_studyspace_learner())
            and other_profile.role = 'learner'
            and exists (
              select 1 from public.student_connections c
              where c.status = 'accepted'
                and ((c.requester_id = (select auth.uid()) and c.addressee_id = p_other)
                  or (c.addressee_id = (select auth.uid()) and c.requester_id = p_other))
            )
          )
        )
    );
$$;

revoke all on function public.can_message_studyspace_user(uuid) from public, anon;
grant execute on function public.can_message_studyspace_user(uuid) to authenticated;

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  attachment_path text,
  attachment_name text not null default '' check (char_length(attachment_name) <= 180),
  attachment_mime text not null default '' check (char_length(attachment_mime) <= 120),
  attachment_size bigint not null default 0 check (attachment_size between 0 and 5242880),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint direct_messages_not_self check (sender_id <> recipient_id),
  constraint direct_messages_content_required check (
    char_length(btrim(body)) between 1 and 2000 or attachment_path is not null
  ),
  constraint direct_messages_attachment_consistent check (
    (attachment_path is null and attachment_name = '' and attachment_mime = '' and attachment_size = 0)
    or (attachment_path is not null and attachment_name <> '' and attachment_mime <> '' and attachment_size > 0)
  ),
  constraint direct_messages_attachment_path check (
    attachment_path is null
    or attachment_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9-]+\.(jpg|png|webp|pdf|txt)$'
  )
);

create index if not exists direct_messages_sender_timeline_idx
  on public.direct_messages(sender_id, created_at desc);
create index if not exists direct_messages_recipient_timeline_idx
  on public.direct_messages(recipient_id, created_at desc);

alter table public.direct_messages enable row level security;

create policy direct_messages_participant_read
  on public.direct_messages
  for select to authenticated
  using (
    (sender_id = (select auth.uid()) and (select public.can_message_studyspace_user(recipient_id)))
    or (recipient_id = (select auth.uid()) and (select public.can_message_studyspace_user(sender_id)))
  );

create policy direct_messages_authorized_send
  on public.direct_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.can_message_studyspace_user(recipient_id))
    and (char_length(btrim(body)) between 1 and 2000 or attachment_path is not null)
    and (
      attachment_path is null
      or split_part(attachment_path, '/', 1) = (select auth.uid())::text
    )
  );

create policy direct_messages_recipient_read_receipt
  on public.direct_messages
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

grant select, insert on public.direct_messages to authenticated;
grant update(read_at) on public.direct_messages to authenticated;
revoke all on public.direct_messages from anon;

-- A private bucket; sender path ownership and the message row gate recipient access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'studyspace-direct-messages',
  'studyspace-direct-messages',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf','text/plain']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = excluded.allowed_mime_types;

create policy direct_message_attachments_sender_upload
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'studyspace-direct-messages'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy direct_message_attachments_participant_read
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'studyspace-direct-messages'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or exists (
        select 1 from public.direct_messages m
        where m.attachment_path = storage.objects.name
          and (m.sender_id = (select auth.uid()) or m.recipient_id = (select auth.uid()))
      )
    )
  );

create policy direct_message_attachments_sender_delete
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'studyspace-direct-messages'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

-- Limited directory search: only active learners, and only a small display name,
-- grade and opaque account ID are returned to an authenticated active learner.
create or replace function public.search_studyspace_learners(p_query text)
returns table (learner_id uuid, display_name text, grade text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_active_studyspace_learner() then
    raise exception 'An active learner account is required';
  end if;
  if char_length(btrim(coalesce(p_query, ''))) < 2 then
    return;
  end if;
  return query
  select p.id,
         coalesce(nullif(btrim(p.preferred_name), ''), nullif(btrim(p.full_name), ''), 'Learner'),
         coalesce(p.grade, '')
  from public.profiles p
  where p.role = 'learner'
    and p.account_status = 'active'
    and p.id <> auth.uid()
    and (
      coalesce(p.preferred_name, '') ilike '%' || left(btrim(p_query), 60) || '%'
      or coalesce(p.full_name, '') ilike '%' || left(btrim(p_query), 60) || '%'
      or coalesce(p.student_id, '') ilike '%' || left(btrim(p_query), 60) || '%'
    )
  order by p.preferred_name, p.full_name
  limit 15;
end;
$$;

revoke all on function public.search_studyspace_learners(text) from public, anon;
grant execute on function public.search_studyspace_learners(text) to authenticated;

-- Contact list returns all active learners to an administrator, but only the
-- administrator(s) and accepted student contacts to a learner.
create or replace function public.get_studyspace_message_contacts()
returns table (contact_id uuid, display_name text, grade text, contact_type text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_studyspace_admin() then
    return query
    select p.id,
           coalesce(nullif(btrim(p.preferred_name), ''), nullif(btrim(p.full_name), ''), 'Learner'),
           coalesce(p.grade, ''),
           'learner'::text
    from public.profiles p
    where p.role = 'learner' and p.account_status = 'active'
    order by p.preferred_name, p.full_name;
    return;
  end if;

  if not public.is_active_studyspace_learner() then
    raise exception 'An active Studyspace learner account is required';
  end if;

  return query
  select p.id,
         coalesce(nullif(btrim(p.preferred_name), ''), nullif(btrim(p.full_name), ''), 'Teacher'),
         coalesce(p.grade, ''),
         'teacher'::text
  from public.profiles p
  where p.role = 'admin' and p.account_status = 'active'
  union
  select p.id,
         coalesce(nullif(btrim(p.preferred_name), ''), nullif(btrim(p.full_name), ''), 'Student'),
         coalesce(p.grade, ''),
         'student'::text
  from public.profiles p
  join public.student_connections c
    on c.status = 'accepted'
   and ((c.requester_id = auth.uid() and c.addressee_id = p.id)
     or (c.addressee_id = auth.uid() and c.requester_id = p.id))
  where p.role = 'learner' and p.account_status = 'active';
end;
$$;

revoke all on function public.get_studyspace_message_contacts() from public, anon;
grant execute on function public.get_studyspace_message_contacts() to authenticated;

-- Students see their own score history and anonymised averages for the same
-- published exercise set. No peer identifiers or individual marks are exposed.
create or replace function public.get_student_assessment_progress()
returns table (
  assignment_id uuid,
  exercise_title text,
  subject_name text,
  score_percent numeric,
  cohort_average numeric,
  cohort_size integer,
  submitted_at timestamptz,
  teacher_feedback text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_active_studyspace_learner() then
    raise exception 'An active Studyspace learner account is required';
  end if;

  return query
  with latest_attempts as (
    select distinct on (ea.id)
      ea.id as assignment_id,
      ea.exercise_set_id,
      ea.learner_id,
      es.title as exercise_title,
      es.subject_name,
      a.score,
      a.total_points,
      a.submitted_at,
      a.teacher_feedback
    from public.exercise_assignments ea
    join public.exercise_sets es on es.id = ea.exercise_set_id
    join public.exercise_attempts a
      on a.assignment_id = ea.id
     and a.learner_id = ea.learner_id
    where a.learner_id = auth.uid()
      and a.submitted_at is not null
      and a.total_points > 0
    order by ea.id, a.submitted_at desc
  ),
  all_latest_attempts as (
    select distinct on (ea.id)
      ea.id as assignment_id,
      ea.exercise_set_id,
      ea.learner_id,
      a.score,
      a.total_points
    from public.exercise_assignments ea
    join public.exercise_attempts a
      on a.assignment_id = ea.id
     and a.learner_id = ea.learner_id
    where a.submitted_at is not null
      and a.total_points > 0
    order by ea.id, a.submitted_at desc
  ),
  cohorts as (
    select exercise_set_id,
      count(distinct learner_id)::integer as cohort_size,
      avg((score / nullif(total_points, 0)) * 100)::numeric as cohort_average
    from all_latest_attempts
    group by exercise_set_id
  )
  select mine.assignment_id,
         mine.exercise_title,
         mine.subject_name,
         round((mine.score / nullif(mine.total_points, 0)) * 100, 1),
         case when cohort.cohort_size >= 3 then round(cohort.cohort_average, 1) else null end,
         case when cohort.cohort_size >= 3 then cohort.cohort_size else null end,
         mine.submitted_at,
         coalesce(mine.teacher_feedback, '')
  from latest_attempts mine
  join cohorts cohort on cohort.exercise_set_id = mine.exercise_set_id
  order by mine.submitted_at desc
  limit 100;
end;
$$;

revoke all on function public.get_student_assessment_progress() from public, anon;
grant execute on function public.get_student_assessment_progress() to authenticated;

-- The Monitor may read learner coaching notes; learner ownership remains unchanged.
create policy mia_memory_admin_read
  on public.mia_learning_memory
  for select to authenticated
  using ((select public.is_studyspace_admin()));

-- Required table access for PostgREST. RLS remains the row-level boundary.
grant select on public.teacher_timetable_entries, public.teacher_timetable_members,
  public.student_connections, public.direct_messages to authenticated;
grant insert on public.teacher_timetable_entries, public.teacher_timetable_members to authenticated;
grant update on public.teacher_timetable_entries, public.teacher_timetable_members to authenticated;
grant delete on public.teacher_timetable_entries, public.teacher_timetable_members to authenticated;

-- Add only the two high-value change streams. Every event is still RLS-filtered.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'teacher_timetable_entries'
  ) then
    alter publication supabase_realtime add table public.teacher_timetable_entries;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'student_connections'
  ) then
    alter publication supabase_realtime add table public.student_connections;
  end if;
end $$;
