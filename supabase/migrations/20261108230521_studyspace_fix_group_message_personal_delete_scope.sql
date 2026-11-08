drop policy if exists studyspace_group_message_user_deletions_insert_own
  on public.studyspace_group_message_user_deletions;

create policy studyspace_group_message_user_deletions_insert_own
  on public.studyspace_group_message_user_deletions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.studyspace_group_messages m
      where m.id = message_id
        and m.group_id = public.studyspace_group_message_user_deletions.group_id
    )
  );
