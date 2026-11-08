-- Guardian share links: parent-led consent can be submitted online, but Monitor approval is still required.
alter table public.guardian_verifications
  alter column verified_by drop not null,
  alter column verified_at drop not null,
  add column if not exists verification_source text not null default 'in_person',
  add column if not exists approval_status text not null default 'approved';

alter table public.guardian_verifications
  drop constraint if exists guardian_verifications_verification_source_check,
  add constraint guardian_verifications_verification_source_check
    check (verification_source in ('in_person','guardian_link')),
  drop constraint if exists guardian_verifications_approval_status_check,
  add constraint guardian_verifications_approval_status_check
    check (approval_status in ('pending','approved','rejected'));

create table if not exists public.guardian_verification_invites (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null unique references public.profiles(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists guardian_verification_invites_expiry_idx
  on public.guardian_verification_invites (expires_at)
  where redeemed_at is null and revoked_at is null;
create index if not exists guardian_verifications_status_idx
  on public.guardian_verifications (approval_status, created_at desc);

alter table public.guardian_verification_invites enable row level security;
revoke all on public.guardian_verification_invites from public, anon, authenticated;
grant all on public.guardian_verification_invites to service_role;
revoke all on public.guardian_verifications from public, anon, authenticated;
grant all on public.guardian_verifications to service_role;

-- Public guardian link submission. Only a one-time SHA-256 token hash is stored.
create or replace function public.submit_studyspace_guardian_link_consent(
  p_token_hash text,
  p_guardian_full_name text,
  p_relationship text,
  p_relationship_details text,
  p_guardian_phone text,
  p_guardian_consent boolean,
  p_terms_version text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  invite_id uuid;
  learner_id uuid;
  learner_dob date;
  submitted_at timestamptz := clock_timestamp();
  guardian_name text := btrim(coalesce(p_guardian_full_name,''));
  relationship_detail text := btrim(coalesce(p_relationship_details,''));
  guardian_contact text := btrim(coalesce(p_guardian_phone,''));
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'This guardian invitation is invalid or has expired.';
  end if;
  if p_guardian_consent is distinct from true then
    raise exception 'The parent or legal guardian must personally give consent.';
  end if;
  if p_terms_version is distinct from '2026-11-07-v3' then
    raise exception 'The current StudySpace Terms and Conditions must be reviewed.';
  end if;
  if length(guardian_name) < 2 or length(guardian_name) > 120 then
    raise exception 'Enter the guardian’s full name.';
  end if;
  if p_relationship is null or p_relationship not in ('mother','father','legal_guardian','grandparent','other') then
    raise exception 'Choose the guardian’s relationship to the learner.';
  end if;
  if p_relationship = 'other' and (length(relationship_detail) < 2 or length(relationship_detail) > 100) then
    raise exception 'Describe the guardian’s relationship to the learner.';
  end if;
  if length(guardian_contact) < 7 or length(guardian_contact) > 30
     or guardian_contact !~ '^\+?[0-9][0-9 ()-]{5,28}$' then
    raise exception 'Enter a valid guardian contact number.';
  end if;

  select id, guardian_verification_invites.learner_id
    into invite_id, learner_id
  from public.guardian_verification_invites
  where token_hash = p_token_hash
    and redeemed_at is null
    and revoked_at is null
    and expires_at > submitted_at
  for update;

  if invite_id is null or learner_id is null then
    raise exception 'This guardian invitation is invalid, expired or already used. Ask StudySpace for a new link.';
  end if;

  select date_of_birth into learner_dob
  from public.profiles
  where id = learner_id
    and role = 'learner'
    and account_status = 'pending_guardian_verification'
  for update;

  if learner_dob is null or learner_dob > (submitted_at at time zone 'Africa/Mbabane')::date
     or extract(year from age((submitted_at at time zone 'Africa/Mbabane')::date, learner_dob)) >= 18 then
    raise exception 'This invitation is no longer awaiting minor guardian verification.';
  end if;

  insert into public.guardian_verifications(
    learner_id,guardian_full_name,relationship,relationship_details,guardian_phone,
    consent_given,terms_version,terms_accepted_at,verified_by,verified_at,
    verification_source,approval_status
  ) values (
    learner_id,guardian_name,p_relationship,
    case when p_relationship = 'other' then relationship_detail else '' end,
    guardian_contact,true,p_terms_version,submitted_at,null,null,
    'guardian_link','pending'
  );

  update public.guardian_verification_invites
  set redeemed_at = submitted_at
  where id = invite_id and redeemed_at is null and revoked_at is null;
  if not found then raise exception 'This guardian invitation has already been used.'; end if;

  insert into public.audit_events(actor_id,event_type,target_type,target_id,details)
  values (null,'learner_guardian_consent_submitted_online','profile',learner_id::text,
    jsonb_build_object('verification_source','guardian_link'));
  return true;
end;
$function$;

revoke all on function public.submit_studyspace_guardian_link_consent(text,text,text,text,text,boolean,text)
  from public, anon, authenticated;
grant execute on function public.submit_studyspace_guardian_link_consent(text,text,text,text,text,boolean,text)
  to service_role;

-- Monitor approval commits consent verification, trial start and account activation atomically.
create or replace function public.approve_studyspace_guardian_link_consent(
  p_learner_id uuid,
  p_verified_by uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  verification public.guardian_verifications%rowtype;
  learner_dob date;
  approved_at timestamptz := clock_timestamp();
  local_today date := (clock_timestamp() at time zone 'Africa/Mbabane')::date;
begin
  if p_learner_id is null or p_verified_by is null then
    raise exception 'Learner and verifying administrator are required.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_verified_by and role = 'admin' and account_status = 'active'
  ) then raise exception 'An active StudySpace administrator is required.'; end if;

  select * into verification
  from public.guardian_verifications
  where learner_id = p_learner_id
    and verification_source = 'guardian_link'
    and approval_status = 'pending'
    and consent_given = true
    and terms_version = '2026-11-07-v3'
  for update;
  if not found then raise exception 'No pending guardian-link consent submission exists for this learner.'; end if;

  select date_of_birth into learner_dob
  from public.profiles
  where id = p_learner_id
    and role = 'learner'
    and account_status = 'pending_guardian_verification'
  for update;
  if learner_dob is null or learner_dob > local_today
     or extract(year from age(local_today, learner_dob)) >= 18 then
    raise exception 'This learner is not eligible for guardian verification.';
  end if;

  update public.guardian_verifications
  set approval_status = 'approved',
      verified_by = p_verified_by,
      verified_at = approved_at
  where id = verification.id and approval_status = 'pending';

  update public.profiles
  set account_status = 'active',
      subscription_tier = null,
      subscription_expires_at = null,
      trial_started_at = approved_at,
      trial_expires_at = approved_at + interval '48 hours',
      trial_reminder_shown_at = null,
      terms_accepted_at = verification.terms_accepted_at,
      terms_version = verification.terms_version,
      terms_accepted_by_name = verification.guardian_full_name,
      terms_acceptance_role = 'parent_guardian',
      updated_at = approved_at
  where id = p_learner_id and account_status = 'pending_guardian_verification';

  if not found then raise exception 'The learner account could not be activated.'; end if;

  insert into public.audit_events(actor_id,event_type,target_type,target_id,details)
  values (p_verified_by,'learner_guardian_link_consent_approved','profile',p_learner_id::text,
    jsonb_build_object('verification_source','guardian_link'));
  return true;
end;
$function$;

revoke all on function public.approve_studyspace_guardian_link_consent(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.approve_studyspace_guardian_link_consent(uuid,uuid)
  to service_role;
