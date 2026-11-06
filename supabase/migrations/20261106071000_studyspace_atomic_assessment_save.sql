create or replace function public.save_studyspace_exercise_draft(
  p_set jsonb,
  p_questions jsonb,
  p_answer_keys jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_id uuid;
  v_status text;
begin
  if not public.is_studyspace_admin() then
    raise exception 'Administrator access with verified MFA is required'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_set) is distinct from 'object'
     or jsonb_typeof(p_questions) is distinct from 'array'
     or jsonb_typeof(p_answer_keys) is distinct from 'array' then
    raise exception 'Invalid assessment draft payload'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_questions) > 250
     or jsonb_array_length(p_answer_keys) > 250 then
    raise exception 'An assessment cannot contain more than 250 questions'
      using errcode = '22023';
  end if;

  begin
    v_id := (p_set ->> 'id')::uuid;
  exception when invalid_text_representation then
    raise exception 'Assessment ID is invalid'
      using errcode = '22023';
  end;

  if v_id is null then
    raise exception 'Assessment ID is required'
      using errcode = '22023';
  end if;

  v_status := coalesce(p_set ->> 'review_status', 'draft');
  if v_status not in ('draft', 'review', 'approved') then
    raise exception 'Assessment review status is invalid'
      using errcode = '22023';
  end if;

  insert into public.exercise_sets (
    id, created_by, title, instructions, subject_name, education_level,
    grade, curriculum, question_count, review_status, duration_minutes,
    due_date, source_resource_id, updated_at
  )
  values (
    v_id,
    auth.uid(),
    left(coalesce(p_set ->> 'title', ''), 160),
    coalesce(p_set ->> 'instructions', ''),
    left(coalesce(p_set ->> 'subject_name', ''), 120),
    left(coalesce(p_set ->> 'education_level', ''), 80),
    left(coalesce(p_set ->> 'grade', ''), 80),
    left(coalesce(p_set ->> 'curriculum', ''), 120),
    jsonb_array_length(p_questions),
    v_status,
    greatest(1, least(300, coalesce(nullif(p_set ->> 'duration_minutes', '')::integer, 30))),
    nullif(p_set ->> 'due_date', '')::date,
    nullif(p_set ->> 'source_resource_id', '')::uuid,
    now()
  )
  on conflict (id) do update set
    title = excluded.title,
    instructions = excluded.instructions,
    subject_name = excluded.subject_name,
    education_level = excluded.education_level,
    grade = excluded.grade,
    curriculum = excluded.curriculum,
    question_count = excluded.question_count,
    review_status = excluded.review_status,
    duration_minutes = excluded.duration_minutes,
    due_date = excluded.due_date,
    source_resource_id = excluded.source_resource_id,
    updated_at = now();

  delete from public.exercise_questions
  where exercise_set_id = v_id;

  insert into public.exercise_questions (
    id, exercise_set_id, position, question_type, prompt, content,
    explanation, points, topic, difficulty
  )
  select
    q.id, v_id, q.position, q.question_type, q.prompt,
    coalesce(q.content, '{}'::jsonb), coalesce(q.explanation, ''),
    q.points, coalesce(q.topic, ''), coalesce(q.difficulty, 'Standard')
  from jsonb_to_recordset(p_questions) as q(
    id uuid, position integer, question_type text, prompt text,
    content jsonb, explanation text, points numeric, topic text, difficulty text
  );

  insert into public.exercise_answer_keys (question_id, answer_key)
  select k.question_id, coalesce(k.answer_key, '{}'::jsonb)
  from jsonb_to_recordset(p_answer_keys) as k(question_id uuid, answer_key jsonb);
end;
$function$;

revoke execute on function public.save_studyspace_exercise_draft(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_studyspace_exercise_draft(jsonb, jsonb, jsonb) to authenticated;
