create or replace function public.can_view_studyspace_group(p_group_id uuid)
returns boolean
language sql stable security definer
set search_path=public,pg_temp
as $$
 select public.is_studyspace_admin()
 or exists (
   select 1 from public.studyspace_groups g
   where g.id=p_group_id and g.is_active
     and (
       public.is_studyspace_group_member(g.id,(select auth.uid()))
       or exists(select 1 from public.studyspace_group_invites i
         where i.group_id=g.id and i.invitee_id=(select auth.uid()) and i.status='pending')
     )
 )
 or exists (
   select 1 from public.studyspace_groups g
   join public.profiles me on me.id=(select auth.uid())
   where g.id=p_group_id and g.is_active and g.discoverable
     and me.role='learner' and me.account_status='active'
     and (
       (g.group_type='school' and lower(btrim(g.school_name))=lower(btrim(me.institution)))
       or (g.group_type='level' and lower(btrim(g.education_level))=lower(btrim(me.education_level))
         and (g.grade='' or lower(btrim(g.grade))=lower(btrim(me.grade))))
     )
 );
$$;
revoke all on function public.can_view_studyspace_group(uuid) from public,anon;
grant execute on function public.can_view_studyspace_group(uuid) to authenticated;
