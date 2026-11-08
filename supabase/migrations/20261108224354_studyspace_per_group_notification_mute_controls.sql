-- Allow each signed-in member to mute notifications from individual groups.
create table if not exists public.studyspace_group_notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.studyspace_groups(id) on delete cascade,
  muted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id,group_id)
);
alter table public.studyspace_group_notification_preferences enable row level security;
revoke all on public.studyspace_group_notification_preferences from public,anon;
grant select,insert,update on public.studyspace_group_notification_preferences to authenticated;

drop policy if exists studyspace_group_notification_preferences_select_own on public.studyspace_group_notification_preferences;
create policy studyspace_group_notification_preferences_select_own
  on public.studyspace_group_notification_preferences for select to authenticated
  using (user_id=(select auth.uid()));

drop policy if exists studyspace_group_notification_preferences_insert_own on public.studyspace_group_notification_preferences;
create policy studyspace_group_notification_preferences_insert_own
  on public.studyspace_group_notification_preferences for insert to authenticated
  with check (
    user_id=(select auth.uid())
    and (public.is_studyspace_admin() or public.is_studyspace_group_member(group_id,(select auth.uid())))
  );

drop policy if exists studyspace_group_notification_preferences_update_own on public.studyspace_group_notification_preferences;
create policy studyspace_group_notification_preferences_update_own
  on public.studyspace_group_notification_preferences for update to authenticated
  using (user_id=(select auth.uid()))
  with check (
    user_id=(select auth.uid())
    and (public.is_studyspace_admin() or public.is_studyspace_group_member(group_id,(select auth.uid())))
  );
