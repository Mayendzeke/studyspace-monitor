drop policy if exists studyspace_groups_admin_manage on public.studyspace_groups;
create policy studyspace_groups_admin_insert on public.studyspace_groups
for insert to authenticated with check (public.is_studyspace_admin());
create policy studyspace_groups_admin_update on public.studyspace_groups
for update to authenticated using (public.is_studyspace_admin()) with check (public.is_studyspace_admin());
create policy studyspace_groups_admin_delete on public.studyspace_groups
for delete to authenticated using (public.is_studyspace_admin());

drop policy if exists studyspace_group_members_admin_manage on public.studyspace_group_members;
create policy studyspace_group_members_admin_insert on public.studyspace_group_members
for insert to authenticated with check (public.is_studyspace_admin());
create policy studyspace_group_members_admin_update on public.studyspace_group_members
for update to authenticated using (public.is_studyspace_admin()) with check (public.is_studyspace_admin());
create policy studyspace_group_members_admin_delete on public.studyspace_group_members
for delete to authenticated using (public.is_studyspace_admin());

create index if not exists studyspace_group_invites_inviter_idx
 on public.studyspace_group_invites(inviter_id,created_at desc);
create index if not exists studyspace_group_messages_sender_idx
 on public.studyspace_group_messages(sender_id,created_at desc);
create index if not exists studyspace_groups_creator_idx
 on public.studyspace_groups(created_by,created_at desc);
