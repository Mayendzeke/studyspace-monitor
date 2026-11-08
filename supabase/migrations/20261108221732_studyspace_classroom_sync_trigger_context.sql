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
     and public.studyspace_peer_chat_eligible(p_learner)
     and lower(btrim(p.institution))=lower(btrim(g.school_name))
     and g.grade<>'' and lower(btrim(p.grade))=lower(btrim(g.grade))
     and (g.education_level='' or lower(btrim(p.education_level))=lower(btrim(g.education_level)))
   );

 if p.role='learner' and p.account_status='active' and public.studyspace_peer_chat_eligible(p_learner) then
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
