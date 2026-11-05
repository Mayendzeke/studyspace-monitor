-- Keep Word Puzzle clues learner-visible while answers remain protected.
-- Older Content Studio versions stored the clue in exercise_questions.explanation.
-- Migration 007 moved explanations into protected answer keys; restore clues into
-- a public question-content field before clearing the answer-key explanation.

update public.exercise_questions q
set content = coalesce(q.content, '{}'::jsonb)
      || jsonb_build_object(
        'clue',
        coalesce(
          nullif(q.content->>'clue', ''),
          nullif(ak.answer_key->>'clue', ''),
          nullif(ak.answer_key->>'explanation', ''),
          nullif(q.explanation, '')
        )
      ),
    explanation = ''
from public.exercise_answer_keys ak
where ak.question_id = q.id
  and q.question_type = 'word_puzzle'
  and coalesce(
    nullif(q.content->>'clue', ''),
    nullif(ak.answer_key->>'clue', ''),
    nullif(ak.answer_key->>'explanation', ''),
    nullif(q.explanation, '')
  ) is not null;

update public.exercise_questions q
set content = coalesce(q.content, '{}'::jsonb)
      || jsonb_build_object('clue', q.explanation),
    explanation = ''
where q.question_type = 'word_puzzle'
  and coalesce(q.content->>'clue', '') = ''
  and coalesce(q.explanation, '') <> '';

-- The clue is now public question content, not post-submission feedback.
update public.exercise_answer_keys ak
set answer_key = coalesce(ak.answer_key, '{}'::jsonb) - 'explanation'
from public.exercise_questions q
where q.id = ak.question_id
  and q.question_type = 'word_puzzle'
  and coalesce(q.content->>'clue', '') <> '';
