alter table public.profiles
  add column if not exists subscription_tier text,
  add column if not exists subscription_expires_at timestamptz;

alter table public.profiles
  add constraint profiles_subscription_tier_length
  check (subscription_tier is null or char_length(subscription_tier) <= 80);

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
      and (subscription_expires_at is null or subscription_expires_at > now())
  );
$function$;
