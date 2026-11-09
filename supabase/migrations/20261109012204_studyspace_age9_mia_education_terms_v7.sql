-- StudySpace approval alignment: minimum learner age 9, current Terms v7,
-- guardian-consent eligibility and educational-only AI fallback eligibility.
-- The database access condition must require terms_version = '2026-11-09-v7'.

do $migration$
declare
  definition_text text;
begin
  select pg_get_functiondef('public.is_active_studyspace_learner()'::regprocedure)
    into definition_text;
  if position('2026-11-08-v6' in definition_text) = 0 then
    raise exception 'Expected the previous learner access terms guard before upgrade.';
  end if;
  definition_text := replace(definition_text, '2026-11-08-v6', '2026-11-09-v7');
  definition_text := replace(
    definition_text,
    'and account_status = ''active''',
    E'and account_status = ''active''\n      and date_of_birth is not null\n      and extract(year from age((now() at time zone ''Africa/Mbabane'')::date, date_of_birth)) >= 9'
  );
  execute definition_text;

  select pg_get_functiondef('public.accept_studyspace_terms(text,text,text)'::regprocedure)
    into definition_text;
  if position('2026-11-08-v6' in definition_text) = 0 then
    raise exception 'Expected the previous terms acceptance guard before upgrade.';
  end if;
  definition_text := replace(definition_text, '2026-11-08-v6', '2026-11-09-v7');
  definition_text := replace(
    definition_text,
    'and account_status = ''active'';',
    'and account_status = ''active''\n    and date_of_birth is not null\n    and extract(year from age((now() at time zone ''Africa/Mbabane'')::date, date_of_birth)) >= 9;'
  );
  execute definition_text;

  select pg_get_functiondef('public.complete_studyspace_enrolment(uuid,text,text,text,date,text,text,text)'::regprocedure)
    into definition_text;
  if position('learner_age < 8' in definition_text) = 0 then
    raise exception 'Expected the previous minimum age check before upgrade.';
  end if;
  definition_text := replace(definition_text, 'learner_age < 8', 'learner_age < 9');
  definition_text := replace(definition_text, 'children under 8 years old', 'children under 9 years old');
  definition_text := replace(definition_text, '2026-11-08-v6', '2026-11-09-v7');
  execute definition_text;

  select pg_get_functiondef('public.submit_studyspace_guardian_link_consent(text,text,text,text,text,boolean,text,boolean)'::regprocedure)
    into definition_text;
  if position('2026-11-08-v6' in definition_text) = 0 then
    raise exception 'Expected the previous guardian-link terms guard before upgrade.';
  end if;
  definition_text := replace(definition_text, '2026-11-08-v6', '2026-11-09-v7');
  definition_text := replace(
    definition_text,
    E'or extract(year from age(local_today, learner_dob)) >= 18 then',
    'or extract(year from age(local_today, learner_dob)) < 9\n     or extract(year from age(local_today, learner_dob)) >= 18 then'
  );
  execute definition_text;

  select pg_get_functiondef('public.activate_studyspace_minor_learner(uuid,text,text,text,text,boolean,text,uuid,boolean)'::regprocedure)
    into definition_text;
  if position('2026-11-08-v6' in definition_text) = 0 then
    raise exception 'Expected the previous guardian activation terms guard before upgrade.';
  end if;
  definition_text := replace(definition_text, '2026-11-08-v6', '2026-11-09-v7');
  definition_text := replace(
    definition_text,
    'or extract(year from age(local_today, learner_dob)) >= 18 then',
    'or extract(year from age(local_today, learner_dob)) < 9\n     or extract(year from age(local_today, learner_dob)) >= 18 then'
  );
  execute definition_text;

  select pg_get_functiondef('public.claim_studyspace_homework_fallback(uuid)'::regprocedure)
    into definition_text;
  if position('fallback_attempts < 5' in definition_text) = 0 then
    raise exception 'Expected the existing homework fallback claim function before upgrade.';
  end if;
  definition_text := replace(
    definition_text,
    E'and fallback_attempts < 5',
    'and fallback_attempts < 5\n    and exists (\n      select 1 from public.profiles as learner\n      where learner.id = homework_help_requests.learner_id\n        and learner.role = ''learner''\n        and learner.account_status = ''active''\n        and learner.date_of_birth is not null\n        and extract(year from age((now() at time zone ''Africa/Mbabane'')::date, learner.date_of_birth)) >= 9\n    )'
  );
  execute definition_text;
end;
$migration$;
