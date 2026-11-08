-- Use Eswatini local calendar dates consistently for registration and guardian approval.
create or replace function public.complete_studyspace_enrolment(
  p_learner_id uuid,
  p_student_id text,
  p_full_name text,
  p_preferred_name text,
  p_date_of_birth date,
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

  learner_age := extract(year from age(local_today, p_date_of_birth))::integer;
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
  ) >= 100 then
    return 'capacity_reached';
  end if;

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
      account_status = 'active',
      subscription_tier = null,
      subscription_expires_at = null,
      trial_started_at = trial_started,
      trial_expires_at = trial_started + interval '48 hours',
      trial_reminder_shown_at = null,
      terms_accepted_at = trial_started,
      terms_version = '2026-11-07-v3',
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

create or replace function public.activate_studyspace_minor_learner(
  p_learner_id uuid,
  p_guardian_full_name text,
  p_relationship text,
  p_relationship_details text,
  p_guardian_phone text,
  p_guardian_consent boolean,
  p_terms_version text,
  p_verified_by uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  trial_started timestamptz := clock_timestamp();
  local_today date := (clock_timestamp() at time zone 'Africa/Mbabane')::date;
  learner_dob date;
begin
  if p_learner_id is null or p_verified_by is null then raise exception 'Learner and verifying representative are required.'; end if;
  if p_guardian_consent is distinct from true then raise exception 'Guardian consent must be explicitly confirmed.'; end if;
  if p_terms_version is distinct from '2026-11-07-v3' then raise exception 'The current Terms and Conditions must be accepted.'; end if;
  if length(btrim(coalesce(p_guardian_full_name,''))) < 2 or length(btrim(p_guardian_full_name)) > 120 then raise exception 'Enter the guardian’s full name.'; end if;
  if p_relationship is null or p_relationship not in ('mother','father','legal_guardian','grandparent','other') then raise exception 'Choose the guardian’s relationship to the learner.'; end if;
  if p_relationship = 'other' and length(btrim(coalesce(p_relationship_details,''))) < 2 then raise exception 'Describe the guardian’s relationship to the learner.'; end if;
  if length(btrim(coalesce(p_guardian_phone,''))) < 7 or length(btrim(p_guardian_phone)) > 30
     or p_guardian_phone !~ '^\+?[0-9][0-9 ()-]{5,28}$' then
    raise exception 'Enter a valid guardian contact number.';
  end if;
  if not exists (select 1 from public.profiles where id = p_verified_by and role = 'admin' and account_status = 'active') then
    raise exception 'An active StudySpace administrator is required.';
  end if;

  select date_of_birth into learner_dob
  from public.profiles
  where id = p_learner_id and role = 'learner' and account_status = 'pending_guardian_verification'
  for update;
  if learner_dob is null or learner_dob > local_today
     or extract(year from age(local_today, learner_dob)) >= 18 then
    raise exception 'This account is not awaiting minor guardian verification.';
  end if;

  insert into public.guardian_verifications(
    learner_id,guardian_full_name,relationship,relationship_details,guardian_phone,
    consent_given,terms_version,terms_accepted_at,verified_by,verified_at,
    verification_source,approval_status
  ) values (
    p_learner_id,btrim(p_guardian_full_name),p_relationship,
    case when p_relationship = 'other' then btrim(coalesce(p_relationship_details,'')) else '' end,
    btrim(p_guardian_phone),true,p_terms_version,trial_started,p_verified_by,trial_started,
    'in_person','approved'
  );

  update public.profiles
  set account_status = 'active',
      subscription_tier = null,
      subscription_expires_at = null,
      trial_started_at = trial_started,
      trial_expires_at = trial_started + interval '48 hours',
      trial_reminder_shown_at = null,
      terms_accepted_at = trial_started,
      terms_version = p_terms_version,
      terms_accepted_by_name = btrim(p_guardian_full_name),
      terms_acceptance_role = 'parent_guardian',
      updated_at = trial_started
  where id = p_learner_id and account_status = 'pending_guardian_verification';
  if not found then raise exception 'The learner account could not be activated.'; end if;

  insert into public.audit_events(actor_id,event_type,target_type,target_id,details)
  values (p_verified_by,'learner_guardian_consent_recorded','profile',p_learner_id::text,
    jsonb_build_object('relationship',p_relationship,'consent_recorded_in_person',true));
  return true;
end;
$function$;

create or replace function public.redeem_studyspace_pin(pin_digest text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  redeemed_id uuid;
  redeemed_student_id text;
  trial_started timestamptz;
  local_today date := (clock_timestamp() at time zone 'Africa/Mbabane')::date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if (select count(*) from public.pin_redemption_attempts
      where user_id = auth.uid() and attempted_at > now() - interval '15 minutes') >= 5 then
    raise exception 'Too many PIN attempts. Try again in 15 minutes.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'learner' and account_status = 'pending'
      and date_of_birth is not null
      and extract(year from age(local_today, date_of_birth)) >= 18
  ) then
    raise exception 'This registration route is available only to verified adult learners.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('studyspace-enrolment-capacity', 0));
  if (select count(*) from public.profiles where role='learner'
      and (account_status='active' or student_id is not null)) >= 100 then
    insert into public.pin_redemption_attempts(user_id,was_successful) values (auth.uid(),false);
    return false;
  end if;

  update public.enrolment_pins
  set redeemed_by=auth.uid(), redeemed_at=now()
  where pin_hash=pin_digest and redeemed_by is null and redeemed_at is null
    and revoked_at is null and expires_at>now()
  returning id,student_id into redeemed_id,redeemed_student_id;
  if redeemed_id is null then
    insert into public.pin_redemption_attempts(user_id,was_successful) values (auth.uid(),false);
    return false;
  end if;

  trial_started := clock_timestamp();
  update public.profiles
  set student_id=redeemed_student_id, account_status='active',
      subscription_tier=null, subscription_expires_at=null,
      trial_started_at=trial_started, trial_expires_at=trial_started+interval '48 hours',
      trial_reminder_shown_at=null, updated_at=trial_started
  where id=auth.uid();
  insert into public.pin_redemption_attempts(user_id,was_successful) values (auth.uid(),true);
  insert into public.audit_events(actor_id,event_type,target_type,target_id)
  values (auth.uid(),'enrolment_pin_redeemed','profile',auth.uid()::text);
  return true;
end;
$function$;
