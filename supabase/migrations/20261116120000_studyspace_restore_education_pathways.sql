-- Restore the five supported learner pathways.
-- The 20261115180750 migration incorrectly forced every learner into
-- Secondary High, destroying the ability to save Primary, High School,
-- Matric and Tertiary profiles. This migration removes that global override.

begin;

drop trigger if exists enforce_studyspace_learner_education_level on public.profiles;
drop function if exists public.enforce_studyspace_learner_education_level();

-- Preserve the five valid learner stages established by the later
-- studyspace_education_pathways migration. Reassert the constraint without
-- rewriting learner records or defaulting their stage.
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
