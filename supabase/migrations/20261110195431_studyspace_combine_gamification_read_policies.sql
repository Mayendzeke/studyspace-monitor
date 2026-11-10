
drop policy if exists student_xp_events_learner_read on public.student_xp_events;
drop policy if exists student_xp_events_admin_read on public.student_xp_events;
create policy student_xp_events_read on public.student_xp_events
 for select to authenticated
 using (learner_id=(select auth.uid()) or (select public.is_studyspace_admin()));

drop policy if exists student_daily_activity_owner_read on public.student_daily_activity;
drop policy if exists student_daily_activity_admin_read on public.student_daily_activity;
create policy student_daily_activity_read on public.student_daily_activity
 for select to authenticated
 using (learner_id=(select auth.uid()) or (select public.is_studyspace_admin()));

drop policy if exists student_referral_codes_owner_read on public.student_referral_codes;
drop policy if exists student_referral_codes_admin_read on public.student_referral_codes;
create policy student_referral_codes_read on public.student_referral_codes
 for select to authenticated
 using (learner_id=(select auth.uid()) or (select public.is_studyspace_admin()));
;