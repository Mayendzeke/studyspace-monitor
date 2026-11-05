-- Studyspace live classroom, learner identity and AI usage foundation.
-- Apply after the existing core, hardening and administrator MFA migrations.

alter table public.profiles add column if not exists student_id text;
create unique index if not exists profiles_student_id_unique
  on public.profiles (upper(student_id)) where student_id is not null;
alter table public.enrolment_pins add column if not exists student_id text;
create unique index if not exists enrolment_pins_student_id_unique
  on public.enrolment_pins (upper(student_id)) where student_id is not null;

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  title text not null,
  subject_name text not null,
  education_level text not null default '',
  grade text not null default '',
  curriculum text not null default '',
  objectives text not null default '',
  starts_at timestamptz not null default now(),
  duration_minutes integer not null default 45 check (duration_minutes between 5 and 360),
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_session_members (
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz,
  last_seen_at timestamptz,
  primary key (session_id, learner_id)
);

create table if not exists public.session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.session_lesson_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.class_sessions(id) on delete cascade,
  summary text not null default '',
  key_points jsonb not null default '[]'::jsonb,
  worked_example text not null default '',
  recap_markdown text not null default '',
  is_published boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_homework (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  title text not null,
  instructions text not null default '',
  due_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.session_homework_submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.session_homework(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  response text not null default '',
  submitted_at timestamptz,
  completed_at timestamptz,
  unique (homework_id, learner_id)
);

create table if not exists public.session_whiteboards (
  session_id uuid primary key references public.class_sessions(id) on delete cascade,
  board_state jsonb not null default '{"version":1,"strokes":[]}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_generation_usage (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  purpose text not null,
  input_characters integer not null default 0,
  output_characters integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists class_sessions_start_idx on public.class_sessions(starts_at desc);
create index if not exists class_session_members_learner_idx on public.class_session_members(learner_id, session_id);
create index if not exists session_messages_timeline_idx on public.session_messages(session_id, created_at);
create index if not exists session_homework_session_idx on public.session_homework(session_id, due_at);
create index if not exists ai_usage_actor_time_idx on public.ai_generation_usage(actor_id, created_at desc);

alter table public.class_sessions enable row level security;
alter table public.class_session_members enable row level security;
alter table public.session_messages enable row level security;
alter table public.session_lesson_notes enable row level security;
alter table public.session_homework enable row level security;
alter table public.session_homework_submissions enable row level security;
alter table public.session_whiteboards enable row level security;
alter table public.ai_generation_usage enable row level security;

create policy "class_sessions_admin_manage" on public.class_sessions
  for all to authenticated using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());
create policy "class_sessions_member_read" on public.class_sessions
  for select to authenticated using (
    public.is_active_studyspace_learner()
    and exists (select 1 from public.class_session_members m
      where m.session_id = class_sessions.id and m.learner_id = auth.uid())
  );

create policy "class_session_members_admin_manage" on public.class_session_members
  for all to authenticated using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());
create policy "class_session_members_self_read" on public.class_session_members
  for select to authenticated using (
    learner_id = auth.uid() and public.is_active_studyspace_learner()
  );

create policy "session_messages_member_read" on public.session_messages
  for select to authenticated using (
    public.is_studyspace_admin()
    or (public.is_active_studyspace_learner() and exists (
      select 1 from public.class_session_members m
      where m.session_id = session_messages.session_id and m.learner_id = auth.uid()
    ))
  );
create policy "session_messages_member_send" on public.session_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and (public.is_studyspace_admin() or (
      public.is_active_studyspace_learner() and exists (
        select 1 from public.class_session_members m
        where m.session_id = session_messages.session_id and m.learner_id = auth.uid()
      )
    ))
  );
create policy "session_messages_sender_delete" on public.session_messages
  for delete to authenticated using (sender_id = auth.uid() or public.is_studyspace_admin());

create policy "session_notes_admin_manage" on public.session_lesson_notes
  for all to authenticated using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());
create policy "session_notes_member_read" on public.session_lesson_notes
  for select to authenticated using (
    is_published and public.is_active_studyspace_learner()
    and exists (select 1 from public.class_session_members m
      where m.session_id = session_lesson_notes.session_id and m.learner_id = auth.uid())
  );

create policy "session_homework_admin_manage" on public.session_homework
  for all to authenticated using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());
