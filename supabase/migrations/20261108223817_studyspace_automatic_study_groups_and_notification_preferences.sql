-- Automatic subject/course study groups and per-user notification controls.
alter table public.studyspace_groups
  add column if not exists group_match_key text not null default '',
  add column if not exists group_topic text not null default '';

alter table public.studyspace_groups
  drop constraint if exists studyspace_groups_group_type_check;
alter table public.studyspace_groups
  add constraint studyspace_groups_group_type_check
  check (group_type in ('classroom','school','level','custom','subject','course'));

create unique index if not exists studyspace_groups_auto_match_active_idx
  on public.studyspace_groups(group_type,group_match_key)
  where is_active and group_type in ('subject','course');
create index if not exists studyspace_groups_auto_topic_idx
  on public.studyspace_groups(group_type,lower(group_topic),education_level,grade)
  where is_active and group_type in ('subject','course');

alter table public.studyspace_group_members
  drop constraint if exists studyspace_group_members_membership_source_check;
alter table public.studyspace_group_members
  add constraint studyspace_group_members_membership_source_check
  check (membership_source in ('class_auto','request','invite','admin','auto_match'));

create table if not exists public.studyspace_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  master_enabled boolean not null default true,
  direct_messages boolean not null default true,
  group_messages boolean not null default true,
  group_activity boolean not null default true,
  homework_assignments boolean not null default true,
  assessment_updates boolean not null default true,
  timetable_updates boolean not null default true,
  study_reminders boolean not null default true,
  system_announcements boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  updated_at timestamptz not null default now()
);
alter table public.studyspace_notification_preferences enable row level security;
revoke all on public.studyspace_notification_preferences from public,anon;
grant select,insert,update on public.studyspace_notification_preferences to authenticated;
drop policy if exists studyspace_notification_preferences_select_own on public.studyspace_notification_preferences;
create policy studyspace_notification_preferences_select_own
  on public.studyspace_notification_preferences for select to authenticated
  using (user_id=(select auth.uid()));
drop policy if exists studyspace_notification_preferences_insert_own on public.studyspace_notification_preferences;
create policy studyspace_notification_preferences_insert_own
  on public.studyspace_notification_preferences for insert to authenticated
  with check (user_id=(select auth.uid()));
drop policy if exists studyspace_notification_preferences_update_own on public.studyspace_notification_preferences;
create policy studyspace_notification_preferences_update_own
  on public.studyspace_notification_preferences for update to authenticated
  using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));

