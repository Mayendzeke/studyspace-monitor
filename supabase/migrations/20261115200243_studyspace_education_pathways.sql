-- Restore the five valid Study Space education stages after the temporary
-- single-stage constraint. The deployed database already has this version
-- recorded in its migration ledger; this file restores source-history parity.
begin;

drop trigger if exists enforce_studyspace_learner_education_level on public.profiles;
drop function if exists public.enforce_studyspace_learner_education_level();

alter table public.profiles
  drop constraint if exists profiles_learner_education_level_check;

alter table public.profiles
  add constraint profiles_learner_education_level_check
  check (
    role <> 'learner'
    or education_level = any (array[
      'Primary',
      'Secondary High',
      'High School',
      'Matric',
      'Tertiary'
    ]::text[])
  );

commit;
