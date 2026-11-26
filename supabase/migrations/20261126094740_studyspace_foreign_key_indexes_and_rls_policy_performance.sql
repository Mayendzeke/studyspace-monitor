-- Performance indexes and statement-cached auth predicates.
create index if not exists assessment_question_bank_created_by_idx on public.assessment_question_bank (created_by);
create index if not exists assessment_question_exposures_assessment_item_id_idx on public.assessment_question_exposures (assessment_item_id);
create index if not exists assessment_schedule_items_exercise_assignment_id_idx on public.assessment_schedule_items (exercise_assignment_id);
create index if not exists assessment_schedule_items_subject_id_idx on public.assessment_schedule_items (subject_id);
create index if not exists curriculum_reference_registry_verified_by_idx on public.curriculum_reference_registry (verified_by);
create index if not exists lab_assignments_assigned_by_idx on public.lab_assignments (assigned_by);
create index if not exists lab_practice_attempts_retake_of_idx on public.lab_practice_attempts (retake_of);
create index if not exists learner_practice_requests_exercise_assignment_id_idx on public.learner_practice_requests (exercise_assignment_id);
create index if not exists learner_practice_requests_subject_id_idx on public.learner_practice_requests (subject_id);
create index if not exists learner_study_packs_learning_resource_id_idx on public.learner_study_packs (learning_resource_id);
create index if not exists learner_study_packs_personal_resource_id_idx on public.learner_study_packs (personal_resource_id);
create index if not exists learner_study_packs_subject_id_idx on public.learner_study_packs (subject_id);
create index if not exists learning_material_review_queue_published_resource_id_idx on public.learning_material_review_queue (published_resource_id);
create index if not exists learning_material_review_queue_requested_by_idx on public.learning_material_review_queue (requested_by);
create index if not exists learning_material_review_queue_reviewed_by_idx on public.learning_material_review_queue (reviewed_by);
create index if not exists learning_material_revision_history_changed_by_idx on public.learning_material_revision_history (changed_by);
create index if not exists student_lab_work_reviewed_by_idx on public.student_lab_work (reviewed_by);

 drop policy if exists lab_assignments_learner_read on public.lab_assignments;
 create policy lab_assignments_learner_read on public.lab_assignments for select to authenticated using (learner_id = (select auth.uid()) and (select public.is_active_studyspace_learner()));
 drop policy if exists learner_practice_requests_select_own on public.learner_practice_requests;
 create policy learner_practice_requests_select_own on public.learner_practice_requests for select to authenticated using (learner_id = (select auth.uid()));
 drop policy if exists learner_study_packs_select_own on public.learner_study_packs;
 create policy learner_study_packs_select_own on public.learner_study_packs for select to authenticated using (learner_id = (select auth.uid()));
 drop policy if exists document_work_owner_manage on public.student_document_work;
 create policy document_work_owner_manage on public.student_document_work for all to authenticated using (learner_id = (select auth.uid()) and (select public.is_active_studyspace_learner())) with check (learner_id = (select auth.uid()) and (select public.is_active_studyspace_learner()));
 drop policy if exists lab_work_owner_manage on public.student_lab_work;
 create policy lab_work_owner_manage on public.student_lab_work for all to authenticated using (((learner_id = (select auth.uid())) and (select public.is_active_studyspace_learner())) or ((select public.is_studyspace_admin()) and coalesce((select auth.jwt())->>'aal','')='aal2')) with check (((learner_id = (select auth.uid())) and (select public.is_active_studyspace_learner())) or ((select public.is_studyspace_admin()) and coalesce((select auth.jwt())->>'aal','')='aal2'));
