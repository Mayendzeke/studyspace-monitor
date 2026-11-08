-- Keep administrator-added learners within school/level group eligibility.
-- Custom groups remain the administrator-controlled option for mixed cohorts.
create or replace function public.admin_add_studyspace_group_member(p_group_id uuid,p_learner_id uuid)
returns void
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_group public.studyspace_groups%rowtype;
  v_learner public.profiles%rowtype;
begin
  if not public.is_studyspace_admin() then
    raise exception 'Only a StudySpace Monitor administrator can add members directly';
  end if;

  select * into v_group
  from public.studyspace_groups
  where id=p_group_id and is_active
  for update;
  if not found then raise exception 'This group is not active'; end if;

  if v_group.group_type in ('classroom','subject','course') then
    raise exception 'Members of this group are assigned automatically and cannot be added manually';
  end if;

  select * into v_learner
  from public.profiles
  where id=p_learner_id and role='learner' and account_status='active';
  if not found then raise exception 'Select an active student account'; end if;

  if not public.studyspace_peer_chat_eligible(p_learner_id) then
    raise exception 'Guardian approval is required before adding this student to a group chat';
  end if;

  if v_group.group_type='school'
     and lower(btrim(coalesce(v_group.school_name,'')))<>lower(btrim(coalesce(v_learner.institution,''))) then
    raise exception 'This student does not belong to the school assigned to this group';
  end if;

  if v_group.group_type='level' and (
    lower(btrim(coalesce(v_group.education_level,'')))<>lower(btrim(coalesce(v_learner.education_level,'')))
    or (coalesce(v_group.grade,'')<>'' and
      lower(btrim(v_group.grade))<>lower(btrim(coalesce(v_learner.grade,''))))
  ) then
    raise exception 'This student does not match the study level or grade assigned to this group';
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
