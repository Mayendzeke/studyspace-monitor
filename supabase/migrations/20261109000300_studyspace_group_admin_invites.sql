drop policy if exists studyspace_group_invites_send on public.studyspace_group_invites;
create policy studyspace_group_invites_send on public.studyspace_group_invites
for insert to authenticated
with check (
  inviter_id=(select auth.uid())
  and (
    public.is_studyspace_admin()
    or public.is_studyspace_group_member(group_id,(select auth.uid()))
  )
  and public.studyspace_group_peer_eligible((select auth.uid()))
  and public.studyspace_group_peer_eligible(invitee_id)
  and exists(select 1 from public.profiles p where p.id=invitee_id and p.role='learner' and p.account_status='active')
);

create or replace function public.invite_studyspace_group_member(p_group_id uuid,p_invitee uuid)
returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
 if not public.is_studyspace_admin()
   and not public.is_studyspace_group_member(p_group_id,(select auth.uid())) then
   raise exception 'You must be a group member to invite someone';
 end if;
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
