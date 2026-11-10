create table if not exists public.student_access_pins (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  pin_hash text not null unique check (pin_hash ~ '^[0-9a-f]{64}$'),
  plan_tier text not null check (plan_tier in ('weekly', 'two_weeks', 'monthly')),
  duration_days integer not null check (duration_days in (7, 14, 28)),
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  constraint student_access_pins_redeemed_pair check ((redeemed_at is null) = (redeemed_by is null))
);

create index if not exists student_access_pins_learner_created_idx
  on public.student_access_pins(learner_id, created_at desc);

create unique index if not exists student_access_pins_one_unused_per_learner_idx
  on public.student_access_pins(learner_id)
  where redeemed_at is null and revoked_at is null;

alter table public.student_access_pins enable row level security;
revoke all on public.student_access_pins from public, anon, authenticated;
grant select, insert, update, delete on public.student_access_pins to service_role;

create or replace function public.redeem_studyspace_access_pin(
  p_learner_id uuid,
  p_pin_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile public.profiles%rowtype;
  v_pin record;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_expires_at timestamptz;
begin
  if p_learner_id is null or p_pin_hash is null or p_pin_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Enter a valid eight-digit access PIN.';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.id = p_learner_id
    and p.role = 'learner'
  for update;

  if not found or v_profile.account_status <> 'active' then
    raise exception using errcode = '42501', message = 'This learner account is not eligible for access renewal.';
  end if;

  if (v_profile.subscription_tier is not null and v_profile.subscription_expires_at > v_now)
     or (v_profile.subscription_tier is null and v_profile.trial_expires_at > v_now) then
    raise exception using errcode = '55000', message = 'This account still has active access. A renewal PIN can only be used after access expires.';
  end if;

  update public.student_access_pins p
  set redeemed_at = v_now,
      redeemed_by = p_learner_id
  where p.learner_id = p_learner_id
    and p.pin_hash = p_pin_hash
    and p.redeemed_at is null
    and p.revoked_at is null
    and p.expires_at > v_now
  returning p.plan_tier, p.duration_days into v_pin;

  if not found then
    raise exception using errcode = 'P0001', message = 'The access PIN is invalid, expired, revoked, or already used.';
  end if;

  v_expires_at := v_now + pg_catalog.make_interval(days => v_pin.duration_days);

  update public.profiles
  set subscription_tier = v_pin.plan_tier,
      subscription_expires_at = v_expires_at,
      updated_at = v_now
  where id = p_learner_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'planTier', v_pin.plan_tier,
    'durationDays', v_pin.duration_days,
    'expiresAt', v_expires_at
  );
end;
$function$;

revoke all on function public.redeem_studyspace_access_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_studyspace_access_pin(uuid, text) to service_role;

notify pgrst, 'reload schema';
