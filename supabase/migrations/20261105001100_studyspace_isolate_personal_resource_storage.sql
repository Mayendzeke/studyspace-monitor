-- Remove the legacy broad administrator Storage policy.
-- Teacher-authored resources are managed only under {admin-id}/resources/.
-- Learner personal files remain governed by the owner-only {learner-id}/personal/ policy.
-- Assigned learners retain read access only through the assignment-linked policy.
drop policy if exists "studyspace_resources_admin_all" on storage.objects;
