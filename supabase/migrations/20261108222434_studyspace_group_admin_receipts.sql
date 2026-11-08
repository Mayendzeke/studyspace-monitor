drop policy if exists studyspace_group_receipts_write on public.studyspace_group_message_receipts;
create policy studyspace_group_receipts_write on public.studyspace_group_message_receipts
for insert to authenticated
with check (
  learner_id=(select auth.uid())
  and exists (
    select 1 from public.studyspace_group_messages gm
    where gm.id=message_id
      and gm.sender_id<>(select auth.uid())
      and (
        public.is_studyspace_admin()
        or public.is_studyspace_group_member(gm.group_id,(select auth.uid()))
      )
  )
);
