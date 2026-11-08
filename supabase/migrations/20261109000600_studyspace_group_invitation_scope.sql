create or replace function public.studyspace_guardian_classroom_sync_trigger()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp
as $$
begin
 if tg_op='DELETE' then
   perform public.sync_studyspace_classroom_members_for_learner(old.learner_id);
   return old;
 else
   perform public.sync_studyspace_classroom_members_for_learner(new.learner_id);
   return new;
 end if;
end;
$$;
revoke all on function public.studyspace_guardian_classroom_sync_trigger() from public,anon,authenticated;

create or replace function public.invite_studyspace_group_member(p_group_id uuid,p_invitee uuid)
returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_id uuid; g public.studyspace_groups%rowtype; p public.profiles%rowtype;
begin
 if not public.is_studyspace_admin()
   and not public.is_studyspace_group_member(p_group_id,(select auth.uid())) then
   raise exception 'You must be a group member to invite someone';
 end if;
 select * into g from public.studyspace_groups where id=p_group_id and is_active;
 if not found or g.group_type='classroom' then raise exception 'Classroom membership is assigned automatically by school and grade'; end if;
 select * into p from public.profiles where id=p_invitee and role='learner' and account_status='active';
 if not found then raise exception 'Learner not found'; end if;
 if not public.studyspace_group_peer_eligible(p_invitee) then raise exception 'Guardian approval is required for the invited learner'; end if;
 if not public.is_studyspace_admin() and not public.studyspace_group_peer_eligible((select auth.uid())) then
   raise exception 'Guardian approval is required for you to invite group members';
 end if;
 if g.group_type='school' and lower(btrim(g.school_name))<>lower(btrim(p.institution)) then
   raise exception 'This learner does not belong to the school group';
 end if;
 if g.group_type='level' and (lower(btrim(g.education_level))<>lower(btrim(p.education_level))
   or (g.grade<>'' and lower(btrim(g.grade))<>lower(btrim(p.grade)))) then
   raise exception 'This learner does not match the level group';
 end if;
 insert into public.studyspace_group_invites(group_id,inviter_id,invitee_id)
 values(p_group_id,(select auth.uid()),p_invitee)
 on conflict(group_id,invitee_id) do update set inviter_id=excluded.inviter_id,status='pending',responded_at=null
 returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.invite_studyspace_group_member(uuid,uuid) from public,anon;
grant execute on function public.invite_studyspace_group_member(uuid,uuid) to authenticated;

create or replace function public.respond_studyspace_group_invite(p_invite_id uuid,p_accept boolean)
returns void
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v public.studyspace_group_invites%rowtype; g public.studyspace_groups%rowtype; p public.profiles%rowtype;
begin
 select * into v from public.studyspace_group_invites where id=p_invite_id and invitee_id=(select auth.uid()) and status='pending' for update;
 if not found then raise exception 'Invitation is no longer available'; end if;
 select * into g from public.studyspace_groups where id=v.group_id and is_active;
 if not found or g.group_type='classroom' then raise exception 'Classroom membership is assigned automatically by school and grade'; end if;
 select * into p from public.profiles where id=(select auth.uid());
 if p_accept then
   if not public.studyspace_group_peer_eligible((select auth.uid())) then raise exception 'Guardian approval is required before joining student group chats'; end if;
   if g.group_type='school' and lower(btrim(g.school_name))<>lower(btrim(p.institution)) then raise exception 'This invitation is not for your school'; end if;
   if g.group_type='level' and (lower(btrim(g.education_level))<>lower(btrim(p.education_level))
     or (g.grade<>'' and lower(btrim(g.grade))<>lower(btrim(p.grade)))) then raise exception 'This invitation is not for your study level'; end if;
 end if;
 update public.studyspace_group_invites set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now() where id=p_invite_id;
 if p_accept then
   insert into public.studyspace_group_members(group_id,learner_id,membership_status,membership_source,joined_at)
   values(v.group_id,(select auth.uid()),'active','invite',now())
   on conflict(group_id,learner_id) do update set membership_status='active',membership_source='invite',joined_at=now(),updated_at=now();
 end if;
end;
$$;
revoke all on function public.respond_studyspace_group_invite(uuid,boolean) from public,anon;
grant execute on function public.respond_studyspace_group_invite(uuid,boolean) to authenticated;
