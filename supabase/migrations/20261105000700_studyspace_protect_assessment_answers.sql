-- Keep learner-readable exercise questions free of answers and marking guidance.
-- Correct responses, accepted variants, matching pairs and explanations remain
-- in exercise_answer_keys, whose RLS policy is restricted to AAL2 administrators.

-- Preserve existing authoring data in the protected answer-key table before
-- removing duplicate answer material from learner-readable question rows.
update public.exercise_answer_keys ak
set answer_key =
  coalesce(ak.answer_key, '{}'::jsonb)
  || case
       when not (coalesce(ak.answer_key, '{}'::jsonb) ? 'answer')
         and coalesce(q.content->'answer', q.content->'correctAnswer', q.content->'correct_answer') is not null
       then jsonb_build_object('answer', coalesce(q.content->'answer', q.content->'correctAnswer', q.content->'correct_answer'))
       else '{}'::jsonb
     end
  || case
       when not (coalesce(ak.answer_key, '{}'::jsonb) ? 'acceptedAnswers')
         and q.content ? 'acceptedAnswers'
       then jsonb_build_object('acceptedAnswers', q.content->'acceptedAnswers')
       else '{}'::jsonb
     end
  || case
       when not (coalesce(ak.answer_key, '{}'::jsonb) ? 'pairs')
         and q.question_type = 'matching'
         and jsonb_typeof(q.content->'pairs') = 'array'
       then jsonb_build_object('pairs', q.content->'pairs')
       else '{}'::jsonb
     end
  || case
       when not (coalesce(ak.answer_key, '{}'::jsonb) ? 'explanation')
         and coalesce(q.explanation, '') <> ''
       then jsonb_build_object('explanation', q.explanation)
       else '{}'::jsonb
     end
from public.exercise_questions q
where q.id = ak.question_id;

-- Create protected key rows for legacy questions that have answer-adjacent
-- content but were missing a key row.
insert into public.exercise_answer_keys (question_id, answer_key)
select
  q.id,
  jsonb_strip_nulls(jsonb_build_object(
    'answer', coalesce(q.content->'answer', q.content->'correctAnswer', q.content->'correct_answer'),
    'acceptedAnswers', q.content->'acceptedAnswers',
    'pairs', case when q.question_type = 'matching' then q.content->'pairs' else null end,
    'explanation', nullif(q.explanation, '')
  ))
from public.exercise_questions q
where (q.content ? 'answer')
   or (q.content ? 'correctAnswer')
   or (q.content ? 'correct_answer')
   or (q.content ? 'acceptedAnswers')
   or (q.question_type = 'matching' and q.content ? 'pairs')
   or coalesce(q.explanation, '') <> ''
on conflict (question_id) do nothing;

-- Randomize the right-hand matching choices while retaining the left-hand
-- prompts. Correct left/right pairs are preserved only in exercise_answer_keys.
with source as (
  select id, content->'pairs' as pairs
  from public.exercise_questions
  where question_type = 'matching'
    and jsonb_typeof(content->'pairs') = 'array'
    and case
      when jsonb_typeof(content->'pairs') = 'array' then jsonb_array_length(content->'pairs') > 1
      else false
    end
),
left_items as (
  select s.id, item.ordinality as position, item.value->>'left' as left_value
  from source s
  cross join lateral jsonb_array_elements(s.pairs) with ordinality as item(value, ordinality)
),
right_items as (
  select s.id, item.value->>'right' as right_value,
         row_number() over (partition by s.id order by random()) as position
  from source s
  cross join lateral jsonb_array_elements(s.pairs) as item(value)
),
scrambled as (
  select l.id,
         jsonb_agg(jsonb_build_object('left', l.left_value, 'right', r.right_value) order by l.position) as pairs
  from left_items l
  join right_items r on r.id = l.id and r.position = l.position
  group by l.id
)
update public.exercise_questions q
set content = jsonb_set(
  coalesce(q.content, '{}'::jsonb) - 'acceptedAnswers' - 'answer' - 'correctAnswer' - 'correct_answer',
  '{pairs}',
  scrambled.pairs,
  true
)
from scrambled
where q.id = scrambled.id;

-- Strip answer fields and explanations from every learner-readable question row.
update public.exercise_questions
set content = coalesce(content, '{}'::jsonb) - 'acceptedAnswers' - 'answer' - 'correctAnswer' - 'correct_answer',
    explanation = ''
where content ? 'acceptedAnswers'
   or content ? 'answer'
   or content ? 'correctAnswer'
   or content ? 'correct_answer'
   or coalesce(explanation, '') <> '';
