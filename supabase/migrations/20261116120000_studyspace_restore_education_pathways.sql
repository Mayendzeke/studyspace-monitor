-- Restore the five supported learner pathways.
-- The 20261115180750 migration incorrectly forced every learner into
-- Secondary High, destroying the ability to save Primary, High School,
-- Matric and Tertiary profiles. This migration removes that global override.

begin;

drop trigger if exists enforce_studyspace_learner_education_level on public.profiles;
drop function if exists public.enforce_studyspace_learner_education_level();

alter table public.profiles
  drop constraint if exists profiles_learner_education_level_check;

-- Recover pathway values where the learner's saved grade makes the stage
-- unambiguous. Rows without a reliable grade are left unchanged for review.
update public.profiles
set education_level = case
  when grade ~* '^Grade [0-7]$' then 'Primary'
  when grade ~* '^Form [1-3]$' then 'Secondary High'
  when grade ~* '^Form [4-5]$' then 'High School'
  when grade ~* '^(Form 6|Lower Sixth|Upper Sixth|Sixth Form|A-Level|IB Diploma|Pre-University)$' then 'Matric'
  when grade ~* '^(Year [1-6]|Semester [1-6]|Research / Thesis)$' then 'Tertiary'
  when nullif(btrim(course), '') is not null
    and nullif(btrim(institution), '') is not null then 'Tertiary'
  else education_level
end,
updated_at = pg_catalog.now()
where role = 'learner'
  and education_level = 'Secondary High'
  and (
    grade ~* '^Grade [0-7]$'
    or grade ~* '^Form [1-5]$'
    or grade ~* '^(Form 6|Lower Sixth|Upper Sixth|Sixth Form|A-Level|IB Diploma|Pre-University)$'
    or grade ~* '^(Year [1-6]|Semester [1-6]|Research / Thesis)$'
    or (nullif(btrim(course), '') is not null and nullif(btrim(institution), '') is not null)
  );


-- Keep the legacy eight-argument profile RPC compatible while applying the
-- same strict education-stage validation to clients that have not yet sent
-- the tertiary course argument.
create or replace function public.update_studyspace_learner_profile(
  p_full_name text,
  p_preferred_name text,
  p_country text,
  p_institution text,
  p_education_level text,
  p_grade text,
  p_curriculum text,
  p_academic_year text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  selected_level text := coalesce(p_education_level, '');
begin
  if not public.is_active_studyspace_learner() then
    raise exception 'An active learner account is required';
  end if;

  if selected_level <> ''
    and selected_level not in ('Primary', 'Secondary High', 'High School', 'Matric', 'Tertiary') then
    raise exception 'Choose a valid Study Space education pathway';
  end if;

  update public.profiles
  set
    full_name = left(coalesce(p_full_name, ''), 120),
    preferred_name = left(coalesce(p_preferred_name, ''), 80),
    country = left(coalesce(p_country, ''), 80),
    institution = left(coalesce(p_institution, ''), 160),
    education_level = left(selected_level, 80),
    grade = left(coalesce(p_grade, ''), 80),
    curriculum = left(coalesce(p_curriculum, ''), 120),
    academic_year = left(coalesce(p_academic_year, ''), 30),
    updated_at = pg_catalog.now()
  where id = auth.uid();
end;
$function$;

revoke all on function public.update_studyspace_learner_profile(
  text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.update_studyspace_learner_profile(
  text, text, text, text, text, text, text, text
) to authenticated, service_role;

-- Validate the exact pathway values used by both frontends at the profile RPC.
create or replace function public.update_studyspace_learner_profile(
  p_full_name text,
  p_preferred_name text,
  p_country text,
  p_institution text,
  p_education_level text,
  p_grade text,
  p_curriculum text,
  p_academic_year text,
  p_course text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  selected_level text := coalesce(p_education_level, '');
begin
  if not public.is_active_studyspace_learner() then
    raise exception 'An active learner account is required';
  end if;

  if selected_level <> ''
    and selected_level not in ('Primary', 'Secondary High', 'High School', 'Matric', 'Tertiary') then
    raise exception 'Choose a valid Study Space education pathway';
  end if;

  update public.profiles
  set
    full_name = left(coalesce(p_full_name, ''), 120),
    preferred_name = left(coalesce(p_preferred_name, ''), 80),
    country = left(coalesce(p_country, ''), 80),
    institution = left(coalesce(p_institution, ''), 160),
    education_level = left(selected_level, 80),
    grade = left(coalesce(p_grade, ''), 80),
    curriculum = left(coalesce(p_curriculum, ''), 120),
    academic_year = left(coalesce(p_academic_year, ''), 30),
    course = left(coalesce(p_course, ''), 160),
    updated_at = pg_catalog.now()
  where id = auth.uid();
end;
$function$;

revoke all on function public.update_studyspace_learner_profile(
  text, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.update_studyspace_learner_profile(
  text, text, text, text, text, text, text, text, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
