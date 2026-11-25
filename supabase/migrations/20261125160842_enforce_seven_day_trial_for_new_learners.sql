-- Set all future standard and guardian-approved learner activations to 168 hours.
-- Existing learners' saved trial expiry timestamps are never updated here.
DO $migration$
DECLARE
  fn record;
  definition text;
  updated_count integer := 0;
  current_count integer := 0;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname = ANY (ARRAY[
        'activate_studyspace_minor_learner',
        'approve_studyspace_guardian_link_consent',
        'complete_public_studyspace_enrolment',
        'complete_studyspace_enrolment'
      ])
  LOOP
    definition := pg_catalog.pg_get_functiondef(fn.oid);
    IF position('interval ''168 hours''' IN definition) > 0 THEN
      current_count := current_count + 1;
    ELSIF position('interval ''48 hours''' IN definition) > 0 THEN
      definition := replace(definition, 'interval ''48 hours''', 'interval ''168 hours''');
      EXECUTE definition;
      updated_count := updated_count + 1;
    ELSE
      RAISE EXCEPTION 'Expected a 48-hour or 168-hour trial interval in %', fn.proname;
    END IF;
  END LOOP;
  IF updated_count + current_count <> 4 THEN
    RAISE EXCEPTION 'Expected four learner activation functions; found %', updated_count + current_count;
  END IF;
END
$migration$;
