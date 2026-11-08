alter table public.profiles
  add column if not exists avatar_path text;

alter table public.student_feedback
  add column if not exists testimonial_private_consent boolean not null default false;

alter table public.student_feedback
  drop constraint if exists student_feedback_category_check;

alter table public.student_feedback
  add constraint student_feedback_category_check
  check (category = any (array[
    'Bug report'::text,
    'Suggestion'::text,
    'Content issue'::text,
    'Accessibility'::text,
    'Other'::text,
    'Testimonial'::text
  ]));

alter table public.student_feedback
  add constraint student_feedback_testimonial_consent_check
  check (category <> 'Testimonial' or testimonial_private_consent = true);

create policy studyspace_avatar_read_owner_or_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'studyspace-avatars'
  and (
    (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and public.is_active_studyspace_learner()
    )
    or public.is_studyspace_admin()
  )
);

create policy studyspace_avatar_upload_owner
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'studyspace-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.is_active_studyspace_learner()
);

create policy studyspace_avatar_delete_owner
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'studyspace-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.is_active_studyspace_learner()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'studyspace-avatars',
  'studyspace-avatars',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']::text[];

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
begin
  if not public.is_active_studyspace_learner() then
    raise exception 'An active learner account is required';
  end if;

  update public.profiles
  set
    preferred_name = left(coalesce(p_preferred_name, ''), 80),
    institution = left(coalesce(p_institution, ''), 160),
    education_level = left(coalesce(p_education_level, ''), 80),
    grade = left(coalesce(p_grade, ''), 80),
    curriculum = left(coalesce(p_curriculum, ''), 120),
    academic_year = left(coalesce(p_academic_year, ''), 30),
    updated_at = now()
  where id = auth.uid();
end;
$function$;

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
begin
  if not public.is_active_studyspace_learner() then
    raise exception 'An active learner account is required';
  end if;

  update public.profiles
  set
    preferred_name = left(coalesce(p_preferred_name, ''), 80),
    institution = left(coalesce(p_institution, ''), 80),
    education_level = left(coalesce(p_education_level, ''), 80),
    grade = left(coalesce(p_grade, ''), 80),
    curriculum = left(coalesce(p_curriculum, ''), 120),
    academic_year = left(coalesce(p_academic_year, ''), 30),
    course = left(coalesce(p_course, ''), 160),
    updated_at = now()
  where id = auth.uid();
end;
$function$;

create or replace function public.update_studyspace_learner_avatar(p_avatar_path text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_active_studyspace_learner() then
    raise exception 'An active learner account is required';
  end if;

  if p_avatar_path is not null
    and p_avatar_path !~ ('^' || auth.uid()::text || '/avatar-[A-Fa-f0-9-]+\\.(png|jpg|webp)$') then
    raise exception 'The profile image path is invalid';
  end if;

  update public.profiles
  set avatar_path = p_avatar_path,
      updated_at = now()
  where id = auth.uid();
end;
$function$;

revoke all on function public.update_studyspace_learner_avatar(text) from public, anon;
grant execute on function public.update_studyspace_learner_avatar(text) to authenticated;
