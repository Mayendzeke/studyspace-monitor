
create or replace function private.award_studyspace_assessment_xp()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_date date;
  v_percent numeric;
begin
  if new.total_points<=0 then return new; end if;
  v_date:=(coalesce(new.submitted_at,now()) at time zone 'Africa/Mbabane')::date;

  if tg_op='INSERT' then
    perform private.record_studyspace_daily_activity(new.learner_id,v_date,0,0,1,0);
    insert into public.student_xp_events(learner_id,event_key,event_type,points,metadata)
    values(new.learner_id,'assessment:'||new.assignment_id::text,'assessment_completed',25,
      jsonb_build_object('activity_date',v_date,'attempt_id',new.id))
    on conflict(learner_id,event_key) do nothing;
  end if;

  v_percent:=(new.score/nullif(new.total_points,0))*100;
  if v_percent>=60 then
    insert into public.student_xp_events(learner_id,event_key,event_type,points,metadata)
    values(new.learner_id,'assessment-pass:'||new.assignment_id::text,'assessment_passed',10,
      jsonb_build_object('activity_date',v_date,'attempt_id',new.id,'percentage',round(v_percent,1),
        'marked_at',new.marked_at))
    on conflict(learner_id,event_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.award_studyspace_assessment_xp() from public,anon,authenticated;
drop trigger if exists studyspace_assessment_xp on public.exercise_attempts;
create trigger studyspace_assessment_xp
after insert or update of score,total_points,marked_at on public.exercise_attempts
for each row execute function private.award_studyspace_assessment_xp();
;