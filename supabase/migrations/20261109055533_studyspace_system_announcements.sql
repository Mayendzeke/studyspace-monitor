-- Admin-published system announcements with learner-only active visibility.
create table if not exists public.studyspace_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null check (char_length(btrim(body)) between 3 and 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studyspace_announcements_expiry_check
    check (expires_at is null or expires_at > published_at)
);

create index if not exists studyspace_announcements_active_idx
  on public.studyspace_announcements (published_at desc)
  where is_published;

alter table public.studyspace_announcements enable row level security;
revoke all privileges on public.studyspace_announcements from public, anon, authenticated;
grant select, insert, update, delete on public.studyspace_announcements to authenticated;

drop policy if exists studyspace_announcements_read_active on public.studyspace_announcements;
create policy studyspace_announcements_read_active
  on public.studyspace_announcements for select to authenticated
  using (
    public.is_studyspace_admin()
    or (
      is_published
      and published_at <= now()
      and (expires_at is null or expires_at > now())
      and public.is_active_studyspace_learner()
    )
  );

drop policy if exists studyspace_announcements_admin_insert on public.studyspace_announcements;
create policy studyspace_announcements_admin_insert
  on public.studyspace_announcements for insert to authenticated
  with check (public.is_studyspace_admin() and created_by = (select auth.uid()));

drop policy if exists studyspace_announcements_admin_update on public.studyspace_announcements;
create policy studyspace_announcements_admin_update
  on public.studyspace_announcements for update to authenticated
  using (public.is_studyspace_admin())
  with check (public.is_studyspace_admin());

drop policy if exists studyspace_announcements_admin_delete on public.studyspace_announcements;
create policy studyspace_announcements_admin_delete
  on public.studyspace_announcements for delete to authenticated
  using (public.is_studyspace_admin());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'studyspace_announcements'
  ) then
    alter publication supabase_realtime add table public.studyspace_announcements;
  end if;
end $$;
