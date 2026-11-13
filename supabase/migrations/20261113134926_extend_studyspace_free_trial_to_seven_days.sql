-- Extend StudySpace's free learner trial from 48 hours to seven days.
-- The renewal plans remain 7, 14 and 28 days.

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
        'activate_studyspace_minor_learner',
        'approve_studyspace_guardian_link_consent',
        'complete_public_studyspace_enrolment',
        'complete_studyspace_enrolment',
        'redeem_studyspace_pin'
      ])
  LOOP
    definition := pg_catalog.pg_get_functiondef(fn.oid);
    IF position('interval ''48 hours''' IN definition) = 0 THEN
      RAISE EXCEPTION 'Expected 48-hour trial interval not found in function %', fn.proname;
    END IF;
    definition := replace(definition, 'interval ''48 hours''', 'interval ''7 days''');
    EXECUTE definition;
    updated_count := updated_count + 1;
  END LOOP;

  IF updated_count <> 5 THEN
    RAISE EXCEPTION 'Expected to update five learner activation functions; updated %', updated_count;
  END IF;

  SELECT pg_catalog.pg_get_functiondef(p.oid)
    INTO definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'mark_studyspace_trial_reminder_shown'
    AND p.prokind = 'f';

  IF definition IS NULL OR position('interval ''24 hours''' IN definition) = 0 THEN
    RAISE EXCEPTION 'Expected 24-hour-before-expiry reminder threshold not found';
  END IF;
  definition := replace(definition, 'interval ''24 hours''', 'interval ''6 days''');
  EXECUTE definition;
END
$migration$;

-- Give the remaining active free-trial learners the full seven days from
-- their original start time. Do not revive expired trials or alter paid plans.
UPDATE public.profiles
SET trial_expires_at = trial_started_at + interval '7 days',
    updated_at = clock_timestamp()
WHERE role = 'learner'
  AND account_status = 'active'
  AND subscription_tier IS NULL
  AND trial_started_at IS NOT NULL
  AND trial_expires_at = trial_started_at + interval '48 hours'
  AND trial_expires_at > clock_timestamp();
