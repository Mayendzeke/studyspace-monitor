-- Persist learner language preference and enforce question-source provenance.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'English';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_language_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_language_check
  CHECK (preferred_language IN ('English','SiSwati'));

CREATE OR REPLACE FUNCTION public.set_studyspace_preferred_language(p_language text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  chosen text := pg_catalog.btrim(coalesce(p_language,''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '42501';
  END IF;
  IF chosen NOT IN ('English','SiSwati') THEN
    RAISE EXCEPTION 'Choose English or SiSwati.' USING errcode = '22023';
  END IF;
  UPDATE public.profiles
  SET preferred_language = chosen,
      updated_at = pg_catalog.now()
  WHERE id = auth.uid()
    AND role = 'learner'
    AND account_status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active learner account is required.' USING errcode = '42501';
  END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_studyspace_preferred_language(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_studyspace_preferred_language(text) TO authenticated;

ALTER TABLE public.assessment_question_bank
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'learning_material_practice',
  ADD COLUMN IF NOT EXISTS source_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_year text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_paper_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_notes text NOT NULL DEFAULT '';

ALTER TABLE public.assessment_question_bank
  DROP CONSTRAINT IF EXISTS assessment_question_bank_source_kind_check,
  DROP CONSTRAINT IF EXISTS assessment_question_bank_source_url_check,
  DROP CONSTRAINT IF EXISTS assessment_question_bank_verified_provenance_check,
  DROP CONSTRAINT IF EXISTS assessment_question_bank_past_paper_source_check;
ALTER TABLE public.assessment_question_bank
  ADD CONSTRAINT assessment_question_bank_source_kind_check
    CHECK (source_kind IN ('past_paper','specimen_paper','syllabus_practice','learning_material_practice','teacher_authored')),
  ADD CONSTRAINT assessment_question_bank_source_url_check
    CHECK (source_url = '' OR source_url ~ '^https://'),
  ADD CONSTRAINT assessment_question_bank_verified_provenance_check
    CHECK (verification_status <> 'verified' OR (length(pg_catalog.btrim(source_title)) > 0 AND length(pg_catalog.btrim(source_reference)) > 0)),
  ADD CONSTRAINT assessment_question_bank_past_paper_source_check
    CHECK (source_kind NOT IN ('past_paper','specimen_paper') OR (source_url ~ '^https://' AND length(pg_catalog.btrim(source_title)) > 0 AND length(pg_catalog.btrim(source_year)) > 0));

CREATE INDEX IF NOT EXISTS assessment_question_bank_pending_review_idx
  ON public.assessment_question_bank (language, country, curriculum, education_level, subject_name, created_at DESC)
  WHERE verification_status = 'pending';
CREATE INDEX IF NOT EXISTS assessment_question_bank_verified_cohort_idx
  ON public.assessment_question_bank (country, curriculum, education_level, grade, course, subject_name, language)
  WHERE verification_status = 'verified';

COMMENT ON COLUMN public.assessment_question_bank.source_kind IS
  'Distinguishes exact past-paper/specimen questions from syllabus-derived or approved-learning-material practice. AI-generated practice must never be described as an actual past-paper question.';
COMMENT ON COLUMN public.assessment_question_bank.verification_status IS
  'Pending questions are private to Monitor and must not be assigned. Only administrator-verified rows may enter formal assessment sets.';

NOTIFY pgrst, 'reload schema';
