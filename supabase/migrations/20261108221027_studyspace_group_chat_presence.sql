-- StudySpace group conversations, delivery/read receipts and presence.
-- Classrooms are provisioned by Monitor against a teacher timetable entry.
-- Other groups are discoverable/request-to-join or invite-and-accept only.

alter table public.direct_messages
  add column if not exists delivered_at timestamptz;

grant update(delivered_at, read_at) on public.direct_messages to authenticated;

create table if not exists public.studyspace_groups (
  id uuid primary key default gen_random_uuid(),
  group_type text not null check (group_type in ('classroom','school','level','custom')),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  description text not null default '' check (char_length(description) <= 500),
  created_by uuid not null references public.profiles(id) on delete cascade,
  school_name text not null default '',
  education_level text not null default '',
  grade text not null default '',
  timetable_entry_id uuid references public.teacher_timetable_entries(id) on delete cascade,
  discoverable boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studyspace_groups_classroom_entry check (
    (group_type = 'classroom' and timetable_entry_id is not null and school_name <> '')
    or (group_type <> 'classroom' and timetable_entry_id is null)
  )
);

create unique index if not exists studyspace_groups_one_classroom_per_entry_school
  on public.studyspace_groups(timetable_entry_id, lower(school_name))
  where group_type = 'classroom' and is_active;

create index if not exists studyspace_groups_directory_idx
  on public.studyspace_groups(group_type, school_name, education_level, grade)
  where is_active and discoverable;

create table if not exists public.studyspace_group_members (
  group_id uuid not null references public.studyspace_groups(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  membership_status text not null default 'pending' check (membership_status in ('pending','active','declined','removed')),
  membership_source text not null default 'request' check (membership_source in ('class_auto','request','invite','admin')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(group_id, learner_id)
);

create index if not exists studyspace_group_members_learner_idx
  on public.studyspace_group_members(learner_id, membership_status, group_id);

create table if not exists public.studyspace_group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.studyspace_groups(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint studyspace_group_invites_not_self check (inviter_id <> invitee_id),
  constraint studyspace_group_invites_unique_pending unique(group_id, invitee_id)
);

create index if not exists studyspace_group_invites_inbox_idx
  on public.studyspace_group_invites(invitee_id, status, created_at desc);

create table if not exists public.studyspace_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.studyspace_groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  attachment_path text,
  attachment_name text not null default '' check (char_length(attachment_name) <= 180),
  attachment_mime text not null default '' check (char_length(attachment_mime) <= 120),
  attachment_size bigint not null default 0 check (attachment_size between 0 and 5242880),
  created_at timestamptz not null default now(),
  constraint studyspace_group_messages_content_required check (
    (char_length(btrim(body)) between 1 and 2000) or attachment_path is not null
  ),
  constraint studyspace_group_messages_attachment_consistent check (
    (attachment_path is null and attachment_name = '' and attachment_mime = '' and attachment_size = 0)
    or (attachment_path is not null and attachment_name <> '' and attachment_mime <> '' and attachment_size > 0)
  ),
  constraint studyspace_group_messages_attachment_path check (
    attachment_path is null
    or attachment_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9-]+\.(jpg|png|webp|pdf|txt)$'
  )
);

create index if not exists studyspace_group_messages_timeline_idx
  on public.studyspace_group_messages(group_id, created_at desc);

create table if not exists public.studyspace_group_message_receipts (
  message_id uuid not null references public.studyspace_group_messages(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key(message_id, learner_id)
);

create index if not exists studyspace_group_receipts_learner_idx
  on public.studyspace_group_message_receipts(learner_id, read_at, delivered_at);

create table if not exists public.studyspace_user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.studyspace_groups enable row level security;
alter table public.studyspace_group_members enable row level security;
alter table public.studyspace_group_invites enable row level security;
alter table public.studyspace_group_messages enable row level security;
alter table public.studyspace_group_message_receipts enable row level security;
alter table public.studyspace_user_presence enable row level security;

create or replace function public.is_studyspace_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.studyspace_group_members gm
    where gm.group_id = p_group_id and gm.learner_id = p_user_id
      and gm.membership_status = 'active'
  );
$$;

