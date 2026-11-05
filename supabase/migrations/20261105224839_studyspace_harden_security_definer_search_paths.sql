-- Harden SECURITY DEFINER routines against object shadowing.
-- Their application objects and auth helpers are schema-qualified; pg_catalog
-- remains implicitly available when search_path is empty.
alter function public.guard_studyspace_profile_privileges() set search_path = '';
alter function public.handle_new_studyspace_user() set search_path = '';
alter function public.is_active_studyspace_learner() set search_path = '';
alter function public.is_studyspace_admin() set search_path = '';
alter function public.redeem_studyspace_pin(text) set search_path = '';
alter function public.update_studyspace_learner_profile(text, text, text, text, text, text, text, text) set search_path = '';