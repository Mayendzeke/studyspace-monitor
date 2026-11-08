-- Prevent learners and group members from manually joining, inviting into,
-- or accepting invitations to classroom, subject and course auto-groups.
create or replace function public.request_studyspace_group_join(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare g public.studyspace_groups%rowtype; me public.profiles%rowtype;
begin
  if not public.is_active_studyspace_learner() then raise exception 'An active student account is required'; end if;
  if not public.studyspace_group_peer_eligible((select auth.uid())) then raise exception 'Guardian approval is required before joining student group chats'; end if;
  select * into g from public.studyspace_groups where id=p_group_id and is_active and discoverable;
  if not found then raise exception 'This group is not available to join'; end if;
  select * into me from public.profiles where id=(select auth.uid());
  if g.group_type in ('classroom','subject','course') then
    raise exception 'Membership in this classroom or automatic study group is assigned by StudySpace';
  end if;
  if g.group_type='school' and lower(btrim(g.school_name))<>lower(btrim(me.institution)) then
    raise exception 'This school group is only for learners at that school';
  end if;
  if g.group_type='level' and (
    lower(btrim(g.education_level))<>lower(btrim(me.education_level))
    or (g.grade<>'' and lower(btrim(g.grade))<>lower(btrim(me.grade)))
  ) then raise exception 'This group is for a different study level'; end if;
  insert into public.studyspace_group_members(group_id,learner_id,membership_status,membership_source)
  values(p_group_id,(select auth.uid()),'pending','request')
  on conflict(group_id,learner_id) do update set
    membership_status=case when public.studyspace_group_members.membership_status in ('declined','removed') then 'pending' else public.studyspace_group_members.membership_status end,
    membership_source=case when public.studyspace_group_members.membership_status in ('declined','removed') then 'request' else public.studyspace_group_members.membership_source end,
    updated_at=now();
  return 'pending';
end;
$$;

create or replace function public.invite_studyspace_group_member(p_group_id uuid,p_invitee uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid; g public.studyspace_groups%rowtype; p public.profiles%rowtype;
begin
  if not public.is_studyspace_admin()
     and not public.is_studyspace_group_member(p_group_id,(select auth.uid())) then
    raise exception 'You must be a group member to invite someone';
  end if;
  select * into g from public.studyspace_groups where id=p_group_id and is_active;
  if not found or g.group_type in ('classroom','subject','course') then
    raise exception 'Membership in this classroom or automatic study group is assigned by StudySpace';
  end if;
  select * into p from public.profiles where id=p_invitee and role='learner' and account_status='active';
  if not found then raise exception 'Learner not found'; end if;
  if not public.studyspace_peer_chat_eligible(p_invitee) then raise exception 'Guardian approval is required for the invited learner'; end if;
  if not public.is_studyspace_admin() and not public.studyspace_group_peer_eligible((select auth.uid())) then
    raise exception 'Guardian approval is required for you to invite group members';
  end if;
  if g.group_type='school' and lower(btrim(g.school_name))<>lower(btrim(p.institution)) then
    raise exception 'This learner does not belong to the school group';
  end if;
  if g.group_type='level' and (
    lower(btrim(g.education_level))<>lower(btrim(p.education_level))
    or (g.grade<>'' and lower(btrim(g.grade))<>lower(btrim(p.grade)))
  ) then raise exception 'This learner does not match the level group'; end if;
  insert into public.studyspace_group_invites(group_id,inviter_id,invitee_id)
  values(p_group_id,(select auth.uid()),p_invitee)
  on conflict(group_id,invitee_id) do update
    set inviter_id=excluded.inviter_id,status='pending',responded_at=null
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.respond_studyspace_group_invite(p_invite_id uuid,p_accept boolean)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v public.studyspace_group_invites%rowtype; g public.studyspace_groups%rowtype; p public.profiles%rowtype;
begin
  select * into v from public.studyspace_group_invites
  where id=p_invite_id and invitee_id=(select auth.uid()) and status='pending'
  for update;
  if not found then raise exception 'Invitation is no longer available'; end if;
  select * into g from public.studyspace_groups where id=v.group_id and is_active;
  if not found or g.group_type in ('classroom','subject','course') then
    raise exception 'Membership in this classroom or automatic study group is assigned by StudySpace';
  end if;
  select * into p from public.profiles where id=(select auth.uid());
  if p_accept then
    if not public.studyspace_group_peer_eligible((select auth.uid())) then
      raise exception 'Guardian approval is required before joining student group chats';
    end if;
    if g.group_type='school' and lower(btrim(g.school_name))<>lower(btrim(p.institution)) then
      raise exception 'This invitation is not for your school';
    end if;
    if g.group_type='level' and (
      lower(btrim(g.education_level))<>lower(btrim(p.education_level))
      or (g.grade<>'' and lower(btrim(g.grade))<>lower(btrim(p.grade)))
    ) then raise exception 'This invitation is not for your study level'; end if;
  end if;
  update public.studyspace_group_invites
    set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now()
    where id=p_invite_id;
  if p_accept then
    insert into public.studyspace_group_members(group_id,learner_id,membership_status,membership_source,joined_at)
    values(v.group_id,(select auth.uid()),'active','invite',now())
    on conflict(group_id,learner_id) do update
      set membership_status='active',membership_source='invite',joined_at=now(),updated_at=now();
  end if;
end;
$$;