create or replace function public.can_view_studyspace_group(p_group_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_studyspace_admin()
    or exists (
      select 1 from public.studyspace_groups g
      join public.profiles me on me.id = (select auth.uid())
      where g.id = p_group_id and g.is_active
        and public.is_studyspace_group_member(g.id, (select auth.uid()))
    )
    or exists (
      select 1 from public.studyspace_groups g
      join public.profiles me on me.id = (select auth.uid())
      where g.id = p_group_id and g.is_active and g.discoverable
        and me.role = 'learner' and me.account_status = 'active'
        and (
          (g.group_type = 'school' and lower(btrim(g.school_name)) = lower(btrim(me.institution)))
          or (g.group_type = 'level' and lower(btrim(g.education_level)) = lower(btrim(me.education_level))
            and (g.grade = '' or lower(btrim(g.grade)) = lower(btrim(me.grade))))
        )
    );
$$;

create or replace function public.studyspace_group_peer_eligible(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.studyspace_peer_chat_eligible(p_user_id);
$$;

revoke all on function public.is_studyspace_group_member(uuid,uuid) from public, anon;
revoke all on function public.can_view_studyspace_group(uuid) from public, anon;
revoke all on function public.studyspace_group_peer_eligible(uuid) from public, anon;
grant execute on function public.is_studyspace_group_member(uuid,uuid) to authenticated;
grant execute on function public.can_view_studyspace_group(uuid) to authenticated;
grant execute on function public.studyspace_group_peer_eligible(uuid) to authenticated;

drop policy if exists studyspace_groups_view on public.studyspace_groups;
create policy studyspace_groups_view on public.studyspace_groups
  for select to authenticated using (public.can_view_studyspace_group(id));

drop policy if exists studyspace_groups_admin_manage on public.studyspace_groups;
create policy studyspace_groups_admin_manage on public.studyspace_groups
  for all to authenticated
  using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());

drop policy if exists studyspace_group_members_view on public.studyspace_group_members;
create policy studyspace_group_members_view on public.studyspace_group_members
  for select to authenticated
  using (
    learner_id = (select auth.uid())
    or public.is_studyspace_admin()
    or public.is_studyspace_group_member(group_id, (select auth.uid()))
  );

drop policy if exists studyspace_group_members_admin_manage on public.studyspace_group_members;
create policy studyspace_group_members_admin_manage on public.studyspace_group_members
  for all to authenticated
  using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());

drop policy if exists studyspace_group_invites_view on public.studyspace_group_invites;
create policy studyspace_group_invites_view on public.studyspace_group_invites
  for select to authenticated
  using (inviter_id = (select auth.uid()) or invitee_id = (select auth.uid()));

drop policy if exists studyspace_group_invites_send on public.studyspace_group_invites;
create policy studyspace_group_invites_send on public.studyspace_group_invites
  for insert to authenticated
  with check (
    inviter_id = (select auth.uid())
    and public.is_studyspace_group_member(group_id, (select auth.uid()))
    and public.studyspace_group_peer_eligible((select auth.uid()))
    and public.studyspace_group_peer_eligible(invitee_id)
    and exists (
      select 1 from public.profiles p
      where p.id = invitee_id and p.role = 'learner' and p.account_status = 'active'
    )
  );

drop policy if exists studyspace_group_invites_respond on public.studyspace_group_invites;
create policy studyspace_group_invites_respond on public.studyspace_group_invites
  for update to authenticated
  using (invitee_id = (select auth.uid()) and status = 'pending')
  with check (
    invitee_id = (select auth.uid())
    and status in ('accepted','declined')
    and (
      status = 'declined'
      or public.studyspace_group_peer_eligible((select auth.uid()))
    )
  );

drop policy if exists studyspace_group_messages_view on public.studyspace_group_messages;
create policy studyspace_group_messages_view on public.studyspace_group_messages
  for select to authenticated
  using (
    public.is_studyspace_group_member(group_id, (select auth.uid()))
    and public.studyspace_group_peer_eligible((select auth.uid()))
  );

drop policy if exists studyspace_group_messages_send on public.studyspace_group_messages;
create policy studyspace_group_messages_send on public.studyspace_group_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_studyspace_group_member(group_id, (select auth.uid()))
    and public.studyspace_group_peer_eligible((select auth.uid()))
    and ((char_length(btrim(body)) between 1 and 2000) or attachment_path is not null)
    and (body = '' or array_length(regexp_split_to_array(btrim(body), '\s+'), 1) <= 350)
    and (attachment_path is null or split_part(attachment_path, '/', 1) = (select auth.uid())::text)
  );

drop policy if exists studyspace_group_receipts_view on public.studyspace_group_message_receipts;
create policy studyspace_group_receipts_view on public.studyspace_group_message_receipts
  for select to authenticated
  using (
    learner_id = (select auth.uid())
    or exists (
      select 1 from public.studyspace_group_messages gm
      where gm.id = message_id and gm.sender_id = (select auth.uid())
    )
    or public.is_studyspace_admin()
  );

drop policy if exists studyspace_group_receipts_write on public.studyspace_group_message_receipts;
create policy studyspace_group_receipts_write on public.studyspace_group_message_receipts
  for insert to authenticated
  with check (
    learner_id = (select auth.uid())
    and exists (
      select 1 from public.studyspace_group_messages gm
      where gm.id = message_id
        and public.is_studyspace_group_member(gm.group_id, (select auth.uid()))
        and gm.sender_id <> (select auth.uid())
    )
  );

