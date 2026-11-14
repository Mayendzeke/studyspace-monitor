-- Learners may read only their own class-homework submissions.
-- Submission creation remains server-side in the mark-class-homework Edge Function.
-- Only MFA-elevated StudySpace administrators can write final marking fields.

drop policy if exists "homework_submission_self_manage"
  on public.session_homework_submissions;
drop policy if exists homework_submission_self_read
  on public.session_homework_submissions;
create policy homework_submission_self_read
  on public.session_homework_submissions for select to authenticated
  using (
    learner_id = (select auth.uid())
    and (select public.is_active_studyspace_learner())
    and exists (
      select 1
      from public.session_homework h
      join public.class_session_members m on m.session_id = h.session_id
      where h.id = session_homework_submissions.homework_id
        and m.learner_id = (select auth.uid())
    )
  );

drop policy if exists homework_submission_admin_read
  on public.session_homework_submissions;
create policy homework_submission_admin_read
  on public.session_homework_submissions for select to authenticated
  using ((select public.is_studyspace_admin()));

drop policy if exists session_homework_submissions_admin_mark
  on public.session_homework_submissions;
create policy session_homework_submissions_admin_mark
  on public.session_homework_submissions for update to authenticated
  using (
    (select public.is_studyspace_admin())
    and coalesce(((select auth.jwt()) ->> 'aal'), '') = 'aal2'
  )
  with check (
    (select public.is_studyspace_admin())
    and coalesce(((select auth.jwt()) ->> 'aal'), '') = 'aal2'
  );

-- Remove broad default table privileges. The Monitor UI needs only SELECT and
-- UPDATE of the five fields used to save a teacher's final mark. Learner
-- submissions are inserted/updated by the service-role Edge Function.
revoke all on table public.session_homework_submissions
  from public, anon, authenticated;
grant select on table public.session_homework_submissions to authenticated;
grant update (teacher_score, teacher_feedback, marked_by, marked_at, ai_marking_status)
  on table public.session_homework_submissions to authenticated;

-- Keep the cross-assessment cohort calculation isolated from mutable schemas.
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
set search_path = ''
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