create policy "session_homework_member_read" on public.session_homework
  for select to authenticated using (
    public.is_active_studyspace_learner()
    and exists (select 1 from public.class_session_members m
      where m.session_id = session_homework.session_id and m.learner_id = auth.uid())
  );

create policy "homework_submission_self_manage" on public.session_homework_submissions
  for all to authenticated using (
    learner_id = auth.uid() and public.is_active_studyspace_learner()
    and exists (select 1 from public.session_homework h
      join public.class_session_members m on m.session_id = h.session_id
      where h.id = session_homework_submissions.homework_id and m.learner_id = auth.uid())
  ) with check (
    learner_id = auth.uid() and public.is_active_studyspace_learner()
    and exists (select 1 from public.session_homework h
      join public.class_session_members m on m.session_id = h.session_id
      where h.id = session_homework_submissions.homework_id and m.learner_id = auth.uid())
  );
create policy "homework_submission_admin_read" on public.session_homework_submissions
  for select to authenticated using (public.is_studyspace_admin());

create policy "whiteboard_member_read" on public.session_whiteboards
  for select to authenticated using (
    public.is_studyspace_admin() or (public.is_active_studyspace_learner()
      and exists (select 1 from public.class_session_members m
        where m.session_id = session_whiteboards.session_id and m.learner_id = auth.uid()))
  );
create policy "whiteboard_member_write" on public.session_whiteboards
  for insert to authenticated with check (
    updated_by = auth.uid() and (public.is_studyspace_admin() or (
      public.is_active_studyspace_learner() and exists (
        select 1 from public.class_session_members m
        where m.session_id = session_whiteboards.session_id and m.learner_id = auth.uid()
      )
    ))
  );
create policy "whiteboard_member_update" on public.session_whiteboards
  for update to authenticated using (
    public.is_studyspace_admin() or (public.is_active_studyspace_learner()
      and exists (select 1 from public.class_session_members m
        where m.session_id = session_whiteboards.session_id and m.learner_id = auth.uid()))
  ) with check (
    updated_by = auth.uid()
    and (public.is_studyspace_admin() or (
      public.is_active_studyspace_learner() and exists (
        select 1 from public.class_session_members m
        where m.session_id = session_whiteboards.session_id and m.learner_id = auth.uid()
      )
    ))
  );

create policy "ai_usage_admin_read" on public.ai_generation_usage
  for select to authenticated using (public.is_studyspace_admin());
revoke insert, update, delete on public.ai_generation_usage from authenticated;

-- Realtime is used only for the shared session tables. Row policies still
-- determine which authenticated users can receive each row.
do $$
begin
  alter publication supabase_realtime add table public.session_messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.session_whiteboards;
exception when duplicate_object then null;
end $$;

-- Login and enrolment throttling records are private to server-side functions.
create table if not exists public.student_auth_attempts (
  id bigint generated always as identity primary key,
  identifier_hash text not null,
  source_hash text not null,
  action text not null check (action in ('enrol','signin')),
  was_successful boolean not null default false,
  attempted_at timestamptz not null default now()
);
create index if not exists student_auth_attempts_identifier_time
  on public.student_auth_attempts(identifier_hash, attempted_at desc);
create index if not exists student_auth_attempts_source_time
  on public.student_auth_attempts(source_hash, attempted_at desc);
alter table public.student_auth_attempts enable row level security;
revoke all on public.student_auth_attempts from anon, authenticated;

-- Learners may update only their own ordinary profile fields through this RPC.
create or replace function public.update_studyspace_learner_profile(
  p_full_name text,
  p_preferred_name text,
  p_country text,
  p_institution text,
  p_education_level text,
  p_grade text,
  p_curriculum text,
  p_academic_year text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_studyspace_learner() then
    raise exception 'An active learner account is required';
  end if;
  update public.profiles set
    full_name = left(coalesce(p_full_name,''),120),
    preferred_name = left(coalesce(p_preferred_name,''),80),
    country = left(coalesce(p_country,''),80),
    institution = left(coalesce(p_institution,''),160),
    education_level = left(coalesce(p_education_level,''),80),
    grade = left(coalesce(p_grade,''),80),
    curriculum = left(coalesce(p_curriculum,''),120),
    academic_year = left(coalesce(p_academic_year,''),30),
    updated_at = now()
  where id = auth.uid();
end;
$$;
revoke all on function public.update_studyspace_learner_profile(text,text,text,text,text,text,text,text) from public;
grant execute on function public.update_studyspace_learner_profile(text,text,text,text,text,text,text,text) to authenticated;
