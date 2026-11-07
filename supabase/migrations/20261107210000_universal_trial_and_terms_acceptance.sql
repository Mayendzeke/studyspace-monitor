-- StudySpace universal trial, reminder, subscription gate and terms acceptance.
alter table public.profiles
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_expires_at timestamptz,
  add column if not exists trial_reminder_shown_at timestamptz,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists terms_accepted_by_name text,
  add column if not exists terms_acceptance_role text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_terms_acceptance_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_terms_acceptance_role_check
      check (terms_acceptance_role is null or terms_acceptance_role in ('adult_learner', 'parent_guardian'));
  end if;
end $$;

-- Convert any legacy one-day trial records into a 48-hour trial measured
-- from their original registration time, never from the migration date.
update public.profiles
set trial_started_at = coalesce(trial_started_at, created_at),
    trial_expires_at = coalesce(trial_expires_at, created_at + interval '48 hours'),
    subscription_tier = null,
    subscription_expires_at = null
where role = 'learner'
  and lower(coalesce(subscription_tier, '')) = 'free trial';

create or replace function public.accept_studyspace_terms(
  p_terms_version text,
  p_accepted_by_name text,
  p_acceptance_role text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  accepted_name text := btrim(coalesce(p_accepted_by_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_terms_version <> '2026-11-07-v1' then
    raise exception 'The Terms and Conditions version is outdated. Reload the app and try again.';
  end if;
  if length(accepted_name) < 2 or length(accepted_name) > 120 then
    raise exception 'Enter the full name of the person accepting these terms.';
  end if;
  if p_acceptance_role not in ('adult_learner', 'parent_guardian') then
    raise exception 'Choose whether acceptance is by an adult learner or a parent/legal guardian.';
  end if;

  update public.profiles
  set terms_accepted_at = now(),
      terms_version = p_terms_version,
      terms_accepted_by_name = accepted_name,
      terms_acceptance_role = p_acceptance_role,
      updated_at = now()
  where id = auth.uid()
    and role = 'learner'
    and account_status = 'active';

  if not found then
    raise exception 'An active learner account is required.';
  end if;
  return true;
end;
$function$;

revoke all on function public.accept_studyspace_terms(text, text, text) from public, anon;
grant execute on function public.accept_studyspace_terms(text, text, text) to authenticated;

create or replace function public.mark_studyspace_trial_reminder_shown()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set trial_reminder_shown_at = now(),
      updated_at = now()
  where id = auth.uid()
    and role = 'learner'
    and account_status = 'active'
    and terms_accepted_at is not null
    and trial_started_at is not null
    and trial_expires_at > now()
    and now() >= trial_started_at + interval '24 hours'
    and trial_reminder_shown_at is null;

  return found;
end;
$function$;

revoke all on function public.mark_studyspace_trial_reminder_shown() from public, anon;
grant execute on function public.mark_studyspace_trial_reminder_shown() to authenticated;

create or replace function public.is_active_studyspace_learner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'learner'
      and account_status = 'active'
      and terms_accepted_at is not null
      and (
        (
          subscription_tier is not null
          and subscription_expires_at is not null
          and subscription_expires_at > now()
        )
        or
        (
          subscription_tier is null
          and trial_started_at is not null
          and trial_expires_at is not null
          and trial_expires_at > now()
        )
      )
  );
$function$;
