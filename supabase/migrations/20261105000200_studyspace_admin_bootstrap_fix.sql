-- Repair the profile privilege guard for projects where earlier migrations
-- have already been applied. The SQL Editor connects as a trusted database
-- administrator; normal client requests run through authenticator and still
-- require service_role or an active AAL2 administrator.
create or replace function public.guard_studyspace_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.account_status is distinct from old.account_status)
     and session_user not in ('postgres', 'supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_studyspace_admin() then
    raise exception 'Only an active administrator or trusted database administrator may change account role or status';
  end if;
  return new;
end;
$$;
