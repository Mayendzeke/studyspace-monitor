-- Allow MFA-verified StudySpace administrators to review learner-owned formative Lab practice.
-- Learners retain full ownership of their own records; administrators receive SELECT only.
create policy lab_practice_attempts_admin_read
on public.lab_practice_attempts
for select
to authenticated
using (
  public.is_studyspace_admin()
  and coalesce(((select auth.jwt()) ->> 'aal'), '') = 'aal2'
);