drop policy if exists studyspace_group_receipts_update on public.studyspace_group_message_receipts;
create policy studyspace_group_receipts_update on public.studyspace_group_message_receipts
  for update to authenticated
  using (learner_id = (select auth.uid()))
  with check (learner_id = (select auth.uid()));

drop policy if exists studyspace_user_presence_read on public.studyspace_user_presence;
create policy studyspace_user_presence_read on public.studyspace_user_presence
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_studyspace_admin()
    or public.can_message_studyspace_user(user_id)
    or exists (
      select 1 from public.studyspace_group_members mine
      join public.studyspace_group_members theirs on theirs.group_id = mine.group_id
      where mine.learner_id = (select auth.uid())
        and mine.membership_status = 'active'
        and theirs.learner_id = studyspace_user_presence.user_id
        and theirs.membership_status = 'active'
    )
  );

drop policy if exists studyspace_user_presence_upsert on public.studyspace_user_presence;
create policy studyspace_user_presence_upsert on public.studyspace_user_presence
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists studyspace_user_presence_update on public.studyspace_user_presence;
create policy studyspace_user_presence_update on public.studyspace_user_presence
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.studyspace_user_presence to authenticated;
grant select on public.studyspace_groups, public.studyspace_group_members, public.studyspace_group_invites,
  public.studyspace_group_messages, public.studyspace_group_message_receipts to authenticated;
grant insert on public.studyspace_group_invites, public.studyspace_group_messages, public.studyspace_group_message_receipts to authenticated;
grant update(status, responded_at) on public.studyspace_group_invites to authenticated;
grant update(delivered_at, read_at) on public.studyspace_group_message_receipts to authenticated;
revoke all on public.studyspace_groups, public.studyspace_group_members, public.studyspace_group_invites,
  public.studyspace_group_messages, public.studyspace_group_message_receipts, public.studyspace_user_presence from anon;

create or replace function public.request_studyspace_group_join(p_group_id uuid)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare g public.studyspace_groups%rowtype; me public.profiles%rowtype;
begin
  if not public.is_active_studyspace_learner() then raise exception 'An active student account is required'; end if;
  if not public.studyspace_group_peer_eligible((select auth.uid())) then raise exception 'Guardian approval is required before joining student group chats'; end if;
  select * into g from public.studyspace_groups where id = p_group_id and is_active and discoverable;
  if not found then raise exception 'This group is not available to join'; end if;
  select * into me from public.profiles where id = (select auth.uid());
  if g.group_type = 'classroom' then raise exception 'Classroom membership is assigned by your teacher'; end if;
  if g.group_type = 'school' and lower(btrim(g.school_name)) <> lower(btrim(me.institution)) then raise exception 'This school group is only for learners at that school'; end if;
  if g.group_type = 'level' and (lower(btrim(g.education_level)) <> lower(btrim(me.education_level)) or (g.grade <> '' and lower(btrim(g.grade)) <> lower(btrim(me.grade)))) then raise exception 'This group is for a different study level'; end if;
  insert into public.studyspace_group_members(group_id,learner_id,membership_status,membership_source)
  values (p_group_id,(select auth.uid()),'pending','request')
  on conflict (group_id,learner_id) do update set
    membership_status = case when public.studyspace_group_members.membership_status in ('declined','removed') then 'pending' else public.studyspace_group_members.membership_status end,
    membership_source = case when public.studyspace_group_members.membership_status in ('declined','removed') then 'request' else public.studyspace_group_members.membership_source end,
    updated_at = now();
  return 'pending';
end;
$$;
revoke all on function public.request_studyspace_group_join(uuid) from public, anon;
grant execute on function public.request_studyspace_group_join(uuid) to authenticated;

