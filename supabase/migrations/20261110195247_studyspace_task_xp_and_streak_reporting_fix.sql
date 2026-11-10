
-- Correct streak reporting, add task-completion rewards, and index XP foreign keys.
create index if not exists student_referrals_referral_code_idx
  on public.student_referrals(referral_code);
create index if not exists student_xp_events_awarded_by_idx
  on public.student_xp_events(awarded_by)
  where awarded_by is not null;

alter table public.student_xp_events
  drop constraint if exists student_xp_events_event_type_check;
alter table public.student_xp_events
  add constraint student_xp_events_event_type_check
  check (event_type = any (array[
    'profile_completed','assessment_completed','assessment_passed',
    'study_session_completed','flashcard_review','task_completed',
    'referral_qualified','streak_milestone','admin_adjustment'
  ]::text[]));

create or replace function private.award_studyspace_task_xp()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_date date;
  v_daily_points integer;
  v_points integer;
begin
  if not new.is_completed then return new; end if;
  if tg_op='UPDATE' and old.is_completed then return new; end if;
  if new.learner_id is null then return new; end if;

  v_date := (coalesce(new.completed_at,now()) at time zone 'Africa/Mbabane')::date;
  select coalesce(sum(points),0) into v_daily_points
  from public.student_xp_events
  where learner_id=new.learner_id
    and event_type='task_completed'
    and metadata->>'activity_date'=v_date::text;
  v_points := least(5,greatest(0,25-v_daily_points));

  if v_points>0 then
    insert into public.student_xp_events(learner_id,event_key,event_type,points,metadata)
    values(new.learner_id,'planner-task:'||new.id::text,'task_completed',v_points,
      jsonb_build_object('activity_date',v_date,'task_id',new.id,'task_kind',new.task_kind))
    on conflict(learner_id,event_key) do nothing;
  end if;

  -- A completed planner task counts as a meaningful activity day, not study minutes.
  perform private.record_studyspace_daily_activity(new.learner_id,v_date,0,0,0,0);
  return new;
end;
$$;
revoke all on function private.award_studyspace_task_xp() from public,anon,authenticated;
drop trigger if exists studyspace_planner_task_xp on public.planner_tasks;
create trigger studyspace_planner_task_xp
after insert or update of is_completed on public.planner_tasks
for each row execute function private.award_studyspace_task_xp();

create or replace function public.get_studyspace_monitor_gamification_overview()
returns table(
  learner_id uuid,
  display_name text,
  institution text,
  grade text,
  total_xp bigint,
  current_streak integer,
  longest_streak integer,
  qualified_referrals integer,
  last_activity_date date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_studyspace_admin() then
    raise exception 'Monitor administrator access is required';
  end if;

  return query
  with xp as (
    select e.learner_id,coalesce(sum(e.points),0)::bigint total
    from public.student_xp_events e group by e.learner_id
  ),
  daily as (
    select d.learner_id,max(d.activity_date) last_day
    from public.student_daily_activity d group by d.learner_id
  ),
  ranks as (
    select d.learner_id,d.activity_date,
      d.activity_date-(row_number() over(partition by d.learner_id order by d.activity_date))::integer grp
    from public.student_daily_activity d
  ),
  longest as (
    select learner_id,max(n)::integer longest
    from (select learner_id,grp,count(*) n from ranks group by learner_id,grp) q
    group by learner_id
  )
  select
    p.id,
    coalesce(nullif(btrim(p.preferred_name),''),p.full_name),
    p.institution,
    p.grade,
    coalesce(x.total,0),
    case
      when d.last_day >= timezone('Africa/Mbabane',now())::date-1 then
        coalesce((
          select min(g.i)::integer
          from generate_series(0,364) g(i)
          where not exists (
            select 1 from public.student_daily_activity a
            where a.learner_id=p.id and a.activity_date=d.last_day-g.i
          )
        ),365)
      else 0
    end,
    coalesce(l.longest,0),
    (select count(*)::integer from public.student_referrals r
      where r.referrer_id=p.id and r.status='qualified'),
    d.last_day
  from public.profiles p
  left join xp x on x.learner_id=p.id
  left join daily d on d.learner_id=p.id
  left join longest l on l.learner_id=p.id
  where p.role='learner' and p.account_status='active'
  order by coalesce(x.total,0) desc,d.last_day desc nulls last
  limit 200;
end;
$$;
revoke all on function public.get_studyspace_monitor_gamification_overview() from public,anon;
grant execute on function public.get_studyspace_monitor_gamification_overview() to authenticated;
;