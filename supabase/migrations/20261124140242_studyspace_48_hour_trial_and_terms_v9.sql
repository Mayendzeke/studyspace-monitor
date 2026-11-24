-- Align new learner activations with the 48-hour free trial and Terms v9.
-- Existing trial_expires_at values are deliberately preserved: current learners
-- keep the expiry already assigned to their account. The new duration applies
-- to future account activations and redemptions.

DO $migration$
DECLARE
  fn record;
  definition text;
  updated_count integer := 0;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname = ANY (ARRAY[
        'accept_studyspace_terms',
        'activate_studyspace_minor_learner',
        'approve_studyspace_guardian_link_consent',
        'complete_public_studyspace_enrolment',
        'complete_studyspace_enrolment',
        'submit_studyspace_guardian_link_consent',
        'redeem_studyspace_pin'
      ])
  LOOP
    definition := pg_catalog.pg_get_functiondef(fn.oid);

    IF fn.proname = 'approve_studyspace_guardian_link_consent' THEN
      IF position('2026-11-07-v3' IN definition) = 0 THEN
        RAISE EXCEPTION 'Expected legacy guardian-link terms version not found in %', fn.proname;
      END IF;
      definition := replace(definition, '2026-11-07-v3', '2026-11-24-v9');
    ELSIF fn.proname <> 'redeem_studyspace_pin' THEN
      IF position('2026-11-09-v8' IN definition) = 0 THEN
        RAISE EXCEPTION 'Expected v8 terms version not found in %', fn.proname;
      END IF;
      definition := replace(definition, '2026-11-09-v8', '2026-11-24-v9');
    END IF;

    IF fn.proname = ANY (ARRAY[
      'activate_studyspace_minor_learner',
      'approve_studyspace_guardian_link_consent',
      'complete_public_studyspace_enrolment',
      'complete_studyspace_enrolment',
      'redeem_studyspace_pin'
    ]) THEN
      IF position('interval ''7 days''' IN definition) = 0 THEN
        RAISE EXCEPTION 'Expected seven-day trial interval not found in %', fn.proname;
      END IF;
      definition := replace(definition, 'interval ''7 days''', 'interval ''48 hours''');
    END IF;

    EXECUTE definition;
    updated_count := updated_count + 1;
  END LOOP;

  IF updated_count <> 7 THEN
    RAISE EXCEPTION 'Expected to update seven terms/trial functions; updated %', updated_count;
  END IF;
END
$migration$;

-- Keep the regular subject-test default at ten while allowing the learner to change it.
ALTER TABLE public.assessment_schedule_preferences
  DROP CONSTRAINT IF EXISTS assessment_schedule_preferences_question_count_check;
ALTER TABLE public.assessment_schedule_preferences
  ADD CONSTRAINT assessment_schedule_preferences_question_count_check
  CHECK (question_count BETWEEN 1 AND 100);

-- Existing v8 users remain authorised to read their existing account while
-- the Student app requests acceptance of v9. New acceptances use v9 only.
DO $migration$
DECLARE
  definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
    INTO definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'is_active_studyspace_learner'
    AND p.prokind = 'f';

  IF definition IS NULL
     OR position('terms_version = ''2026-11-09-v8''' IN definition) = 0 THEN
    RAISE EXCEPTION 'Expected v8 active-learner terms check not found';
  END IF;

  definition := replace(
    definition,
    'terms_version = ''2026-11-09-v8''',
    'terms_version in (''2026-11-09-v8'', ''2026-11-24-v9'')'
  );
  EXECUTE definition;
END
$migration$;

-- Remind 24 hours before the actual expiry. This keeps the reminder correct
-- for both legacy seven-day trials and new 48-hour trials.
DO $migration$
DECLARE
  definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
    INTO definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'mark_studyspace_trial_reminder_shown'
    AND p.prokind = 'f';

  IF definition IS NULL
     OR position('trial_started_at + interval ''6 days''' IN definition) = 0 THEN
    RAISE EXCEPTION 'Expected six-day trial reminder threshold not found';
  END IF;

  definition := replace(
    definition,
    'trial_started_at + interval ''6 days''',
    'trial_expires_at - interval ''24 hours'''
  );
  EXECUTE definition;
END
$migration$;
