-- Age-gated enrolment and in-person guardian consent.
alter table public.profiles
  add column if not exists date_of_birth date;

alter table public.profiles
  drop constraint if exists profiles_account_status_check;

alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('pending','pending_guardian_verification','active','disabled'));

create index if not exists profiles_guardian_verification_queue_idx
  on public.profiles (created_at desc)
  where role = 'learner' and account_status = 'pending_guardian_verification';

create table if not exists public.guardian_verifications (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null unique references public.profiles(id) on delete cascade,
  guardian_full_name text not null check (char_length(btrim(guardian_full_name)) between 2 and 120),
  relationship text not null check (relationship in ('mother','father','legal_guardian','grandparent','other')),
  relationship_details text not null default '' check (char_length(relationship_details) <= 100),
  guardian_phone text not null check (char_length(btrim(guardian_phone)) between 7 and 30),
  consent_given boolean not null check (consent_given = true),
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  verified_by uuid not null references public.profiles(id),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists guardian_verifications_verified_by_idx
  on public.guardian_verifications (verified_by);

alter table public.guardian_verifications enable row level security;
revoke all on public.guardian_verifications from public, anon, authenticated;
grant all on public.guardian_verifications to service_role;

-- Replace the four-argument enrolment RPC with a DOB-aware version.
drop function if exists public.complete_studyspace_enrolment(uuid,text,text,text);

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
  trial_started timestamptz := clock_timestamp();
  cleaned_full_name text := btrim(coalesce(p_full_name, ''));
  cleaned_preferred_name text := btrim(coalesce(p_preferred_name, ''));
  accepted_name text := btrim(coalesce(p_accepted_by_name, ''));
begin
  if p_learner_id is null then
    raise exception 'A learner account is required.';
  end if;
  if p_student_id is null or p_student_id !~ '^STU-[A-Z0-9]{8}$' then
    raise exception 'A valid Student ID is required.';
  end if;
  if length(cleaned_full_name) < 2 or length(cleaned_full_name) > 120 then
    raise exception 'Enter the learner’s full name.';
  end if;
  if length(cleaned_preferred_name) > 80 then
    raise exception 'The preferred name is too long.';
  end if;
  if p_date_of_birth is null or p_date_of_birth > current_date then
    raise exception 'Enter a valid date of birth.';
  end if;

  learner_age := extract(year from age(current_date, p_date_of_birth))::integer;
  if learner_age < 18 then
    if p_accepted_by_name is not null or p_acceptance_role is not null then
      raise exception 'Guardian consent must be recorded in StudySpace Monitor after in-person verification.';
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
    where role = 'learner'
      and (account_status = 'active' or student_id is not null)
  ) >= 100 then
    return 'capacity_reached';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_learner_id and role = 'learner' and account_status = 'pending'
  ) then
    raise exception 'This learner account is not eligible for first-time enrolment.';
  end if;

  if not exists (
    select 1 from public.enrolment_pins
    where student_id = p_student_id
      and redeemed_by = p_learner_id
      and redeemed_at is not null
      and revoked_at is null
  ) then
    raise exception 'A valid one-time enrolment PIN must be claimed before account registration.';
  end if;

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

revoke all on function public.complete_studyspace_enrolment(uuid,text,text,text,date,text,text)
  from public, anon, authenticated;
grant execute on function public.complete_studyspace_enrolment(uuid,text,text,text,date,text,text)
  to service_role;

-- A guardian's consent and account activation are committed in one transaction.
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
  learner_dob date;
begin
  if p_learner_id is null or p_verified_by is null then
    raise exception 'Learner and verifying representative are required.';
  end if;
  if p_guardian_consent is distinct from true then
    raise exception 'Guardian consent must be explicitly confirmed.';
  end if;
  if p_terms_version is distinct from '2026-11-07-v3' then
    raise exception 'The current Terms and Conditions must be accepted.';
  end if;
  if length(btrim(coalesce(p_guardian_full_name,''))) < 2
     or length(btrim(p_guardian_full_name)) > 120 then
    raise exception 'Enter the guardian’s full name.';
  end if;
  if p_relationship is null or p_relationship not in ('mother','father','legal_guardian','grandparent','other') then
    raise exception 'Choose the guardian’s relationship to the learner.';
  end if;
  if p_relationship = 'other' and length(btrim(coalesce(p_relationship_details,''))) < 2 then
    raise exception 'Describe the guardian’s relationship to the learner.';
  end if;
  if length(btrim(coalesce(p_guardian_phone,''))) < 7
     or length(btrim(p_guardian_phone)) > 30
     or p_guardian_phone !~ '^\+?[0-9][0-9 ()-]{5,28}$' then
    raise exception 'Enter a valid guardian contact number.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_verified_by and role = 'admin' and account_status = 'active'
  ) then
    raise exception 'An active StudySpace administrator is required.';
  end if;

  select date_of_birth into learner_dob
  from public.profiles
  where id = p_learner_id
    and role = 'learner'
    and account_status = 'pending_guardian_verification'
  for update;

  if learner_dob is null or learner_dob > current_date
     or extract(year from age(current_date, learner_dob)) >= 18 then
    raise exception 'This account is not awaiting minor guardian verification.';
  end if;

  insert into public.guardian_verifications(
    learner_id,guardian_full_name,relationship,relationship_details,guardian_phone,
    consent_given,terms_version,terms_accepted_at,verified_by,verified_at
  ) values (
    p_learner_id,btrim(p_guardian_full_name),p_relationship,
    case when p_relationship = 'other' then btrim(coalesce(p_relationship_details,'')) else '' end,
    btrim(p_guardian_phone),true,p_terms_version,trial_started,p_verified_by,trial_started
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

revoke all on function public.activate_studyspace_minor_learner(uuid,text,text,text,text,boolean,text,uuid)
  from public, anon, authenticated;
grant execute on function public.activate_studyspace_minor_learner(uuid,text,text,text,text,boolean,text,uuid)
  to service_role;

-- Close the legacy PIN-redemption bypass for accounts without a verified adult DOB.
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
      and extract(year from age(current_date, date_of_birth)) >= 18
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

revoke all on function public.redeem_studyspace_pin(text) from public, anon;
grant execute on function public.redeem_studyspace_pin(text) to authenticated, service_role;
