-- Persist private study packs generated from learner uploads, teacher resources or curriculum fallback.
CREATE TABLE IF NOT EXISTS public.learner_study_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('uploaded_resource','teacher_resource','curriculum_fallback')),
  personal_resource_id uuid REFERENCES public.learner_personal_resources(id) ON DELETE CASCADE,
  learning_resource_id uuid REFERENCES public.learning_resources(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.student_subjects(id) ON DELETE SET NULL,
  subject_name text NOT NULL,
  topic text NOT NULL DEFAULT '',
  file_name text,
  mime_type text,
  source_hash text NOT NULL,
  source_text text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('queued','generating','ready','failed','needs_ocr')),
  error_message text,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learner_study_packs_source_shape_check CHECK (
    (source_type = 'uploaded_resource' AND personal_resource_id IS NOT NULL AND learning_resource_id IS NULL)
    OR (source_type = 'teacher_resource' AND learning_resource_id IS NOT NULL AND personal_resource_id IS NULL)
    OR (source_type = 'curriculum_fallback' AND personal_resource_id IS NULL AND learning_resource_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS learner_study_packs_personal_source_uq
  ON public.learner_study_packs (learner_id, personal_resource_id, source_hash)
  WHERE personal_resource_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS learner_study_packs_teacher_source_uq
  ON public.learner_study_packs (learner_id, learning_resource_id, source_hash)
  WHERE learning_resource_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS learner_study_packs_curriculum_source_uq
  ON public.learner_study_packs (learner_id, subject_id, topic, source_hash)
  WHERE source_type = 'curriculum_fallback';
CREATE INDEX IF NOT EXISTS learner_study_packs_learner_subject_status_idx
  ON public.learner_study_packs (learner_id, subject_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS learner_study_packs_learner_updated_idx
  ON public.learner_study_packs (learner_id, updated_at DESC);

ALTER TABLE public.learner_study_packs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.learner_study_packs TO authenticated;
DROP POLICY IF EXISTS learner_study_packs_select_own ON public.learner_study_packs;
CREATE POLICY learner_study_packs_select_own
  ON public.learner_study_packs
  FOR SELECT TO authenticated
  USING (learner_id = auth.uid());
