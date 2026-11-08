alter table public.direct_messages
  add column if not exists edited_at timestamptz,
  add column if not exists unsent_at timestamptz;

alter table public.studyspace_group_messages
  add column if not exists edited_at timestamptz,
  add column if not exists unsent_at timestamptz;

alter table public.student_feedback
  add column if not exists testimonial_marketing_consent boolean not null default false;

alter table public.guardian_verifications
  add column if not exists testimonial_marketing_consent boolean not null default false;

create table if not exists public.direct_message_user_deletions (
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  deleted_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (message_id, user_id)
);

create table if not exists public.studyspace_group_message_user_deletions (
  message_id uuid not null references public.studyspace_group_messages(id) on delete cascade,
  group_id uuid not null references public.studyspace_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  deleted_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (message_id, user_id)
);

create index if not exists direct_message_user_deletions_user_idx
  on public.direct_message_user_deletions (user_id, deleted_at desc);
create index if not exists studyspace_group_message_user_deletions_user_group_idx
  on public.studyspace_group_message_user_deletions (user_id, group_id, deleted_at desc);

alter table public.direct_message_user_deletions enable row level security;
alter table public.studyspace_group_message_user_deletions enable row level security;

revoke all on public.direct_message_user_deletions from public, anon, authenticated;
revoke all on public.studyspace_group_message_user_deletions from public, anon, authenticated;
grant select, insert on public.direct_message_user_deletions to authenticated;
grant select, insert on public.studyspace_group_message_user_deletions to authenticated;

drop policy if exists direct_message_user_deletions_read_own on public.direct_message_user_deletions;
create policy direct_message_user_deletions_read_own
  on public.direct_message_user_deletions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists direct_message_user_deletions_insert_own on public.direct_message_user_deletions;
create policy direct_message_user_deletions_insert_own
  on public.direct_message_user_deletions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.direct_messages m
      where m.id = message_id
        and (m.sender_id = (select auth.uid()) or m.recipient_id = (select auth.uid()))
    )
  );

drop policy if exists studyspace_group_message_user_deletions_read_own on public.studyspace_group_message_user_deletions;
create policy studyspace_group_message_user_deletions_read_own
  on public.studyspace_group_message_user_deletions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists studyspace_group_message_user_deletions_insert_own on public.studyspace_group_message_user_deletions;
create policy studyspace_group_message_user_deletions_insert_own
  on public.studyspace_group_message_user_deletions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.studyspace_group_messages m
      where m.id = message_id and m.group_id = group_id
    )
  );

create or replace function public.guard_direct_message_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Sign in is required to modify a message.';
  end if;

  if new.id is distinct from old.id
     or new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Message identity and delivery details cannot be changed.';
  end if;

  if actor = old.sender_id then
    if new.read_at is distinct from old.read_at
       or new.delivered_at is distinct from old.delivered_at then
      raise exception 'Only the recipient can update delivery receipts.';
    end if;

    if new.unsent_at is distinct from old.unsent_at then
      if old.unsent_at is not null or new.unsent_at is null then
        raise exception 'This message has already been unsent.';
      end if;
      if new.body is distinct from 'This message was unsent.'
         or new.attachment_path is not null
         or coalesce(new.attachment_name, '') <> ''
         or coalesce(new.attachment_mime, '') <> ''
         or coalesce(new.attachment_size, 0) <> 0 then
        raise exception 'Unsend must remove the message content and attachment.';
      end if;
      new.unsent_at := pg_catalog.clock_timestamp();
      new.edited_at := old.edited_at;
    else
      if new.attachment_path is distinct from old.attachment_path
         or new.attachment_name is distinct from old.attachment_name
         or new.attachment_mime is distinct from old.attachment_mime
         or new.attachment_size is distinct from old.attachment_size then
        raise exception 'Attachments cannot be changed after a message is sent.';
      end if;
      if new.body is distinct from old.body then
        if old.unsent_at is not null then
          raise exception 'An unsent message cannot be edited.';
        end if;
        if old.created_at < pg_catalog.clock_timestamp() - interval '2 minutes' then
          raise exception 'Messages can only be edited within two minutes of sending.';
        end if;
        new.edited_at := pg_catalog.clock_timestamp();
      elsif new.edited_at is distinct from old.edited_at then
        raise exception 'The edit timestamp is managed by StudySpace.';
      end if;
    end if;
  elsif actor = old.recipient_id then
    if new.body is distinct from old.body
       or new.attachment_path is distinct from old.attachment_path
       or new.attachment_name is distinct from old.attachment_name
       or new.attachment_mime is distinct from old.attachment_mime
       or new.attachment_size is distinct from old.attachment_size
       or new.edited_at is distinct from old.edited_at
       or new.unsent_at is distinct from old.unsent_at then
      raise exception 'Recipients can only update delivery receipts.';
    end if;
    if old.read_at is not null and new.read_at is distinct from old.read_at then
      raise exception 'A read receipt cannot be cleared.';
    end if;
    if old.delivered_at is not null and new.delivered_at is distinct from old.delivered_at then
      raise exception 'A delivery receipt cannot be cleared.';
    end if;
  else
    raise exception 'Only a message participant can modify this message.';
  end if;

  return new;
