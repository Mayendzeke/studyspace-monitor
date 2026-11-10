CREATE OR REPLACE FUNCTION public.complete_public_studyspace_enrolment(p_learner_id uuid, p_student_id text, p_full_name text, p_preferred_name text, p_date_of_birth date, p_sex text, p_accepted_by_name text, p_acceptance_role text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  learner_age integer;
  local_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Mbabane')::date;
  trial_started timestamptz := pg_catalog.clock_timestamp();
  cleaned_full_name text := pg_catalog.btrim(coalesce(p_full_name, ''));
  cleaned_preferred_name text := pg_catalog.btrim(coalesce(p_preferred_name, ''));
  accepted_name text := pg_catalog.btrim(coalesce(p_accepted_by_name, ''));
begin
  if p_learner_id is null then
    raise exception 'A learner account is required.';
  end if;

  if p_student_id is null or p_student_id !~ '^STU-[A-Z0-9]{8}$' then
    raise exception 'A valid generated Student ID is required.';
  end if;

  if pg_catalog.length(cleaned_full_name) < 2 or pg_catalog.length(cleaned_full_name) > 120 then
    raise exception 'Enter the learner’s full name.';
  end if;

  if pg_catalog.length(cleaned_preferred_name) > 80 then
    raise exception 'The preferred name is too long.';
  end if;

  if p_date_of_birth is null or p_date_of_birth > local_today then
    raise exception 'Enter a valid date of birth.';
  end if;

  if p_sex is null or p_sex not in ('male', 'female') then
    raise exception 'Choose Male or Female.';
  end if;

  learner_age := extract(year from pg_catalog.age(local_today, p_date_of_birth))::integer;
  if learner_age < 9 then
    raise exception 'StudySpace registration is not available for children under 9 years old.';
  end if;

  if learner_age < 18 then
    if p_accepted_by_name is not null or p_acceptance_role is not null then
      raise exception 'Guardian consent must be recorded through StudySpace Monitor or the guardian invitation link.';
    end if;
  else
    if pg_catalog.length(accepted_name) < 2
       or pg_catalog.length(accepted_name) > 120
       or accepted_name <> cleaned_full_name
       or p_acceptance_role is distinct from 'adult_learner' then
      raise exception 'An adult learner must personally accept the current Terms and Conditions.';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('studyspace-enrolment-capacity', 0)
  );

  if (
    select pg_catalog.count(*)
    from public.profiles
    where role = 'learner'
      and (account_status = 'active' or student_id is not null)
  ) >= 100 then
    return 'capacity_reached';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_learner_id
      and role = 'learner'
      and account_status = 'pending'
  ) then
    raise exception 'This learner account is not eligible for first-time enrolment.';
  end if;

  if exists (
    select 1
    from public.profiles
    where upper(student_id) = upper(p_student_id)
  ) then
    raise exception 'The generated Student ID is already in use. Please retry registration.';
  end if;

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
        updated_at = trial_started
    where id = p_learner_id
      and role = 'learner'
      and account_status = 'pending';

    if not found then
      raise exception 'The learner registration could not be saved.';
    end if;

    insert into public.audit_events(actor_id, event_type, target_type, target_id, details)
    values (
      p_learner_id,
      'learner_guardian_verification_required',
      'profile',
      p_learner_id::text,
      pg_catalog.jsonb_build_object('age_band', 'under_18', 'registration_source', 'public_self_service')
    );

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
      terms_version = '2026-11-09-v8',
      terms_accepted_by_name = accepted_name,
      terms_acceptance_role = 'adult_learner',
      updated_at = trial_started
  where id = p_learner_id
    and role = 'learner'
    and account_status = 'pending';

  if not found then
    raise exception 'The learner account could not be activated.';
  end if;

  insert into public.audit_events(actor_id, event_type, target_type, target_id, details)
  values (
    p_learner_id,
    'learner_account_enrolled',
    'profile',
    p_learner_id::text,
    pg_catalog.jsonb_build_object('registration_source', 'public_self_service')
  );

  return 'active';
end;
$function$


revoke all on function public.complete_public_studyspace_enrolment(uuid, text, text, text, date, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_public_studyspace_enrolment(uuid, text, text, text, date, text, text, text) to service_role;
notify pgrst, 'reload schema';
