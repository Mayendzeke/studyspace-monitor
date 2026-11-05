-- Private Storage access for administrator-authored and learner-assigned resources.
-- The bucket remains private. Database assignment records authorize learner reads.

drop policy if exists "studyspace_admin_resource_storage_manage" on storage.objects;
create policy "studyspace_admin_resource_storage_manage"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'studyspace-resources'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'resources'
    and public.is_studyspace_admin()
  )
  with check (
    bucket_id = 'studyspace-resources'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'resources'
    and public.is_studyspace_admin()
  );

drop policy if exists "studyspace_assigned_resource_storage_read" on storage.objects;
create policy "studyspace_assigned_resource_storage_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'studyspace-resources'
    and public.is_active_studyspace_learner()
    and exists (
      select 1
      from public.learning_resources lr
      join public.resource_assignments ra on ra.resource_id = lr.id
      where lr.storage_path = storage.objects.name
        and ra.learner_id = auth.uid()
    )
  );

-- Learner-owned personal objects are governed by the separate personal-path
-- policy introduced in migration 003; this policy does not grant them access
-- to administrator resource paths.
