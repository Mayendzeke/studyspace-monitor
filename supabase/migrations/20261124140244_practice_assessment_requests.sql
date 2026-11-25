-- Distinguish teacher assignments, scheduled assessments and learner-requested practice tests.
ALTER TABLE public.exercise_assignments
  ADD COLUMN IF NOT EXISTS assignment_type text NOT NULL DEFAULT 'teacher_assignment';

ALTER TABLE public.exercise_assignments
  DROP CONSTRAINT IF EXISTS exercise_assignments_assignment_type_check;
ALTER TABLE public.exercise_assignments
  ADD CONSTRAINT exercise_assignments_assignment_type_check
  CHECK (assignment_type IN ('teacher_assignment','scheduled_assessment','practice'));

CREATE INDEX IF NOT EXISTS exercise_assignments_learner_type_available_idx
  ON public.exercise_assignments (learner_id, assignment_type, available_at DESC);

CREATE TABLE IF NOT EXISTS public.learner_practice_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.student_subjects(id) ON DELETE CASCADE,
  subject_name text NOT NULL,
  topic text NOT NULL DEFAULT '',
  question_count integer NOT NULL DEFAULT 10 CHECK (question_count BETWEEN 5 AND 20),
  difficulty text NOT NULL DEFAULT 'adaptive',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','waiting_for_material','waiting_for_study_pack','ready','failed','cancelled')),
  exercise_assignment_id uuid REFERENCES public.exercise_assignments(id) ON DELETE SET NULL,
  material_review_id uuid,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learner_practice_requests_pending_idx
  ON public.learner_practice_requests (learner_id, status, created_at);
CREATE INDEX IF NOT EXISTS learner_practice_requests_subject_idx
  ON public.learner_practice_requests (learner_id, subject_id, created_at DESC);

ALTER TABLE public.learner_practice_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.learner_practice_requests TO authenticated;
DROP POLICY IF EXISTS learner_practice_requests_select_own ON public.learner_practice_requests;
CREATE POLICY learner_practice_requests_select_own
  ON public.learner_practice_requests
  FOR SELECT TO authenticated
  USING (learner_id = auth.uid());