end;
$function$;

create or replace function public.guard_studyspace_group_message_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
begin
  if actor is null or actor <> old.sender_id then
    raise exception 'Only the message sender can modify a group message.';
  end if;

  if new.id is distinct from old.id
     or new.group_id is distinct from old.group_id
     or new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Message identity cannot be changed.';
  end if;

  if new.unsent_at is distinct from old.unsent_at then
    if old.unsent_at is not null or new.unsent_at is null then
      raise exception 'This message has already been unsent.';
    end if;
    if new.body is distinct from 'This message was unsent.'
       or new.attachment_path is not null
       or coalesce(new.attachment_name, '') <> ''
       or coalesce(new.attachment_mime, '') <> ''
       or coalesce(new.attachment_size, 0) <> 0 then
      raise exception 'Unsend must remove the message content and attachment.';
    end if;
    new.unsent_at := pg_catalog.clock_timestamp();
    new.edited_at := old.edited_at;
  else
    if new.attachment_path is distinct from old.attachment_path
       or new.attachment_name is distinct from old.attachment_name
       or new.attachment_mime is distinct from old.attachment_mime
       or new.attachment_size is distinct from old.attachment_size then
      raise exception 'Attachments cannot be changed after a message is sent.';
    end if;
    if new.body is distinct from old.body then
      if old.unsent_at is not null then
        raise exception 'An unsent message cannot be edited.';
      end if;
      if old.created_at < pg_catalog.clock_timestamp() - interval '2 minutes' then
        raise exception 'Messages can only be edited within two minutes of sending.';
      end if;
      new.edited_at := pg_catalog.clock_timestamp();
    elsif new.edited_at is distinct from old.edited_at then
      raise exception 'The edit timestamp is managed by StudySpace.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists direct_messages_guard_update on public.direct_messages;
create trigger direct_messages_guard_update
  before update on public.direct_messages
  for each row execute function public.guard_direct_message_update();

drop trigger if exists studyspace_group_messages_guard_update on public.studyspace_group_messages;
create trigger studyspace_group_messages_guard_update
  before update on public.studyspace_group_messages
  for each row execute function public.guard_studyspace_group_message_update();

drop policy if exists direct_messages_sender_edit_or_unsend on public.direct_messages;
create policy direct_messages_sender_edit_or_unsend
  on public.direct_messages
  for update to authenticated
  using (sender_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()));

drop policy if exists studyspace_group_messages_sender_edit_or_unsend on public.studyspace_group_messages;
create policy studyspace_group_messages_sender_edit_or_unsend
  on public.studyspace_group_messages
  for update to authenticated
  using (sender_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()));

grant update (body, unsent_at, attachment_path, attachment_name, attachment_mime, attachment_size)
  on public.direct_messages to authenticated;
grant update (body, unsent_at, attachment_path, attachment_name, attachment_mime, attachment_size)
  on public.studyspace_group_messages to authenticated;

