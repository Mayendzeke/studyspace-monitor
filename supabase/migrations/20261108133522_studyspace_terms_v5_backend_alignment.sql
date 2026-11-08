-- Align all learner access checks with the currently published Terms v5.
-- This prevents newly accepted v5 terms from being rejected by database policies.

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
  if p_terms_version is distinct from '2026-11-08-v5' then
    raise exception 'The Terms and Conditions version is outdated. Reload the app and try again.';
  end if;
  if length(accepted_name) < 2 or length(accepted_name) > 120 then
    raise exception 'Enter the full name of the person accepting these terms.';
  end if;
  if p_acceptance_role is null or p_acceptance_role not in ('adult_learner', 'parent_guardian') then
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

create or replace function public.is_active_studyspace_learner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'learner'
      and account_status = 'active'
      and terms_accepted_at is not null
      and terms_version = '2026-11-08-v5'
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
          and trial_started_at <= now()
          and trial_expires_at is not null
          and trial_expires_at > now()
        )
      )
  );
$function$;
