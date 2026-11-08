-- Supporting indexes for automatic group lookups and notification preference cleanup.
create index if not exists studyspace_group_notification_preferences_group_id_idx
  on public.studyspace_group_notification_preferences(group_id);
create index if not exists studyspace_groups_timetable_entry_id_idx
  on public.studyspace_groups(timetable_entry_id)
  where timetable_entry_id is not null;

-- The RPC checks admin status explicitly; RLS remains authoritative for the
-- group and membership reads/writes performed under the caller's privileges.
create or replace function public.admin_add_studyspace_group_member(p_group_id uuid,p_learner_id uuid)
returns void
language plpgsql
set search_path=public,pg_temp
as $$
declare v_group public.studyspace_groups%rowtype;
begin
  if not public.is_studyspace_admin() then
    raise exception 'Only a StudySpace Monitor administrator can add members directly';
  end if;
  select * into v_group from public.studyspace_groups where id=p_group_id and is_active for update;
  if not found then raise exception 'This group is not active'; end if;
  if v_group.group_type in ('classroom','subject','course') then
    raise exception 'Members of this group are assigned automatically and cannot be added manually';
  end if;
  if not exists(
    select 1 from public.profiles
    where id=p_learner_id and role='learner' and account_status='active'
  ) then raise exception 'Select an active student account'; end if;
  if not public.studyspace_peer_chat_eligible(p_learner_id) then
    raise exception 'Guardian approval is required before adding this student to a group chat';
  end if;
  insert into public.studyspace_group_members(
    group_id,learner_id,membership_status,membership_source,joined_at
  ) values(p_group_id,p_learner_id,'active','admin',now())
  on conflict(group_id,learner_id) do update
    set membership_status='active',membership_source='admin',
        joined_at=coalesce(public.studyspace_group_members.joined_at,now()),
        updated_at=now();
end;
$$;
revoke all on function public.admin_add_studyspace_group_member(uuid,uuid) from public,anon;
grant execute on function public.admin_add_studyspace_group_member(uuid,uuid) to authenticated;
