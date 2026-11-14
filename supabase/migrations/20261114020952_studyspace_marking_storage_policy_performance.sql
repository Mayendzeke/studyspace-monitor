-- Index the new audit foreign keys and avoid repeated auth function evaluation in RLS.
create index if not exists learner_storage_quotas_updated_by_idx
  on public.learner_storage_quotas(updated_by);
create index if not exists session_homework_submissions_marked_by_idx
  on public.session_homework_submissions(marked_by);

drop policy if exists learner_storage_quotas_read_self_or_admin
  on public.learner_storage_quotas;
create policy learner_storage_quotas_read_self_or_admin
  on public.learner_storage_quotas for select to authenticated
  using (
    learner_id = (select auth.uid())
    or (select public.is_studyspace_admin())
  );

drop policy if exists session_homework_submissions_admin_mark
  on public.session_homework_submissions;
create policy session_homework_submissions_admin_mark
  on public.session_homework_submissions for update to authenticated
  using (
    (select public.is_studyspace_admin())
    and coalesce((select auth.jwt()->>'aal'),'') = 'aal2'
  )
  with check (
    (select public.is_studyspace_admin())
    and coalesce((select auth.jwt()->>'aal'),'') = 'aal2'
  );
