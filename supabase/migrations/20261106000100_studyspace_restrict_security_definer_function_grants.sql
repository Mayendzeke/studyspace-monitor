-- Restrict SECURITY DEFINER routines to the roles that actually need them.
-- Trigger/event-trigger functions are internal and must not be callable over the Data API.
-- Policy helpers and the two learner RPCs remain callable by authenticated users only.

revoke execute on function public.guard_studyspace_profile_privileges() from public, anon, authenticated;
revoke execute on function public.handle_new_studyspace_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

revoke execute on function public.is_active_studyspace_learner() from public, anon, authenticated;
revoke execute on function public.is_studyspace_admin() from public, anon, authenticated;
revoke execute on function public.redeem_studyspace_pin(text) from public, anon, authenticated;
revoke execute on function public.update_studyspace_learner_profile(text, text, text, text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.is_active_studyspace_learner() to authenticated;
grant execute on function public.is_studyspace_admin() to authenticated;
grant execute on function public.redeem_studyspace_pin(text) to authenticated;
grant execute on function public.update_studyspace_learner_profile(text, text, text, text, text, text, text, text) to authenticated;