drop function if exists public.submit_studyspace_guardian_link_consent(text,text,text,text,text,boolean,text);
create function public.submit_studyspace_guardian_link_consent(
  p_token_hash text,
  p_guardian_full_name text,
  p_relationship text,
  p_relationship_details text,
  p_guardian_phone text,
  p_guardian_consent boolean,
  p_terms_version text,
  p_testimonial_marketing_consent boolean
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  invite_id uuid;
  learner_id uuid;
  learner_dob date;
  submitted_at timestamptz := pg_catalog.clock_timestamp();
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
  if p_terms_version is distinct from '2026-11-08-v6' then
    raise exception 'The current StudySpace Terms and Conditions must be reviewed.';
  end if;
  if length(guardian_name) < 2 or length(guardian_name) > 120 then
    raise exception 'Enter the parent or guardian’s full name.';
  end if;
  if p_relationship is null or p_relationship not in ('mother','father','legal_guardian','grandparent','other') then
    raise exception 'Choose the guardian’s relationship to the learner.';
  end if;
  if p_relationship = 'other' and (length(relationship_detail) < 2 or length(relationship_detail) > 100) then
    raise exception 'Describe the guardian’s relationship to the learner.';
  end if;
  if length(guardian_contact) < 7 or length(guardian_contact) > 30
     or guardian_contact !~ '^\\+?[0-9][0-9 ()-]{5,28}$' then
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
    verification_source,approval_status,testimonial_marketing_consent
  ) values (
    learner_id,guardian_name,p_relationship,
    case when p_relationship = 'other' then relationship_detail else '' end,
    guardian_contact,true,p_terms_version,submitted_at,null,null,
    'guardian_link','pending',coalesce(p_testimonial_marketing_consent,false)
  );

  update public.guardian_verification_invites
  set redeemed_at = submitted_at
  where id = invite_id and redeemed_at is null and revoked_at is null;
  if not found then raise exception 'This guardian invitation has already been used.'; end if;

  insert into public.audit_events(actor_id,event_type,target_type,target_id,details)
  values (null,'learner_guardian_consent_submitted_online','profile',learner_id::text,
    jsonb_build_object('verification_source','guardian_link',
      'testimonial_marketing_consent',coalesce(p_testimonial_marketing_consent,false)));
  return true;
end;
$function$;

revoke all on function public.submit_studyspace_guardian_link_consent(text,text,text,text,text,boolean,text,boolean)
  from public, anon, authenticated;
grant execute on function public.submit_studyspace_guardian_link_consent(text,text,text,text,text,boolean,text,boolean)
  to service_role;

drop function if exists public.activate_studyspace_minor_learner(uuid,text,text,text,text,boolean,text,uuid);
create function public.activate_studyspace_minor_learner(
  p_learner_id uuid,
  p_guardian_full_name text,
  p_relationship text,
  p_relationship_details text,
  p_guardian_phone text,
  p_guardian_consent boolean,
  p_terms_version text,
  p_verified_by uuid,
  p_testimonial_marketing_consent boolean
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  trial_started timestamptz := pg_catalog.clock_timestamp();
  local_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Mbabane')::date;
  learner_dob date;
begin
  if p_learner_id is null or p_verified_by is null then
    raise exception 'Learner and verifying representative are required.';
  end if;
  if p_guardian_consent is distinct from true then
    raise exception 'Guardian consent must be explicitly confirmed.';
  end if;
  if p_terms_version is distinct from '2026-11-08-v6' then
    raise exception 'The current Terms and Conditions must be accepted.';
  end if;
  if length(btrim(coalesce(p_guardian_full_name,''))) < 2 or length(btrim(p_guardian_full_name)) > 120 then
    raise exception 'Enter the guardian’s full name.';
  end if;
  if p_relationship is null or p_relationship not in ('mother','father','legal_guardian','grandparent','other') then
    raise exception 'Choose the guardian’s relationship to the learner.';
  end if;
  if p_relationship = 'other' and length(btrim(coalesce(p_relationship_details,''))) < 2 then
    raise exception 'Describe the guardian’s relationship to the learner.';
  end if;
  if length(btrim(coalesce(p_guardian_phone,''))) < 7 or length(btrim(p_guardian_phone)) > 30
     or p_guardian_phone !~ '^\\+?[0-9][0-9 ()-]{5,28}$' then
    raise exception 'Enter a valid guardian contact number.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_verified_by and role = 'admin' and account_status = 'active'
  ) then raise exception 'An active StudySpace administrator is required.'; end if;

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
    verification_source,approval_status,testimonial_marketing_consent
  ) values (
    p_learner_id,btrim(p_guardian_full_name),p_relationship,
    case when p_relationship = 'other' then btrim(coalesce(p_relationship_details,'')) else '' end,
    btrim(p_guardian_phone),true,p_terms_version,trial_started,p_verified_by,trial_started,
    'in_person','approved',coalesce(p_testimonial_marketing_consent,false)
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
      approval_status = 'approved',
      testimonial_marketing_consent = excluded.testimonial_marketing_consent;

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
      'testimonial_marketing_consent',coalesce(p_testimonial_marketing_consent,false),
      'superseded_online_submission',true));
  return true;
end;
$function$;

revoke all on function public.activate_studyspace_minor_learner(uuid,text,text,text,text,boolean,text,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.activate_studyspace_minor_learner(uuid,text,text,text,text,boolean,text,uuid,boolean)
  to service_role;
