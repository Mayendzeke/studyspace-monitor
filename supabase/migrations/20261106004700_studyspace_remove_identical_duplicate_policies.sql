-- Remove only policies proven identical in role, command, USING, and WITH CHECK.
-- Keep the newer, explicitly named active/assigned policy in each pair.
drop policy if exists exercise_assignments_learner_read on public.exercise_assignments;
drop policy if exists attempts_learner_read on public.exercise_attempts;
drop policy if exists exercise_questions_assigned_read on public.exercise_questions;
drop policy if exists exercise_sets_assigned_read on public.exercise_sets;
drop policy if exists resources_admin_manage on public.learning_resources;