create or replace function public.sync_studyspace_auto_groups_for_learner(p_learner uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  me public.profiles%rowtype;
  s record;
  v_key text;
  v_group uuid;
  v_expected text[] := array[]::text[];
begin
  select * into me from public.profiles where id=p_learner;
  if not found then return; end if;

  if me.role='learner' and me.account_status='active'
     and public.studyspace_peer_chat_eligible(p_learner) then

    -- Subject cohort: country, education level, grade, curriculum,
    -- academic year and subject must match. Institutions may differ.
    for s in
      select lower(btrim(ss.name)) as topic_key,
             min(btrim(ss.name)) as topic_name,
             me.country,me.education_level,me.grade,me.curriculum,me.academic_year
      from public.student_subjects ss
      where ss.learner_id=p_learner and btrim(ss.name)<>''
      group by lower(btrim(ss.name))
      having (
        select count(distinct p2.id)
        from public.profiles p2
        join public.student_subjects ss2 on ss2.learner_id=p2.id
        where p2.role='learner' and p2.account_status='active'
          and public.studyspace_peer_chat_eligible(p2.id)
          and lower(btrim(coalesce(p2.country,'')))=lower(btrim(coalesce(me.country,'')))
          and lower(btrim(coalesce(p2.education_level,'')))=lower(btrim(coalesce(me.education_level,'')))
          and lower(btrim(coalesce(p2.grade,'')))=lower(btrim(coalesce(me.grade,'')))
          and lower(btrim(coalesce(p2.curriculum,'')))=lower(btrim(coalesce(me.curriculum,'')))
          and lower(btrim(coalesce(p2.academic_year,'')))=lower(btrim(coalesce(me.academic_year,'')))
          and lower(btrim(ss2.name))=lower(btrim(ss.name))
      ) >= 2
    loop
      v_key:=md5(concat_ws(chr(31),'subject',
        lower(btrim(coalesce(s.country,''))),
        lower(btrim(coalesce(s.education_level,''))),
        lower(btrim(coalesce(s.grade,''))),
        lower(btrim(coalesce(s.curriculum,''))),
        lower(btrim(coalesce(s.academic_year,''))),
        s.topic_key
      ));
      v_expected:=array_append(v_expected,'subject:'||v_key);

      insert into public.studyspace_groups(
        group_type,name,description,created_by,school_name,education_level,grade,
        timetable_entry_id,discoverable,is_active,group_match_key,group_topic
      )
      values(
        'subject',
        btrim(concat_ws(' ',coalesce(nullif(btrim(s.grade),''),nullif(btrim(s.education_level),''),'Study'),s.topic_name)),
        'Automatically created for students who share this subject, study level, grade, curriculum and academic year.',
        p_learner,'',coalesce(s.education_level,''),coalesce(s.grade,''),
        null,true,true,v_key,s.topic_name
      )
      on conflict (group_type,group_match_key)
        where is_active and group_type in ('subject','course')
      do update set is_active=true,updated_at=now()
      returning id into v_group;

      insert into public.studyspace_group_members(
        group_id,learner_id,membership_status,membership_source,joined_at
      )
      select v_group,p2.id,'active','auto_match',now()
      from public.profiles p2
      where p2.role='learner' and p2.account_status='active'
        and public.studyspace_peer_chat_eligible(p2.id)
        and lower(btrim(coalesce(p2.country,'')))=lower(btrim(coalesce(s.country,'')))
        and lower(btrim(coalesce(p2.education_level,'')))=lower(btrim(coalesce(s.education_level,'')))
        and lower(btrim(coalesce(p2.grade,'')))=lower(btrim(coalesce(s.grade,'')))
        and lower(btrim(coalesce(p2.curriculum,'')))=lower(btrim(coalesce(s.curriculum,'')))
        and lower(btrim(coalesce(p2.academic_year,'')))=lower(btrim(coalesce(s.academic_year,'')))
        and exists(
          select 1 from public.student_subjects ss2
          where ss2.learner_id=p2.id and lower(btrim(ss2.name))=s.topic_key
        )
      on conflict(group_id,learner_id) do update
        set membership_status='active',membership_source='auto_match',
            joined_at=coalesce(public.studyspace_group_members.joined_at,now()),
            updated_at=now();
    end loop;

    -- Course cohorts share country, education level, course and academic year.
    if btrim(coalesce(me.course,''))<>'' then
      v_key:=md5(concat_ws(chr(31),'course',
        lower(btrim(coalesce(me.country,''))),
        lower(btrim(coalesce(me.education_level,''))),
        lower(btrim(coalesce(me.course,''))),
        lower(btrim(coalesce(me.academic_year,'')))
      ));
      if (
        select count(distinct p2.id)
        from public.profiles p2
        where p2.role='learner' and p2.account_status='active'
          and public.studyspace_peer_chat_eligible(p2.id)
          and lower(btrim(coalesce(p2.country,'')))=lower(btrim(coalesce(me.country,'')))
          and lower(btrim(coalesce(p2.education_level,'')))=lower(btrim(coalesce(me.education_level,'')))
          and lower(btrim(coalesce(p2.course,'')))=lower(btrim(coalesce(me.course,'')))
          and lower(btrim(coalesce(p2.academic_year,'')))=lower(btrim(coalesce(me.academic_year,'')))
      ) >= 2 then
        v_expected:=array_append(v_expected,'course:'||v_key);
        insert into public.studyspace_groups(
          group_type,name,description,created_by,school_name,education_level,grade,
          timetable_entry_id,discoverable,is_active,group_match_key,group_topic
        )
        values(
          'course',btrim(me.course)||' Group',
          'Automatically created for students who share this course, study level and academic year.',
          p_learner,'',coalesce(me.education_level,''),'',
          null,true,true,v_key,btrim(me.course)
        )
        on conflict (group_type,group_match_key)
          where is_active and group_type in ('subject','course')
        do update set is_active=true,updated_at=now()
        returning id into v_group;

        insert into public.studyspace_group_members(
          group_id,learner_id,membership_status,membership_source,joined_at
        )
        select v_group,p2.id,'active','auto_match',now()
        from public.profiles p2
        where p2.role='learner' and p2.account_status='active'
          and public.studyspace_peer_chat_eligible(p2.id)
          and lower(btrim(coalesce(p2.country,'')))=lower(btrim(coalesce(me.country,'')))
          and lower(btrim(coalesce(p2.education_level,'')))=lower(btrim(coalesce(me.education_level,'')))
          and lower(btrim(coalesce(p2.course,'')))=lower(btrim(coalesce(me.course,'')))
          and lower(btrim(coalesce(p2.academic_year,'')))=lower(btrim(coalesce(me.academic_year,'')))
        on conflict(group_id,learner_id) do update
          set membership_status='active',membership_source='auto_match',
              joined_at=coalesce(public.studyspace_group_members.joined_at,now()),
              updated_at=now();
      end if;
    end if;
  end if;

  update public.studyspace_group_members gm
    set membership_status='removed',updated_at=now()
  from public.studyspace_groups g
  where gm.group_id=g.id and gm.learner_id=p_learner
    and gm.membership_source='auto_match'
    and g.group_type in ('subject','course')
    and not ((g.group_type||':'||g.group_match_key)=any(v_expected));

  with underfilled as (
    select g.id
    from public.studyspace_groups g
    where g.is_active and g.group_type in ('subject','course')
      and (
        select count(distinct gm.learner_id)
        from public.studyspace_group_members gm
        join public.profiles p2 on p2.id=gm.learner_id
        where gm.group_id=g.id and gm.membership_status='active'
          and p2.role='learner' and p2.account_status='active'
          and public.studyspace_peer_chat_eligible(p2.id)
      ) < 2
  )
  update public.studyspace_groups g
    set is_active=false,updated_at=now()
  where g.id in (select id from underfilled);

  update public.studyspace_group_members gm
    set membership_status='removed',updated_at=now()
  from public.studyspace_groups g
  where gm.group_id=g.id and not g.is_active
    and g.group_type in ('subject','course')
    and gm.membership_status='active'
    and gm.membership_source='auto_match';
end;
$$;
revoke all on function public.sync_studyspace_auto_groups_for_learner(uuid) from public,anon,authenticated;

create or replace function public.studyspace_profile_classroom_sync_trigger()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp
as $$
begin
  perform public.sync_studyspace_classroom_members_for_learner(new.id);
  perform public.sync_studyspace_auto_groups_for_learner(new.id);
  return new;
end;
$$;
revoke all on function public.studyspace_profile_classroom_sync_trigger() from public,anon,authenticated;

drop trigger if exists studyspace_profile_classroom_sync on public.profiles;
create trigger studyspace_profile_classroom_sync
after insert or update of institution,education_level,grade,role,account_status,country,curriculum,academic_year,course
on public.profiles
for each row execute function public.studyspace_profile_classroom_sync_trigger();

create or replace function public.studyspace_guardian_classroom_sync_trigger()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_learner uuid;
begin
  if tg_op='DELETE' then v_learner:=old.learner_id; else v_learner:=new.learner_id; end if;
  perform public.sync_studyspace_classroom_members_for_learner(v_learner);
  perform public.sync_studyspace_auto_groups_for_learner(v_learner);
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.studyspace_guardian_classroom_sync_trigger() from public,anon,authenticated;

create or replace function public.studyspace_subject_auto_group_sync_trigger()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp
as $$
begin
  if tg_op='DELETE' then
    perform public.sync_studyspace_auto_groups_for_learner(old.learner_id);
    return old;
  elsif tg_op='UPDATE' then
    if old.learner_id is distinct from new.learner_id then
      perform public.sync_studyspace_auto_groups_for_learner(old.learner_id);
    end if;
    perform public.sync_studyspace_auto_groups_for_learner(new.learner_id);
    return new;
  else
    perform public.sync_studyspace_auto_groups_for_learner(new.learner_id);
    return new;
  end if;
end;
$$;
revoke all on function public.studyspace_subject_auto_group_sync_trigger() from public,anon,authenticated;

drop trigger if exists studyspace_subject_auto_group_sync on public.student_subjects;
create trigger studyspace_subject_auto_group_sync
after insert or update or delete on public.student_subjects
for each row execute function public.studyspace_subject_auto_group_sync_trigger();

create or replace function public.admin_add_studyspace_group_member(p_group_id uuid,p_learner_id uuid)
returns void
language plpgsql
security definer
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

do $$
declare r record;
begin
  for r in
    select id from public.profiles
    where role='learner' and account_status='active'
      and (coalesce(btrim(course),'')<>'' or exists(
        select 1 from public.student_subjects ss where ss.learner_id=profiles.id
      ))
  loop
    perform public.sync_studyspace_auto_groups_for_learner(r.id);
  end loop;
end;
$$;
