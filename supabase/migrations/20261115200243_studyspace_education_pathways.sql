alter table public.profiles
  add column if not exists institution_type text not null default '',
  add column if not exists qualification_level text not null default '';

drop trigger if exists enforce_studyspace_learner_education_level on public.profiles;
drop function if exists public.enforce_studyspace_learner_education_level();
alter table public.profiles
  drop constraint if exists profiles_learner_education_level_check;

with classified as (
  select
    id,
    case
      when lower(coalesce(grade, '')) ~ '(form[[:space:]]*[1-3]|(^|[^a-z])f[1-3]([^0-9]|$))'
        then 'Secondary High'
      when lower(coalesce(grade, '')) ~ '(form[[:space:]]*[4-5]|(^|[^a-z])f[45]([^0-9]|$))'
        then 'High School'
      when lower(coalesce(grade, '')) ~ '(form[[:space:]]*6|sixth[[:space:]]*form|lower[[:space:]]*sixth|upper[[:space:]]*sixth|a[- ]?level|matric|grade[[:space:]]*12|year[[:space:]]*12)'
        then 'Matric'
      when lower(coalesce(grade, '')) ~ '(primary|standard[[:space:]]*[1-7]|grade[[:space:]]*[1-7])'
        and coalesce(course, '') = ''
        then 'Primary'
      when coalesce(nullif(trim(course), ''), '') <> ''
        and lower(coalesce(grade, '')) ~ '(year[[:space:]]*[1-9]|level[[:space:]]*[1-9]|semester[[:space:]]*[1-9]|stage[[:space:]]*[1-9])'
        then 'Tertiary'
      when education_level in ('Primary','Secondary High','High School','Matric','Tertiary')
        then education_level
      else 'Secondary High'
    end as classified_level
  from public.profiles
  where role = 'learner'
)
update public.profiles p
set education_level = c.classified_level,
    institution_type = case
      when c.classified_level = 'Tertiary' then coalesce(nullif(p.institution_type,''),'')
      else 'School'
    end,
    qualification_level = case
      when c.classified_level = 'Tertiary' then coalesce(nullif(p.qualification_level,''),'')
      else ''
    end,
    updated_at = pg_catalog.now()
from classified c
where p.id = c.id;

alter table public.profiles
  add constraint profiles_learner_education_level_check
  check (role <> 'learner' or education_level in ('Primary','Secondary High','High School','Matric','Tertiary')) not valid;
alter table public.profiles validate constraint profiles_learner_education_level_check;

alter table public.profiles
  drop constraint if exists profiles_learner_institution_type_check;
alter table public.profiles
  add constraint profiles_learner_institution_type_check
  check (
    role <> 'learner'
    or institution_type = ''
    or institution_type in ('School','University','College','Technical / TVET','Other')
  ) not valid;
alter table public.profiles validate constraint profiles_learner_institution_type_check;

alter table public.profiles
  drop constraint if exists profiles_learner_qualification_level_check;
alter table public.profiles
  add constraint profiles_learner_qualification_level_check
  check (
    role <> 'learner'
    or qualification_level = ''
    or qualification_level in (
      'Certificate','Higher Certificate','Diploma','Advanced Diploma','Associate Degree',
      'Bachelor''s Degree','Honours Degree','Postgraduate Certificate','Postgraduate Diploma',
      'Master''s Degree','Doctorate / PhD','Other'
    )
  ) not valid;
alter table public.profiles validate constraint profiles_learner_qualification_level_check;

create or replace function public.update_studyspace_learner_academic_profile(
  p_full_name text,
  p_preferred_name text,
  p_country text,
  p_institution text,
  p_education_level text,
  p_grade text,
  p_curriculum text,
  p_academic_year text,
  p_course text,
  p_institution_type text,
  p_qualification_level text
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_institution_type text := coalesce(nullif(pg_catalog.btrim(p_institution_type), ''), 'School');
  v_qualification_level text := coalesce(pg_catalog.btrim(p_qualification_level), '');
  v_course text := coalesce(pg_catalog.btrim(p_course), '');
begin
  if not public.is_active_studyspace_learner() then
    raise exception 'An active learner account is required';
  end if;
  if p_education_level not in ('Primary','Secondary High','High School','Matric','Tertiary') then
    raise exception 'Choose a valid education stage';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_grade,''))) = 0 then
    raise exception 'Choose your grade, form or year of study';
  end if;
  if p_education_level = 'Tertiary' then
    if v_institution_type not in ('University','College','Technical / TVET','Other') then
      raise exception 'Choose your tertiary institution type';
    end if;
    if v_qualification_level not in (
      'Certificate','Higher Certificate','Diploma','Advanced Diploma','Associate Degree',
      'Bachelor''s Degree','Honours Degree','Postgraduate Certificate','Postgraduate Diploma',
      'Master''s Degree','Doctorate / PhD','Other'
    ) then
      raise exception 'Choose your qualification or award level';
    end if;
    if pg_catalog.length(v_course) = 0 then
      raise exception 'Enter your course or programme';
    end if;
  else
    v_institution_type := 'School';
    v_qualification_level := '';
    v_course := '';
  end if;

  perform public.update_studyspace_learner_profile(
    p_full_name,p_preferred_name,p_country,p_institution,p_education_level,
    p_grade,p_curriculum,p_academic_year,v_course
  );

  update public.profiles
  set institution_type = v_institution_type,
      qualification_level = v_qualification_level,
      updated_at = pg_catalog.now()
  where id = auth.uid()
    and role = 'learner';
end;
$function$;

revoke all on function public.update_studyspace_learner_academic_profile(text,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.update_studyspace_learner_academic_profile(text,text,text,text,text,text,text,text,text,text,text) to authenticated;

comment on column public.profiles.education_level is 'Learner education stage: Primary, Secondary High (Forms 1-3), High School (Forms 4-5), Matric/Sixth Form (Form 6), or Tertiary.';
comment on column public.profiles.institution_type is 'Institution type for tertiary learners; School for primary and secondary-stage learners.';
comment on column public.profiles.qualification_level is 'Tertiary award pathway such as certificate, diploma, degree, masters or doctorate.';
