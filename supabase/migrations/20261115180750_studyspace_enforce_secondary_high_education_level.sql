-- Every learner is registered under the single StudySpace education level.
-- The trigger normalises both new profiles and future edits before checks and
-- downstream classroom/profile triggers run.
create or replace function public.enforce_studyspace_learner_education_level()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.role = 'learner' then
    new.education_level := 'Secondary High';
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_studyspace_learner_education_level on public.profiles;
create trigger enforce_studyspace_learner_education_level
before insert or update of role, education_level
on public.profiles
for each row
execute function public.enforce_studyspace_learner_education_level();

update public.profiles
set education_level = 'Secondary High',
    updated_at = pg_catalog.now()
where role = 'learner'
  and education_level is distinct from 'Secondary High';

alter table public.profiles
  drop constraint if exists profiles_learner_education_level_check;

alter table public.profiles
  add constraint profiles_learner_education_level_check
  check (role <> 'learner' or education_level = 'Secondary High')
  not valid;

alter table public.profiles
  validate constraint profiles_learner_education_level_check;
