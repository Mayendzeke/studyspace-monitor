-- Keep only the latest submission's mark as the current class-homework result.
-- A resubmission that is pending or awaiting review removes its previous current
-- progress event until a new final mark is published.

create or replace function public.sync_studyspace_class_homework_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_score numeric;
  v_title text;
  v_subject text;
  v_session uuid;
begin
  v_score := coalesce(new.teacher_score,new.ai_score);
  if v_score is null or new.ai_marking_status not in ('ai_marked','teacher_marked') then
    delete from public.progress_events
      where learner_id=new.learner_id
        and event_type='class_homework'
        and metadata->>'homework_submission_id'=new.id::text;
    return new;
  end if;

  select h.title,h.session_id,s.subject_name
    into v_title,v_session,v_subject
    from public.session_homework h
    join public.class_sessions s on s.id=h.session_id
    where h.id=new.homework_id;

  insert into public.progress_events as existing(learner_id,event_type,score,max_score,metadata)
  values(
    new.learner_id,'class_homework',v_score,new.total_points,
    jsonb_build_object(
      'homework_submission_id',new.id,
      'homework_id',new.homework_id,
      'session_id',v_session,
      'title',coalesce(v_title,'Class homework'),
      'subject_name',coalesce(v_subject,'General'),
      'marking_status',new.ai_marking_status,
      'ai_marked_at',new.ai_marked_at,
      'teacher_marked_at',new.marked_at,
      'teacher_feedback',coalesce(new.teacher_feedback,''),
      'ai_feedback',coalesce(new.ai_feedback,'')
    )
  )
  on conflict(learner_id,(metadata->>'homework_submission_id'))
    where event_type='class_homework' and metadata ? 'homework_submission_id'
  do update set
    score=excluded.score,
    max_score=excluded.max_score,
    metadata=coalesce(existing.metadata,'{}'::jsonb)||excluded.metadata,
    created_at=now();
  return new;
end;
$function$;

create or replace function public.get_student_assessment_progress()
returns table (
  assignment_id uuid,
  exercise_title text,
  subject_name text,
  score_percent numeric,
  cohort_average numeric,
  cohort_size integer,
  submitted_at timestamptz,
  teacher_feedback text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.is_active_studyspace_learner() then
    raise exception 'An active StudySpace learner account is required';
  end if;

  return query
  with latest_attempts as (
    select distinct on (ea.id)
      ea.id as assignment_id,
      ea.exercise_set_id,
      ea.learner_id,
      es.title as exercise_title,
      es.subject_name,
      a.score,
      a.total_points,
      a.submitted_at,
      a.teacher_feedback,
      coalesce(a.teacher_review_required,false) as teacher_review_required
    from public.exercise_assignments ea
    join public.exercise_sets es on es.id=ea.exercise_set_id
    join public.exercise_attempts a on a.assignment_id=ea.id and a.learner_id=ea.learner_id
    where a.learner_id=auth.uid()
      and a.submitted_at is not null
      and a.total_points>0
    order by ea.id,a.submitted_at desc
  ),
  all_latest_attempts as (
    select distinct on (ea.id)
      ea.id as assignment_id,
      ea.exercise_set_id,
      ea.learner_id,
      a.score,
      a.total_points,
      coalesce(a.teacher_review_required,false) as teacher_review_required
    from public.exercise_assignments ea
    join public.exercise_attempts a on a.assignment_id=ea.id and a.learner_id=ea.learner_id
    where a.submitted_at is not null
      and a.total_points>0
    order by ea.id,a.submitted_at desc
  ),
  cohorts as (
    select exercise_set_id,
      count(distinct learner_id)::integer as cohort_size,
      avg((score/nullif(total_points,0))*100)::numeric as cohort_average
    from all_latest_attempts
    where not teacher_review_required
    group by exercise_set_id
  ),
  formal_results as (
    select mine.assignment_id,
      mine.exercise_title,
      mine.subject_name,
      round((mine.score/nullif(mine.total_points,0))*100,1) as score_percent,
      case when cohort.cohort_size>=3 then round(cohort.cohort_average,1) else null end as cohort_average,
      case when cohort.cohort_size>=3 then cohort.cohort_size else null end as cohort_size,
      mine.submitted_at,
      coalesce(mine.teacher_feedback,'') as teacher_feedback
    from latest_attempts mine
    join cohorts cohort on cohort.exercise_set_id=mine.exercise_set_id
    where not mine.teacher_review_required
  ),
  class_homework_results as (
    select h.id as assignment_id,
      'Class homework: '||coalesce(h.title,'Homework') as exercise_title,
      coalesce(s.subject_name,'General') as subject_name,
      round((coalesce(sub.teacher_score,sub.ai_score)/nullif(sub.total_points,0))*100,1) as score_percent,
      null::numeric as cohort_average,
      null::integer as cohort_size,
      coalesce(sub.marked_at,sub.ai_marked_at,sub.submitted_at,sub.completed_at) as submitted_at,
      coalesce(nullif(sub.teacher_feedback,''),sub.ai_feedback,'') as teacher_feedback
    from public.session_homework_submissions sub
    join public.session_homework h on h.id=sub.homework_id
    join public.class_sessions s on s.id=h.session_id
    where sub.learner_id=auth.uid()
      and sub.total_points>0
      and coalesce(sub.teacher_score,sub.ai_score) is not null
      and sub.ai_marking_status in ('ai_marked','teacher_marked')
  )
  select * from formal_results
  union all
  select * from class_homework_results
  order by submitted_at desc
  limit 100;
end;
$function$;
revoke all on function public.get_student_assessment_progress() from public,anon;
grant execute on function public.get_student_assessment_progress() to authenticated;
