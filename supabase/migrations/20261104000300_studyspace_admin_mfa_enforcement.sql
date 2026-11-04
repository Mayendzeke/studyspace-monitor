-- Administrator database permissions require a verified AAL2 session.
create or replace function public.is_studyspace_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and account_status = 'active'
    );
$$;
