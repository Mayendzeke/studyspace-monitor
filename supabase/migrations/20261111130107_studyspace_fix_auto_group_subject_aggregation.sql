create or replace function public.sync_studyspace_auto_groups_for_learner(p_learner uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  me public.profiles%rowtype;
  s record;
  v_key text;
  v_group uuid;
  v_expected text[] := array[]::text[];
begin
  select * into me from public.profiles where id = p_learner;
  if not found then return; end if;

  if me.role = 'learner'
     and me.account_status = 'active'
     and private.studyspace_peer_chat_eligible(p_learner) then

    -- Subject groups match learners by subject and academic profile.
    for s in
      select lower(btrim(ss.name)) as topic_key,
             min(btrim(ss.name)) as topic_name,
             me.country,
             me.education_level,
             me.grade,
             me.curriculum,
             me.academic_year
      from public.student_subjects ss
      where ss.learner_id = p_learner
        and btrim(ss.name) <> ''
      group by
        lower(btrim(ss.name)),
        me.country,
        me.education_level,
        me.grade,
        me.curriculum,
        me.academic_year
      having (
        select count(distinct p2.id)
        from public.profiles p2
        join public.student_subjects ss2 on ss2.learner_id = p2.id
        where p2.role = 'learner'
          and p2.account_status = 'active'
          and private.studyspace_peer_chat_eligible(p2.id)
          and lower(btrim(coalesce(p2.country, ''))) = lower(btrim(coalesce(me.country, '')))
          and lower(btrim(coalesce(p2.education_level, ''))) = lower(btrim(coalesce(me.education_level, '')))
          and lower(btrim(coalesce(p2.grade, ''))) = lower(btrim(coalesce(me.grade, '')))
          and lower(btrim(coalesce(p2.curriculum, ''))) = lower(btrim(coalesce(me.curriculum, '')))
          and lower(btrim(coalesce(p2.academic_year, ''))) = lower(btrim(coalesce(me.academic_year, '')))
          and lower(btrim(ss2.name)) = lower(btrim(ss.name))
      ) >= 2
    loop
      v_key := md5(concat_ws(chr(31), 'subject',
        lower(btrim(coalesce(s.country, ''))),
        lower(btrim(coalesce(s.education_level, ''))),
        lower(btrim(coalesce(s.grade, ''))),
        lower(btrim(coalesce(s.curriculum, ''))),
        lower(btrim(coalesce(s.academic_year, ''))),
        s.topic_key
      ));
      v_expected := array_append(v_expected, 'subject:' || v_key);

      insert into public.studyspace_groups(
        group_type, name, description, created_by, school_name, education_level, grade,
        timetable_entry_id, discoverable, is_active, group_match_key, group_topic
      )
      values (
        'subject',
        btrim(concat_ws(' ',
          coalesce(nullif(btrim(s.grade), ''), nullif(btrim(s.education_level), ''), 'Study'),
          s.topic_name
        )),
        'Automatically created for students who share this subject, study level, grade, curriculum and academic year.',
        p_learner, '', coalesce(s.education_level, ''), coalesce(s.grade, ''),
        null, true, true, v_key, s.topic_name
      )
      on conflict (group_type, group_match_key)
        where is_active and group_type in ('subject', 'course')
      do update set is_active = true, updated_at = now()
      returning id into v_group;

      insert into public.studyspace_group_members(
        group_id, learner_id, membership_status, membership_source, joined_at
      )
      select v_group, p2.id, 'active', 'auto_match', now()
      from public.profiles p2
      where p2.role = 'learner'
        and p2.account_status = 'active'
        and private.studyspace_peer_chat_eligible(p2.id)
        and lower(btrim(coalesce(p2.country, ''))) = lower(btrim(coalesce(s.country, '')))
        and lower(btrim(coalesce(p2.education_level, ''))) = lower(btrim(coalesce(s.education_level, '')))
        and lower(btrim(coalesce(p2.grade, ''))) = lower(btrim(coalesce(s.grade, '')))
        and lower(btrim(coalesce(p2.curriculum, ''))) = lower(btrim(coalesce(s.curriculum, '')))
        and lower(btrim(coalesce(p2.academic_year, ''))) = lower(btrim(coalesce(s.academic_year, '')))
        and exists (
          select 1
          from public.student_subjects ss2
          where ss2.learner_id = p2.id
            and lower(btrim(ss2.name)) = s.topic_key
        )
      on conflict (group_id, learner_id) do update
        set membership_status = 'active',
            membership_source = 'auto_match',
            joined_at = coalesce(public.studyspace_group_members.joined_at, now()),
            updated_at = now();
    end loop;

    -- Course groups match eligible learners by course and academic year.
    if btrim(coalesce(me.course, '')) <> '' then
      v_key := md5(concat_ws(chr(31), 'course',
        lower(btrim(coalesce(me.country, ''))),
        lower(btrim(coalesce(me.education_level, ''))),
        lower(btrim(coalesce(me.course, ''))),
        lower(btrim(coalesce(me.academic_year, '')))
      ));
      if (
        select count(distinct p2.id)
        from public.profiles p2
        where p2.role = 'learner'
          and p2.account_status = 'active'
          and private.studyspace_peer_chat_eligible(p2.id)
          and lower(btrim(coalesce(p2.country, ''))) = lower(btrim(coalesce(me.country, '')))
          and lower(btrim(coalesce(p2.education_level, ''))) = lower(btrim(coalesce(me.education_level, '')))
          and lower(btrim(coalesce(p2.course, ''))) = lower(btrim(coalesce(me.course, '')))
          and lower(btrim(coalesce(p2.academic_year, ''))) = lower(btrim(coalesce(me.academic_year, '')))
      ) >= 2 then
        v_expected := array_append(v_expected, 'course:' || v_key);
        insert into public.studyspace_groups(
          group_type, name, description, created_by, school_name, education_level, grade,
          timetable_entry_id, discoverable, is_active, group_match_key, group_topic
        )
        values (
          'course',
          btrim(me.course) || ' Group',
          'Automatically created for students who share this course, study level and academic year.',
          p_learner, '', coalesce(me.education_level, ''), '',
          null, true, true, v_key, btrim(me.course)
        )
        on conflict (group_type, group_match_key)
          where is_active and group_type in ('subject', 'course')
        do update set is_active = true, updated_at = now()
        returning id into v_group;

        insert into public.studyspace_group_members(
          group_id, learner_id, membership_status, membership_source, joined_at
        )
        select v_group, p2.id, 'active', 'auto_match', now()
        from public.profiles p2
        where p2.role = 'learner'
          and p2.account_status = 'active'
          and private.studyspace_peer_chat_eligible(p2.id)
          and lower(btrim(coalesce(p2.country, ''))) = lower(btrim(coalesce(me.country, '')))
          and lower(btrim(coalesce(p2.education_level, ''))) = lower(btrim(coalesce(me.education_level, '')))
          and lower(btrim(coalesce(p2.course, ''))) = lower(btrim(coalesce(me.course, '')))
          and lower(btrim(coalesce(p2.academic_year, ''))) = lower(btrim(coalesce(me.academic_year, '')))
        on conflict (group_id, learner_id) do update
          set membership_status = 'active',
              membership_source = 'auto_match',
              joined_at = coalesce(public.studyspace_group_members.joined_at, now()),
              updated_at = now();
      end if;
    end if;
  end if;

  -- Remove automatic memberships that no longer match the learner.
  update public.studyspace_group_members gm
    set membership_status = 'removed', updated_at = now()
  from public.studyspace_groups g
  where gm.group_id = g.id
    and gm.learner_id = p_learner
    and gm.membership_source = 'auto_match'
    and g.group_type in ('subject', 'course')
    and not ((g.group_type || ':' || g.group_match_key) = any(v_expected));

  -- Retire automatic groups with fewer than two eligible learners.
  with underfilled as (
    select g.id
    from public.studyspace_groups g
    where g.is_active
      and g.group_type in ('subject', 'course')
      and (
        select count(distinct gm.learner_id)
        from public.studyspace_group_members gm
        join public.profiles p2 on p2.id = gm.learner_id
        where gm.group_id = g.id
          and gm.membership_status = 'active'
          and p2.role = 'learner'
          and p2.account_status = 'active'
          and private.studyspace_peer_chat_eligible(p2.id)
      ) < 2
  )
  update public.studyspace_groups g
    set is_active = false, updated_at = now()
  where g.id in (select id from underfilled);

  update public.studyspace_group_members gm
    set membership_status = 'removed', updated_at = now()
  from public.studyspace_groups g
  where gm.group_id = g.id
    and not g.is_active
    and g.group_type in ('subject', 'course')
    and gm.membership_status = 'active'
    and gm.membership_source = 'auto_match';
end;
$function$;
