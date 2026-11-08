-- Enforce a hard limit of 100 enrolled learner accounts at the database layer.
-- The capacity lock serializes successful enrolment completions so concurrent requests
-- cannot create more than 100 active learner accounts.

create or replace function public.studyspace_enrolment_capacity_available()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*) < 100
  from public.profiles
  where role = 'learner'
    and (account_status = 'active' or student_id is not null);
$function$;

revoke all on function public.studyspace_enrolment_capacity_available() from public, anon, authenticated;
grant execute on function public.studyspace_enrolment_capacity_available() to service_role;

create or replace function public.complete_studyspace_enrolment(
  p_learner_id uuid,
  p_student_id text,
  p_accepted_by_name text,
  p_acceptance_role text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  trial_started timestamptz := clock_timestamp();
  accepted_name text := btrim(coalesce(p_accepted_by_name, ''));
begin
  if p_learner_id is null then
    raise exception 'A learner account is required.';
  end if;
  if p_student_id is null or p_student_id !~ '^STU-[A-Z0-9]{8}$' then
    raise exception 'A valid Student ID is required.';
  end if;
  if length(accepted_name) < 2 or length(accepted_name) > 120 then
    raise exception 'A valid terms acceptance name is required.';
  end if;
  if p_acceptance_role is null or p_acceptance_role not in ('adult_learner', 'parent_guardian') then
    raise exception 'A valid terms acceptance role is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('studyspace-enrolment-capacity', 0));

  if (
    select count(*)
    from public.profiles
    where role = 'learner'
      and (account_status = 'active' or student_id is not null)
  ) >= 100 then
    return false;
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_learner_id
      and role = 'learner'
      and account_status = 'pending'
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
    raise exception 'A valid one-time enrolment PIN must be claimed before account activation.';
  end if;

  update public.profiles
  set student_id = p_student_id,
      account_status = 'active',
      subscription_tier = null,
      subscription_expires_at = null,
      trial_started_at = trial_started,
      trial_expires_at = trial_started + interval '48 hours',
      trial_reminder_shown_at = null,
      terms_accepted_at = trial_started,
      terms_version = '2026-11-07-v3',
      terms_accepted_by_name = accepted_name,
      terms_acceptance_role = p_acceptance_role,
      updated_at = trial_started
  where id = p_learner_id
    and role = 'learner'
    and account_status = 'pending';

  if not found then
    raise exception 'The learner account could not be activated.';
  end if;

  insert into public.audit_events(actor_id, event_type, target_type, target_id)
  values (p_learner_id, 'learner_account_enrolled', 'profile', p_learner_id::text);

  return true;
end;
$function$;

revoke all on function public.complete_studyspace_enrolment(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_studyspace_enrolment(uuid, text, text, text) to service_role;

-- Keep the legacy PIN redemption path under the same 100-learner ceiling.
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
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if (
    select count(*) from public.pin_redemption_attempts
    where user_id = auth.uid() and attempted_at > now() - interval '15 minutes'
  ) >= 5 then
    raise exception 'Too many PIN attempts. Try again in 15 minutes.';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'learner' and account_status = 'pending'
  ) then
    raise exception 'This account is not eligible for enrolment';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('studyspace-enrolment-capacity', 0));

  if (
    select count(*) from public.profiles
    where role = 'learner'
      and (account_status = 'active' or student_id is not null)
  ) >= 100 then
    insert into public.pin_redemption_attempts(user_id, was_successful) values (auth.uid(), false);
    return false;
  end if;

  update public.enrolment_pins
  set redeemed_by = auth.uid(), redeemed_at = now()
  where pin_hash = pin_digest
    and redeemed_by is null
    and redeemed_at is null
    and revoked_at is null
    and expires_at > now()
  returning id, student_id into redeemed_id, redeemed_student_id;

  if redeemed_id is null then
    insert into public.pin_redemption_attempts(user_id, was_successful) values (auth.uid(), false);
    return false;
  end if;

  trial_started := clock_timestamp();
  update public.profiles
  set student_id = redeemed_student_id,
      account_status = 'active',
      subscription_tier = null,
      subscription_expires_at = null,
      trial_started_at = trial_started,
      trial_expires_at = trial_started + interval '48 hours',
      trial_reminder_shown_at = null,
      updated_at = trial_started
  where id = auth.uid();

  insert into public.pin_redemption_attempts(user_id, was_successful) values (auth.uid(), true);
  insert into public.audit_events(actor_id, event_type, target_type, target_id)
  values (auth.uid(), 'enrolment_pin_redeemed', 'profile', auth.uid()::text);

  return true;
end;
$function$;

revoke all on function public.redeem_studyspace_pin(text) from public, anon;
grant execute on function public.redeem_studyspace_pin(text) to authenticated, service_role;
