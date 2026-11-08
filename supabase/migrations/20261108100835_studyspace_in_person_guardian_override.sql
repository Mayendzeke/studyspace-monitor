-- Allow a pending online submission to be completed in person instead.
-- In-person verification supersedes the online submission, records the final details,
-- and opens the learner account in the same transaction.
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
  )
  on conflict (learner_id) do update
  set guardian_full_name = excluded.guardian_full_name,
      relationship = excluded.relationship,
      relationship_details = excluded.relationship_details,
      guardian_phone = excluded.guardian_phone,
      consent_given = true,
      terms_version = excluded.terms_version,
      terms_accepted_at = excluded.terms_accepted_at,
      verified_by = excluded.verified_by,
      verified_at = excluded.verified_at,
      verification_source = 'in_person',
      approval_status = 'approved';

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
    jsonb_build_object('relationship',p_relationship,'consent_recorded_in_person',true,
      'superseded_online_submission',true));
  return true;
end;
$function$;

revoke all on function public.activate_studyspace_minor_learner(uuid,text,text,text,text,boolean,text,uuid)
  from public, anon, authenticated;
grant execute on function public.activate_studyspace_minor_learner(uuid,text,text,text,text,boolean,text,uuid)
  to service_role;
