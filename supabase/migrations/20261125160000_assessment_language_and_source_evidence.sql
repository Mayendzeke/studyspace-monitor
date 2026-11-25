-- Store the learner's preferred assessment/material language and preserve it on generated content.
ALTER TABLE public.assessment_schedule_preferences
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'English';

ALTER TABLE public.learner_practice_requests
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'English';

ALTER TABLE public.exercise_sets
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'English';

ALTER TABLE public.learner_study_packs
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'English';
