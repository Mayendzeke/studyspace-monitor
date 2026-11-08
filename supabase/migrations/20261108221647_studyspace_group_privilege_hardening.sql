-- Remove broad default grants that bypass row-level controls (TRUNCATE is not RLS protected).
revoke all on public.direct_messages,public.studyspace_groups,public.studyspace_group_members,
 public.studyspace_group_invites,public.studyspace_group_messages,
 public.studyspace_group_message_receipts,public.studyspace_user_presence
from anon,authenticated;

grant select,insert on public.direct_messages to authenticated;
grant update(read_at,delivered_at) on public.direct_messages to authenticated;

grant select,insert,update,delete on public.studyspace_groups to authenticated;
grant select,insert,update,delete on public.studyspace_group_members to authenticated;
grant select,insert on public.studyspace_group_invites to authenticated;
grant update(status,responded_at) on public.studyspace_group_invites to authenticated;
grant select,insert on public.studyspace_group_messages to authenticated;
grant select,insert on public.studyspace_group_message_receipts to authenticated;
grant update(delivered_at,read_at) on public.studyspace_group_message_receipts to authenticated;
grant select,insert on public.studyspace_user_presence to authenticated;
grant update(last_seen_at,updated_at) on public.studyspace_user_presence to authenticated;

-- Trigger-only functions must not be callable through PostgREST RPC.
drop trigger if exists studyspace_remove_classroom_member on public.teacher_timetable_members;
drop function if exists public.studyspace_group_membership_sync();
revoke all on function public.studyspace_seed_classroom_members() from public,anon,authenticated;
revoke all on function public.seed_studyspace_classroom_members() from public,anon,authenticated;
revoke all on function public.studyspace_profile_classroom_sync_trigger() from public,anon,authenticated;
revoke all on function public.studyspace_guardian_classroom_sync_trigger() from public,anon,authenticated;
revoke all on function public.search_studyspace_learners(text) from public,anon;
grant execute on function public.search_studyspace_learners(text) to authenticated;

create or replace function public.is_studyspace_group_member(p_group_id uuid,p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path=public,pg_temp
as $$
 select (p_user_id=(select auth.uid()) or public.is_studyspace_admin())
   and exists(select 1 from public.studyspace_group_members gm
     where gm.group_id=p_group_id and gm.learner_id=p_user_id and gm.membership_status='active');
$$;
revoke all on function public.is_studyspace_group_member(uuid,uuid) from public,anon;
grant execute on function public.is_studyspace_group_member(uuid,uuid) to authenticated;

create or replace function public.studyspace_group_peer_eligible(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path=public,pg_temp
as $$
 select (p_user_id=(select auth.uid()) or public.is_studyspace_admin())
   and public.studyspace_peer_chat_eligible(p_user_id);
$$;
revoke all on function public.studyspace_group_peer_eligible(uuid) from public,anon;
grant execute on function public.studyspace_group_peer_eligible(uuid) to authenticated;

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
 if not public.studyspace_peer_chat_eligible(p_invitee) then raise exception 'Guardian approval is required for the invited learner'; end if;
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
