alter table public.profiles
  add column if not exists profile_setup_dismissed_at timestamptz;

create or replace function public.dismiss_studyspace_learner_profile_setup()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_dismissed timestamptz;
begin
  if v_user is null or not public.is_active_studyspace_learner() then
    raise exception 'An active learner account is required';
  end if;

  update public.profiles
  set profile_setup_dismissed_at = coalesce(profile_setup_dismissed_at, pg_catalog.clock_timestamp()),
      updated_at = pg_catalog.clock_timestamp()
  where id = v_user
    and role = 'learner'
    and account_status = 'active'
  returning profile_setup_dismissed_at into v_dismissed;

  if v_dismissed is null then
    raise exception 'The learner profile setup preference could not be saved';
  end if;

  return v_dismissed;
end;
$function$;

revoke all on function public.dismiss_studyspace_learner_profile_setup() from public, anon;
grant execute on function public.dismiss_studyspace_learner_profile_setup() to authenticated;

notify pgrst, 'reload schema';
