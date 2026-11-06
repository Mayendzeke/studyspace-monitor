-- MIΛ learning companion: compact persistent memory, bounded chat history and separate timetable drafts.
create table if not exists public.mia_conversations (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New MIΛ chat' check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mia_conversations_owner_updated_idx on public.mia_conversations(learner_id, updated_at desc);
create table if not exists public.mia_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.mia_conversations(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists mia_messages_conversation_created_idx on public.mia_messages(conversation_id, created_at desc);
create table if not exists public.mia_learning_memory (
  learner_id uuid primary key references public.profiles(id) on delete cascade,
  strengths jsonb not null default '[]'::jsonb,
  difficulties jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  recent_topics jsonb not null default '[]'::jsonb,
  explanation_preference text not null default '',
  updated_at timestamptz not null default now()
);
-- School timetable and personal study blocks are deliberately separate categories.
create table if not exists public.student_timetable_entries (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  timetable_kind text not null check (timetable_kind in ('school','personal')),
  subject_name text not null default '',
  title text not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  location text not null default '',
  notes text not null default '',
  source text not null default 'manual' check (source in ('manual','mia_image_import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists student_timetable_owner_kind_day_idx on public.student_timetable_entries(learner_id, timetable_kind, day_of_week, starts_at);
alter table public.mia_conversations enable row level security;
alter table public.mia_messages enable row level security;
alter table public.mia_learning_memory enable row level security;
alter table public.student_timetable_entries enable row level security;
create policy mia_conversations_owner_manage on public.mia_conversations for all to authenticated
  using (learner_id = (select auth.uid()) and public.is_active_studyspace_learner())
  with check (learner_id = (select auth.uid()) and public.is_active_studyspace_learner());
create policy mia_messages_owner_manage on public.mia_messages for all to authenticated
  using (learner_id = (select auth.uid()) and public.is_active_studyspace_learner()
    and exists (select 1 from public.mia_conversations c where c.id = conversation_id and c.learner_id = (select auth.uid())))
  with check (learner_id = (select auth.uid()) and public.is_active_studyspace_learner()
    and exists (select 1 from public.mia_conversations c where c.id = conversation_id and c.learner_id = (select auth.uid())));
create policy mia_memory_owner_read on public.mia_learning_memory for select to authenticated
  using (learner_id = (select auth.uid()) and public.is_active_studyspace_learner());
create policy mia_timetable_owner_manage on public.student_timetable_entries for all to authenticated
  using (learner_id = (select auth.uid()) and public.is_active_studyspace_learner())
  with check (learner_id = (select auth.uid()) and public.is_active_studyspace_learner());
grant select, insert, update, delete on public.mia_conversations to authenticated;
grant select, insert, update, delete on public.mia_messages to authenticated;
grant select on public.mia_learning_memory to authenticated;
grant select, insert, update, delete on public.student_timetable_entries to authenticated;
revoke insert, update, delete on public.mia_learning_memory from anon, authenticated;
