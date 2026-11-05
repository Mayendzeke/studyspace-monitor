-- Keep a single learner read policy for assigned private resources.
-- This removed policy was an exact duplicate of studyspace_resources_assigned_read.
DROP POLICY IF EXISTS studyspace_assigned_resource_storage_read ON storage.objects;
