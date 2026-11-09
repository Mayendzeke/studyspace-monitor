-- Terms v8 records the administrative Gemini-primary / Gemma-backup provider boundary.
-- Learners, including minors, must accept this version before continuing to use StudySpace.
-- All minimum-age 9, DOB-required, guardian-consent and trial checks from v7 remain intact.

do $migration$
declare
  definition_text text;
begin
  select pg_get_functiondef('public.is_active_studyspace_learner()'::regprocedure)
    into definition_text;
  if position('2026-11-09-v7' in definition_text) = 0 then
    raise exception 'Expected learner access Terms v7 guard before upgrade.';
  end if;
  execute replace(definition_text, '2026-11-09-v7', '2026-11-09-v8');

  select pg_get_functiondef('public.accept_studyspace_terms(text,text,text)'::regprocedure)
    into definition_text;
  if position('2026-11-09-v7' in definition_text) = 0 then
    raise exception 'Expected learner terms acceptance v7 guard before upgrade.';
  end if;
  execute replace(definition_text, '2026-11-09-v7', '2026-11-09-v8');

  select pg_get_functiondef('public.complete_studyspace_enrolment(uuid,text,text,text,date,text,text,text)'::regprocedure)
    into definition_text;
  if position('2026-11-09-v7' in definition_text) = 0 then
    raise exception 'Expected learner enrolment Terms v7 assignment before upgrade.';
  end if;
  execute replace(definition_text, '2026-11-09-v7', '2026-11-09-v8');

  select pg_get_functiondef('public.submit_studyspace_guardian_link_consent(text,text,text,text,text,boolean,text,boolean)'::regprocedure)
    into definition_text;
  if position('2026-11-09-v7' in definition_text) = 0 then
    raise exception 'Expected guardian-link Terms v7 guard before upgrade.';
  end if;
  execute replace(definition_text, '2026-11-09-v7', '2026-11-09-v8');

  select pg_get_functiondef('public.activate_studyspace_minor_learner(uuid,text,text,text,text,boolean,text,uuid,boolean)'::regprocedure)
    into definition_text;
  if position('2026-11-09-v7' in definition_text) = 0 then
    raise exception 'Expected guardian activation Terms v7 guard before upgrade.';
  end if;
  execute replace(definition_text, '2026-11-09-v7', '2026-11-09-v8');
end;
$migration$;
