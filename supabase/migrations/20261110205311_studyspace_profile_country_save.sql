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
set search_path = ''
as $function$
begin
  perform public.update_studyspace_learner_profile(
    p_full_name,
    p_preferred_name,
    p_country,
    p_institution,
    p_education_level,
    p_grade,
    p_curriculum,
    p_academic_year
  );

  update public.profiles
  set country = left(coalesce(p_country, ''), 80),
      course = left(coalesce(p_course, ''), 160),
      updated_at = pg_catalog.now()
  where id = auth.uid();
end;
$function$;

revoke all on function public.update_studyspace_learner_profile(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_studyspace_learner_profile(text, text, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
