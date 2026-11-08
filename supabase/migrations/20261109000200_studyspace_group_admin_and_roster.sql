drop policy if exists studyspace_group_messages_view on public.studyspace_group_messages;
create policy studyspace_group_messages_view on public.studyspace_group_messages
for select to authenticated
using (
  public.is_studyspace_admin()
  or (
    public.is_studyspace_group_member(group_id,(select auth.uid()))
    and public.studyspace_group_peer_eligible((select auth.uid()))
  )
);

drop policy if exists studyspace_group_messages_send on public.studyspace_group_messages;
create policy studyspace_group_messages_send on public.studyspace_group_messages
for insert to authenticated
with check (
  sender_id=(select auth.uid())
  and (
    public.is_studyspace_admin()
    or (
      public.is_studyspace_group_member(group_id,(select auth.uid()))
      and public.studyspace_group_peer_eligible((select auth.uid()))
    )
  )
  and ((char_length(btrim(body)) between 1 and 2000) or attachment_path is not null)
  and (body='' or array_length(regexp_split_to_array(btrim(body),'\s+'),1)<=350)
  and (attachment_path is null or split_part(attachment_path,'/',1)=(select auth.uid())::text)
);

drop policy if exists studyspace_group_attachment_read on storage.objects;
create policy studyspace_group_attachment_read on storage.objects
for select to authenticated using (
  bucket_id='studyspace-direct-messages'
  and exists (
    select 1 from public.studyspace_group_messages gm
    where gm.attachment_path=storage.objects.name
      and (
        public.is_studyspace_admin()
        or public.is_studyspace_group_member(gm.group_id,(select auth.uid()))
      )
  )
);

create or replace function public.get_studyspace_group_members(p_group_id uuid)
returns table(user_id uuid,display_name text,grade text,last_seen_at timestamptz)
language plpgsql stable security definer
set search_path=public,pg_temp
as $$
begin
  if not public.is_studyspace_admin()
    and not public.is_studyspace_group_member(p_group_id,(select auth.uid())) then
    raise exception 'You are not a member of this group';
  end if;
  return query
  select p.id,
    coalesce(nullif(btrim(p.preferred_name),''),nullif(btrim(p.full_name),''),'Student'),
    coalesce(p.grade,''),
    up.last_seen_at
  from public.studyspace_group_members gm
  join public.profiles p on p.id=gm.learner_id
  left join public.studyspace_user_presence up on up.user_id=p.id
  where gm.group_id=p_group_id and gm.membership_status='active'
  order by p.preferred_name,p.full_name;
end;
$$;
revoke all on function public.get_studyspace_group_members(uuid) from public,anon;
grant execute on function public.get_studyspace_group_members(uuid) to authenticated;
