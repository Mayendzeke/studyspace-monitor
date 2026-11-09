
alter table public.profiles
  add column if not exists sex text;

alter table public.profiles
  drop constraint if exists profiles_sex_check;
alter table public.profiles
  add constraint profiles_sex_check
  check (sex is null or sex in ('male','female'));

create or replace function public.guard_studyspace_immutable_identity_fields()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user not in ('service_role','postgres','supabase_admin') then
    if old.date_of_birth is not null and new.date_of_birth is distinct from old.date_of_birth then
      raise exception 'Date of birth is locked after registration. Contact StudySpace support for a verified correction.';
    end if;
    if old.sex is not null and new.sex is distinct from old.sex then
      raise exception 'Sex is locked after registration. Contact StudySpace support for a verified correction.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists studyspace_profile_identity_immutable on public.profiles;
create trigger studyspace_profile_identity_immutable
before update of date_of_birth, sex on public.profiles
for each row execute function public.guard_studyspace_immutable_identity_fields();

revoke all on function public.guard_studyspace_immutable_identity_fields() from public, anon, authenticated;

create or replace function public.set_studyspace_learner_sex(p_sex text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_sex is null or p_sex not in ('male','female') then
    raise exception 'Choose Male or Female.';
  end if;
  if not public.is_active_studyspace_learner() then
    raise exception 'An active learner account is required.';
  end if;
  update public.profiles
  set sex = p_sex, updated_at = now()
  where id = auth.uid() and role = 'learner' and sex is null;
  if not found then
    raise exception 'Your sex has already been recorded and cannot be changed.';
  end if;
end;
$function$;

revoke all on function public.set_studyspace_learner_sex(text) from public, anon;
grant execute on function public.set_studyspace_learner_sex(text) to authenticated;

drop function if exists public.complete_studyspace_enrolment(uuid,text,text,text,date,text,text);
create function public.complete_studyspace_enrolment(
  p_learner_id uuid,
  p_student_id text,
  p_full_name text,
  p_preferred_name text,
  p_date_of_birth date,
  p_sex text,
  p_accepted_by_name text,
  p_acceptance_role text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  learner_age integer;
  local_today date := (clock_timestamp() at time zone 'Africa/Mbabane')::date;
  trial_started timestamptz := clock_timestamp();
  cleaned_full_name text := btrim(coalesce(p_full_name, ''));
  cleaned_preferred_name text := btrim(coalesce(p_preferred_name, ''));
  accepted_name text := btrim(coalesce(p_accepted_by_name, ''));
begin
  if p_learner_id is null then raise exception 'A learner account is required.'; end if;
  if p_student_id is null or p_student_id !~ '^STU-[A-Z0-9]{8}$' then raise exception 'A valid Student ID is required.'; end if;
  if length(cleaned_full_name) < 2 or length(cleaned_full_name) > 120 then raise exception 'Enter the learner’s full name.'; end if;
  if length(cleaned_preferred_name) > 80 then raise exception 'The preferred name is too long.'; end if;
  if p_date_of_birth is null or p_date_of_birth > local_today then raise exception 'Enter a valid date of birth.'; end if;
  if p_sex is null or p_sex not in ('male','female') then raise exception 'Choose Male or Female.'; end if;

  learner_age := extract(year from age(local_today, p_date_of_birth))::integer;
  if learner_age < 8 then raise exception 'StudySpace registration is not available for children under 8 years old.'; end if;
  if learner_age < 18 then
    if p_accepted_by_name is not null or p_acceptance_role is not null then
      raise exception 'Guardian consent must be recorded through StudySpace Monitor or the guardian invitation link.';
    end if;
  else
    if length(accepted_name) < 2 or length(accepted_name) > 120
       or accepted_name <> cleaned_full_name
       or p_acceptance_role is distinct from 'adult_learner' then
      raise exception 'An adult learner must personally accept the current Terms and Conditions.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('studyspace-enrolment-capacity', 0));
  if (
    select count(*) from public.profiles
    where role = 'learner' and (account_status = 'active' or student_id is not null)
  ) >= 100 then return 'capacity_reached'; end if;

  if not exists (
    select 1 from public.profiles
    where id = p_learner_id and role = 'learner' and account_status = 'pending'
  ) then raise exception 'This learner account is not eligible for first-time enrolment.'; end if;

  if not exists (
    select 1 from public.enrolment_pins
    where student_id = p_student_id and redeemed_by = p_learner_id
      and redeemed_at is not null and revoked_at is null
  ) then raise exception 'A valid one-time enrolment PIN must be claimed before account registration.'; end if;

  if learner_age < 18 then
    update public.profiles
    set student_id = p_student_id,
        full_name = cleaned_full_name,
        preferred_name = coalesce(nullif(cleaned_preferred_name, ''), cleaned_full_name),
        date_of_birth = p_date_of_birth,
        sex = p_sex,
        account_status = 'pending_guardian_verification',
        subscription_tier = null,
        subscription_expires_at = null,
        trial_started_at = null,
        trial_expires_at = null,
        trial_reminder_shown_at = null,
        terms_accepted_at = null,
        terms_version = null,
        terms_accepted_by_name = null,
        terms_acceptance_role = null,
        updated_at = now()
    where id = p_learner_id and role = 'learner' and account_status = 'pending';
    if not found then raise exception 'The learner registration could not be saved.'; end if;
    insert into public.audit_events(actor_id,event_type,target_type,target_id,details)
    values (p_learner_id,'learner_guardian_verification_required','profile',p_learner_id::text,
      jsonb_build_object('age_band','under_18'));
    return 'pending_guardian_verification';
  end if;

  update public.profiles
  set student_id = p_student_id,
      full_name = cleaned_full_name,
      preferred_name = coalesce(nullif(cleaned_preferred_name, ''), cleaned_full_name),
      date_of_birth = p_date_of_birth,
      sex = p_sex,
      account_status = 'active',
      subscription_tier = null,
      subscription_expires_at = null,
      trial_started_at = trial_started,
      trial_expires_at = trial_started + interval '48 hours',
      trial_reminder_shown_at = null,
      terms_accepted_at = trial_started,
      terms_version = '2026-11-08-v6',
      terms_accepted_by_name = accepted_name,
      terms_acceptance_role = 'adult_learner',
      updated_at = trial_started
  where id = p_learner_id and role = 'learner' and account_status = 'pending';
  if not found then raise exception 'The learner account could not be activated.'; end if;

  insert into public.audit_events(actor_id,event_type,target_type,target_id)
  values (p_learner_id,'learner_account_enrolled','profile',p_learner_id::text);
  return 'active';
end;
$function$;

revoke all on function public.complete_studyspace_enrolment(uuid,text,text,text,date,text,text,text)
  from public, anon, authenticated;
grant execute on function public.complete_studyspace_enrolment(uuid,text,text,text,date,text,text,text)
  to service_role;

do $publication$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'student_timetable_entries'
  ) then
    alter publication supabase_realtime add table public.student_timetable_entries;
  end if;
end;
$publication$;