create or replace function public.invite_studyspace_group_member(p_group_id uuid, p_invitee uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.is_studyspace_group_member(p_group_id,(select auth.uid())) then raise exception 'You must be a member to invite someone'; end if;
  if not public.studyspace_group_peer_eligible((select auth.uid())) or not public.studyspace_group_peer_eligible(p_invitee) then raise exception 'Guardian approval is required for both learners'; end if;
  if not exists(select 1 from public.profiles where id=p_invitee and role='learner' and account_status='active') then raise exception 'Learner not found'; end if;
  insert into public.studyspace_group_invites(group_id,inviter_id,invitee_id)
  values(p_group_id,(select auth.uid()),p_invitee)
  on conflict (group_id,invitee_id) do update set inviter_id=excluded.inviter_id,status='pending',responded_at=null
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.invite_studyspace_group_member(uuid,uuid) from public, anon;
grant execute on function public.invite_studyspace_group_member(uuid,uuid) to authenticated;

create or replace function public.respond_studyspace_group_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v public.studyspace_group_invites%rowtype;
begin
  select * into v from public.studyspace_group_invites where id=p_invite_id and invitee_id=(select auth.uid()) and status='pending' for update;
  if not found then raise exception 'Invitation is no longer available'; end if;
  if p_accept and not public.studyspace_group_peer_eligible((select auth.uid())) then raise exception 'Guardian approval is required before joining student group chats'; end if;
  update public.studyspace_group_invites set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now() where id=p_invite_id;
  if p_accept then
    insert into public.studyspace_group_members(group_id,learner_id,membership_status,membership_source,joined_at)
    values(v.group_id,(select auth.uid()),'active','invite',now())
    on conflict(group_id,learner_id) do update set membership_status='active',membership_source='invite',joined_at=now(),updated_at=now();
  end if;
end;
$$;
revoke all on function public.respond_studyspace_group_invite(uuid,boolean) from public, anon;
grant execute on function public.respond_studyspace_group_invite(uuid,boolean) to authenticated;

create or replace function public.studyspace_auto_classroom_membership()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.studyspace_group_members(group_id,learner_id,membership_status,membership_source,joined_at)
  select g.id, new.learner_id, 'active', 'class_auto', now()
  from public.studyspace_groups g
  join public.profiles learner on learner.id=new.learner_id
  join public.profiles teacher on teacher.id=g.created_by
  where g.group_type='classroom' and g.timetable_entry_id=new.entry_id and g.is_active
    and lower(btrim(learner.institution))=lower(btrim(g.school_name))
    and learner.role='learner' and learner.account_status='active'
    and public.studyspace_group_peer_eligible(learner.id)
  on conflict(group_id,learner_id) do update
    set membership_status='active',membership_source='class_auto',joined_at=coalesce(public.studyspace_group_members.joined_at,now()),updated_at=now();
  return new;
end;
$$;

drop trigger if exists studyspace_auto_classroom_member on public.teacher_timetable_members;
create trigger studyspace_auto_classroom_member
after insert on public.teacher_timetable_members
for each row execute function public.studyspace_auto_classroom_membership();

create or replace function public.seed_studyspace_classroom_members()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.group_type='classroom' then
    insert into public.studyspace_group_members(group_id,learner_id,membership_status,membership_source,joined_at)
    select new.id, m.learner_id, 'active', 'class_auto', now()
    from public.teacher_timetable_members m
    join public.profiles learner on learner.id=m.learner_id
    where m.entry_id=new.timetable_entry_id
      and lower(btrim(learner.institution))=lower(btrim(new.school_name))
      and learner.role='learner' and learner.account_status='active'
      and public.studyspace_group_peer_eligible(learner.id)
    on conflict(group_id,learner_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists studyspace_seed_classroom_members on public.studyspace_groups;
create trigger studyspace_seed_classroom_members
after insert on public.studyspace_groups
for each row execute function public.seed_studyspace_classroom_members();

create or replace function public.studyspace_group_membership_sync()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op='DELETE' then
    update public.studyspace_group_members set membership_status='removed',updated_at=now()
    where learner_id=old.learner_id and group_id in (
      select id from public.studyspace_groups where group_type='classroom' and timetable_entry_id=old.entry_id
    );
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists studyspace_remove_classroom_member on public.teacher_timetable_members;
create trigger studyspace_remove_classroom_member
after delete on public.teacher_timetable_members
for each row execute function public.studyspace_group_membership_sync();

-- Group attachments share the same private bucket and participant gate.
drop policy if exists studyspace_group_attachment_read on storage.objects;
create policy studyspace_group_attachment_read on storage.objects
for select to authenticated using (
  bucket_id='studyspace-direct-messages'
  and exists (
    select 1 from public.studyspace_group_messages gm
    where gm.attachment_path=storage.objects.name
      and public.is_studyspace_group_member(gm.group_id,(select auth.uid()))
  )
);

alter table public.direct_messages replica identity full;
alter table public.studyspace_groups replica identity full;
alter table public.studyspace_group_members replica identity full;
alter table public.studyspace_group_invites replica identity full;
alter table public.studyspace_group_messages replica identity full;
alter table public.studyspace_group_message_receipts replica identity full;
alter table public.studyspace_user_presence replica identity full;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='studyspace_groups') then alter publication supabase_realtime add table public.studyspace_groups; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='studyspace_group_members') then alter publication supabase_realtime add table public.studyspace_group_members; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='studyspace_group_invites') then alter publication supabase_realtime add table public.studyspace_group_invites; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='studyspace_group_messages') then alter publication supabase_realtime add table public.studyspace_group_messages; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='studyspace_group_message_receipts') then alter publication supabase_realtime add table public.studyspace_group_message_receipts; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='studyspace_user_presence') then alter publication supabase_realtime add table public.studyspace_user_presence; end if;
end $$;
