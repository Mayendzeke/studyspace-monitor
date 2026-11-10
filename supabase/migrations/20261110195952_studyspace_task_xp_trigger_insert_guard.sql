
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
  if tg_op='UPDATE' then
    if old.is_completed then return new; end if;
  end if;
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
  perform private.record_studyspace_daily_activity(new.learner_id,v_date,0,0,0,0);
  return new;
end;
$$;
;