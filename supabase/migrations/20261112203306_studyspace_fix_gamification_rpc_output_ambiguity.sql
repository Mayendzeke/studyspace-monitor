-- Resolve PL/pgSQL output-parameter collisions in the learner and Monitor gamification RPCs.
-- Preserve authorization checks, return contracts and streak calculations.

CREATE OR REPLACE FUNCTION public.get_studyspace_gamification_summary()
 RETURNS TABLE(total_xp bigint, level integer, level_title text, xp_into_level bigint, xp_for_next_level bigint, current_streak integer, longest_streak integer, active_days integer, study_minutes bigint, completed_assessments integer, flashcards_reviewed integer, referrals_qualified integer, last_activity_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_xp bigint;
  v_level integer;
  v_last date;
  v_current integer := 0;
  v_longest integer := 0;
  v_day date;
  v_title text;
begin
  if v_user is null or not public.is_active_studyspace_learner() then
    raise exception 'An active student account is required';
  end if;

  select greatest(0, coalesce(sum(e.points), 0))
    into v_xp
    from public.student_xp_events as e
   where e.learner_id = v_user;

  v_level := floor(sqrt(v_xp::numeric / 100))::integer + 1;
  v_title := case
    when v_level < 3 then 'Explorer'
    when v_level < 5 then 'Apprentice'
    when v_level < 8 then 'Scholar'
    when v_level < 12 then 'Achiever'
    when v_level < 17 then 'Master'
    else 'Legend'
  end;

  select max(a.activity_date)
    into v_last
    from public.student_daily_activity as a
   where a.learner_id = v_user;

  if v_last is not null and v_last >= timezone('Africa/Mbabane', now())::date - 1 then
    v_day := v_last;
    loop
      exit when not exists (
        select 1
          from public.student_daily_activity as a
         where a.learner_id = v_user
           and a.activity_date = v_day
      );
      v_current := v_current + 1;
      v_day := v_day - 1;
      exit when v_current >= 365;
    end loop;
  end if;

  with days as (
    select
      a.activity_date,
      a.activity_date - (row_number() over (order by a.activity_date))::integer as grp
    from public.student_daily_activity as a
    where a.learner_id = v_user
  ),
  runs as (
    select count(*) as n
    from days
    group by grp
  )
  select coalesce(max(r.n), 0)::integer
    into v_longest
    from runs as r;

  return query
  select
    v_xp,
    v_level,
    v_title,
    v_xp - (100 * (v_level - 1) * (v_level - 1))::bigint,
    (100 * (v_level * v_level - (v_level - 1) * (v_level - 1)))::bigint,
    v_current,
    v_longest,
    (select count(*)::integer
       from public.student_daily_activity as a
      where a.learner_id = v_user),
    (select coalesce(sum(a.study_minutes), 0)::bigint
       from public.student_daily_activity as a
      where a.learner_id = v_user),
    (select coalesce(sum(a.completed_assessments), 0)::integer
       from public.student_daily_activity as a
      where a.learner_id = v_user),
    (select coalesce(sum(a.flashcards_reviewed), 0)::integer
       from public.student_daily_activity as a
      where a.learner_id = v_user),
    (select count(*)::integer
       from public.student_referrals as r
      where r.referrer_id = v_user
        and r.status = 'qualified'),
    v_last;
end;
$function$
;

revoke all on function public.get_studyspace_gamification_summary() from public, anon;
grant execute on function public.get_studyspace_gamification_summary() to authenticated;

CREATE OR REPLACE FUNCTION public.get_studyspace_monitor_gamification_overview()
 RETURNS TABLE(learner_id uuid, display_name text, institution text, grade text, total_xp bigint, current_streak integer, longest_streak integer, qualified_referrals integer, last_activity_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_studyspace_admin() then
    raise exception 'Monitor administrator access is required';
  end if;

  return query
  with xp as (
    select e.learner_id, coalesce(sum(e.points), 0)::bigint as total
    from public.student_xp_events as e
    group by e.learner_id
  ),
  daily as (
    select d.learner_id, max(d.activity_date) as last_day
    from public.student_daily_activity as d
    group by d.learner_id
  ),
  ranks as (
    select
      d.learner_id,
      d.activity_date,
      d.activity_date - (row_number() over (
        partition by d.learner_id
        order by d.activity_date
      ))::integer as grp
    from public.student_daily_activity as d
  ),
  longest as (
    select q.learner_id, max(q.n)::integer as longest
    from (
      select r.learner_id, r.grp, count(*) as n
      from ranks as r
      group by r.learner_id, r.grp
    ) as q
    group by q.learner_id
  )
  select
    p.id,
    coalesce(nullif(btrim(p.preferred_name), ''), p.full_name),
    p.institution,
    p.grade,
    coalesce(x.total, 0),
    case
      when d.last_day >= timezone('Africa/Mbabane', now())::date - 1 then
        coalesce((
          select min(g.i)::integer
          from generate_series(0, 364) as g(i)
          where not exists (
            select 1
            from public.student_daily_activity as a
            where a.learner_id = p.id
              and a.activity_date = d.last_day - g.i
          )
        ), 365)
      else 0
    end,
    coalesce(l.longest, 0),
    (
      select count(*)::integer
      from public.student_referrals as r
      where r.referrer_id = p.id
        and r.status = 'qualified'
    ),
    d.last_day
  from public.profiles as p
  left join xp as x on x.learner_id = p.id
  left join daily as d on d.learner_id = p.id
  left join longest as l on l.learner_id = p.id
  where p.role = 'learner'
    and p.account_status = 'active'
  order by coalesce(x.total, 0) desc, d.last_day desc nulls last
  limit 200;
end;
$function$
;

revoke all on function public.get_studyspace_monitor_gamification_overview() from public, anon;
grant execute on function public.get_studyspace_monitor_gamification_overview() to authenticated;
