-- A classroom is based on the teacher-created timetable class, school and grade.
-- Matching learners are added automatically only when peer-chat consent is valid.

create or replace function public.sync_studyspace_classroom_members_for_learner(p_learner uuid)
returns void
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare p public.profiles%rowtype;
begin
 select * into p from public.profiles where id=p_learner;
 if not found then return; end if;

 update public.studyspace_group_members gm
 set membership_status='removed',updated_at=now()
 from public.studyspace_groups g
 where gm.group_id=g.id and gm.learner_id=p_learner and g.group_type='classroom'
   and not (
     p.role='learner' and p.account_status='active'
     and public.studyspace_group_peer_eligible(p_learner)
     and lower(btrim(p.institution))=lower(btrim(g.school_name))
     and g.grade<>'' and lower(btrim(p.grade))=lower(btrim(g.grade))
     and (g.education_level='' or lower(btrim(p.education_level))=lower(btrim(g.education_level)))
   );

 if p.role='learner' and p.account_status='active' and public.studyspace_group_peer_eligible(p_learner) then
   insert into public.studyspace_group_members(group_id,learner_id,membership_status,membership_source,joined_at)
   select g.id,p_learner,'active','class_auto',now()
   from public.studyspace_groups g
   where g.group_type='classroom' and g.is_active
     and lower(btrim(p.institution))=lower(btrim(g.school_name))
     and g.grade<>'' and lower(btrim(p.grade))=lower(btrim(g.grade))
     and (g.education_level='' or lower(btrim(p.education_level))=lower(btrim(g.education_level)))
   on conflict(group_id,learner_id) do update
     set membership_status='active',membership_source='class_auto',
         joined_at=coalesce(public.studyspace_group_members.joined_at,now()),updated_at=now();
 end if;
end;
$$;
revoke all on function public.sync_studyspace_classroom_members_for_learner(uuid) from public,anon,authenticated;

create or replace function public.studyspace_profile_classroom_sync_trigger()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp
as $$
begin
 perform public.sync_studyspace_classroom_members_for_learner(new.id);
 return new;
end;
$$;
revoke all on function public.studyspace_profile_classroom_sync_trigger() from public,anon,authenticated;

drop trigger if exists studyspace_auto_classroom_member on public.teacher_timetable_members;
drop function if exists public.studyspace_auto_classroom_membership();
drop trigger if exists studyspace_seed_classroom_members on public.studyspace_groups;

create or replace function public.studyspace_seed_classroom_members()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare learner record;
begin
 if new.group_type='classroom' then
   if new.grade='' then raise exception 'A classroom group requires a grade'; end if;
   for learner in select id from public.profiles where role='learner' and account_status='active'
     and lower(btrim(institution))=lower(btrim(new.school_name))
     and lower(btrim(grade))=lower(btrim(new.grade))
     and (new.education_level='' or lower(btrim(education_level))=lower(btrim(new.education_level)))
   loop
     perform public.sync_studyspace_classroom_members_for_learner(learner.id);
   end loop;
 end if;
 return new;
end;
$$;
create trigger studyspace_seed_classroom_members
after insert on public.studyspace_groups
for each row execute function public.studyspace_seed_classroom_members();

drop trigger if exists studyspace_profile_classroom_sync on public.profiles;
create trigger studyspace_profile_classroom_sync
after insert or update of institution,education_level,grade,role,account_status on public.profiles
for each row execute function public.studyspace_profile_classroom_sync_trigger();

create or replace function public.studyspace_guardian_classroom_sync_trigger()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp
as $$
begin
 perform public.sync_studyspace_classroom_members_for_learner(coalesce(new.learner_id,old.learner_id));
 return coalesce(new,old);
end;
$$;
revoke all on function public.studyspace_guardian_classroom_sync_trigger() from public,anon,authenticated;
drop trigger if exists studyspace_guardian_classroom_sync on public.guardian_verifications;
create trigger studyspace_guardian_classroom_sync
after insert or update of approval_status,consent_given,verified_at or delete on public.guardian_verifications
for each row execute function public.studyspace_guardian_classroom_sync_trigger();

create or replace function public.invite_studyspace_group_member(p_group_id uuid,p_invitee uuid)
returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_id uuid; v_type text;
begin
 if not public.is_studyspace_admin()
   and not public.is_studyspace_group_member(p_group_id,(select auth.uid())) then
   raise exception 'You must be a group member to invite someone';
 end if;
 select group_type into v_type from public.studyspace_groups where id=p_group_id and is_active;
 if not found or v_type='classroom' then raise exception 'Classroom membership is assigned automatically by school and grade'; end if;
 if not public.studyspace_group_peer_eligible(p_invitee) then
   raise exception 'Guardian approval is required for the invited learner';
 end if;
 if not public.is_studyspace_admin() and not public.studyspace_group_peer_eligible((select auth.uid())) then
   raise exception 'Guardian approval is required for you to invite group members';
 end if;
 if not exists(select 1 from public.profiles where id=p_invitee and role='learner' and account_status='active') then
   raise exception 'Learner not found';
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
declare v public.studyspace_group_invites%rowtype; v_type text;
begin
 select * into v from public.studyspace_group_invites where id=p_invite_id and invitee_id=(select auth.uid()) and status='pending' for update;
 if not found then raise exception 'Invitation is no longer available'; end if;
 select group_type into v_type from public.studyspace_groups where id=v.group_id and is_active;
 if v_type='classroom' then raise exception 'Classroom membership is assigned automatically by school and grade'; end if;
 if p_accept and not public.studyspace_group_peer_eligible((select auth.uid())) then raise exception 'Guardian approval is required before joining student group chats'; end if;
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
