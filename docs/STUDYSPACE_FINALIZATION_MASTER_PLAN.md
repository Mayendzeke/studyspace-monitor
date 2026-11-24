# Study Space — Production Finalisation Master Plan

Last audited: 24 November 2026  
Source of truth for backend schema and Edge Functions: this repository.

## Product outcome

Study Space must behave as a personal digital school companion. A learner should be guided through a continuous learning cycle without having to decide what to study next:

1. Understand the learner's education pathway, subjects/modules, curriculum, timetable and available study windows.
2. Collect school notes, teacher-assigned files, past papers and other authorised learning resources.
3. Turn those sources into structured, traceable study material.
4. Recommend the next learning activity and schedule it around school and personal commitments.
5. Generate practice and assessments from the learner's curriculum and available material.
6. Mark work, explain errors, identify mastery gaps and schedule the next revision.
7. Feed progress back into the learner's plan and the Monitor workspace.

## Canonical repositories and deployment destinations

- Student app: https://github.com/Mayendzeke/planner — https://mayendzeke.github.io/planner/
- Monitor app: https://github.com/Mayendzeke/studyspace-monitor — https://mayendzeke.github.io/studyspace-monitor/
- Public website: https://github.com/Mayendzeke/studyspace-website — https://mayendzeke.github.io/studyspace-website/
- Shared Supabase project: studyspace-core (`tibcoottzstnqkfpwabk`, eu-west-1)

The Monitor repository owns shared-backend migrations and Edge Function source. The Student repository must not become a second competing source of truth for backend deployments.

## Non-negotiable product rules

- Learner eligibility starts at age 9. Learners under 18 remain locked until guardian consent is verified and approved; in-person approval must not require the guardian to own a smartphone.
- Public registration does not require a pre-issued Student ID. The server generates the Student ID and synchronises the learner record to Monitor.
- Profile completion can be skipped and resumed; show setup progress. Do not make optional education details block dashboard access.
- The current intended free trial is 48 consecutive hours. The trial starts only when the account becomes active; for minors, that is after guardian approval. Existing live trial expiry timestamps must not be shortened retroactively when changing the rule for future activations.
- One-time post-trial access PINs are single-use and expire after 24 hours.
- Paid plans remain E100 / 7 days, E180 / 14 days and E350 / 28 days. MTN MoMo is manually verified; Student ID is the payment reference. No automatic payment confirmation is implied.
- Refund policy remains no-refund except where a major provider/platform error is confirmed.
- Students may log in after access expires, but learning features remain gated; subscription information and the renewal contact path remain available.
- MIΛ is for education and study support only. Student-facing UI must not expose AI-provider branding. Gemma is the student-facing primary model policy; provider fallback must be reliable and observable in Monitor.
- The assessment scheduler uses the Balanced policy: include every registered subject/module, distribute assessments across available days, balance workload, and reduce duration/difficulty where appropriate when capacity is tight. Never silently drop a subject; report an explicit capacity conflict.
- Regular subject tests default to 10 questions unless the learner changes that rule. Monthly and quarterly comprehensive assessments remain part of the programme.
- Assessment records, answer keys, schedules and results must be persisted independently of a live MIΛ chat session.

## Student application acceptance areas

- Registration, sign-in, password change, guardian waiting state, Student ID display and recovery.
- Profile setup, skip/resume, editable profile fields (age remains immutable), education pathway and subject selection.
- Overview and next-best-action guidance.
- Student timetable, personal availability, academic calendar and reminders.
- Learning Studio, MIΛ chat, learning memory and safe file hand-off.
- Study Materials & Resources: private uploads, offline access, preview, download, subject/topic organisation and teacher-assigned materials.
- Automatic study-pack generation from uploaded notes/files, including structured explanations, key terms, examples, diagrams where useful, summaries, flashcards and practice questions.
- No-upload fallback: curriculum/grade/subject topic map, what to learn next, and appropriately sourced learning materials; clearly distinguish verified sources from generated explanations.
- Study & Exams: topic practice, weekly subject tests, monthly/quarterly assessments, scheduled queue, results, feedback and revision recommendations.
- Progress, mastery, spaced revision, goals, XP, streaks, referrals and daily nudges.
- Messages, groups, presence, read state, edit/unsend rules and notifications.
- Testimonials, feedback, subscription gate, installable PWA, responsive layout and light/dark themes.

## Monitor application acceptance areas

- MFA-gated administrator access and role/permission enforcement.
- Learner register, auto-generated Student ID sync, account/profile management and access status.
- Guardian verification queue: in-person and guardian-link routes must both work end to end.
- Enrolment and post-trial PIN issue/revoke/redeem/expiry workflows.
- Subscription register and manual payment verification.
- Content Studio: resource creation, subject/curriculum alignment, private storage, assignment and learner visibility.
- Assessment creation, scheduling, release, submission, answer-key protection, marking queue, teacher override and feedback.
- Classroom Studio, live lessons, lesson notes, homework, submissions, MIΛ marking and teacher final marks.
- Teacher weekly timetable, student availability and shared teaching schedule.
- Messages, groups, announcements, testimonials and feedback inbox.
- MIΛ Studio provider health, policy enforcement, diagnostics and safe failure messages.
- Learner progress, engagement, storage quotas, audit/security diagnostics and settings.
- Responsive layout, theme controls, sticky navigation and installable PWA.

## Public website acceptance areas

- Student and Monitor destinations point to the current production URLs.
- Pricing, trial duration, age eligibility, guardian verification, payment number, payment reference, refund policy and contact details match the apps and backend.
- Privacy and Terms pages match current operational behaviour and accepted terms version.
- QR code resolves to the Student app.
- Contact form, WhatsApp links, navigation anchors, mobile navigation and accessibility checks work.
- Do not advertise features that are not actually live.

## Initial audit findings — 24 November 2026

### Confirmed from source/database inspection

- The three repositories exist and their latest main-branch GitHub Actions checks/deployments reported success at the time of audit.
- The shared Supabase project is ACTIVE_HEALTHY. The public application tables inspected have RLS enabled.
- The Student Library already supports multiple common school-file formats, private personal storage, previews and a hand-off to MIΛ. WeeklyTest can use an uploaded or teacher-assigned note when generating a topic test.
- The current Student Library flow does not yet demonstrate an automatic, persisted study-pack pipeline triggered by every new upload.
- The current WeeklyTest flow supports optional note-based topic-test generation. No assessment-schedule references were found in the inspected Student app entry points, WeeklyTest component or Monitor app entry point; a full source-tree search remains part of implementation verification.
- These database tables exist but are empty: assessment_question_bank, assessment_question_exposures, assessment_schedule_preferences, assessment_schedule_runs and assessment_schedule_items. No corresponding schedule engine function was found in the public function-name inspection. Their migration/source ownership must be reconciled before relying on them.
- The database, deployed enrol-learner Edge Function, Student app copy and public website currently implement/advertise a 7-day trial, not the latest intended 48-hour policy.
- The Monitor in-person guardian verification component currently sends terms version 2026-11-08-v6 while the database activation function requires 2026-11-09-v8.
- The guardian-link submission function stores/validates v8, while the current database approval function was found to filter submissions using the older 2026-11-07-v3 version. Both guardian routes require end-to-end repair and regression tests.
- The Student app's trial reminder threshold and the database reminder function currently reflect the old 7-day trial (six days elapsed / 24 hours remaining).
- Supabase advisors reported security warnings for leaked-password protection and available MFA methods, plus performance notices for selected foreign keys and RLS policies. Do not enable paid features or change security controls without confirming cost and the actual account policy.

### Required verification before production release

- Run each repository's full test suite and production build on the proposed commit.
- Confirm the latest GitHub Actions build, quality and Pages deployment for each app.
- Verify registration, Student ID creation, guardian approval (both routes), trial start/expiry, PIN expiry/redemption and renewal against real test accounts.
- Verify a student upload becomes a private, indexed source; generated study packs persist and reopen; the no-upload curriculum fallback works.
- Verify the scheduler creates a balanced plan for all subjects, respects school timetable and availability, avoids duplicate assessments, preserves 10-question defaults and surfaces capacity conflicts.
- Verify generated assessments persist independently of MIΛ chat, answer keys remain private, attempts/results sync and teacher marking/overrides work.
- Verify Student/Monitor realtime synchronisation, storage privacy, RLS and multi-device/offline reconciliation.
- Verify all website and legal references against the final app/backend configuration.
- Do not describe a source-level test as proof of a live workflow. Record separately what is code-tested, deployment-tested and verified with real accounts.

## Implementation order

1. Resolve source-of-truth drift and account/guardian/trial/terms correctness.
2. Build the central study-material ingestion and generation pipeline, with persisted outputs and a curriculum-based fallback.
3. Build and wire the persistent balanced assessment scheduler to timetable, availability, subjects, study material and assessment results.
4. Complete MIΛ provider reliability and its hand-off to the central learning/assessment records.
5. Verify the remaining Student, Monitor and shared workflows end to end.
6. Align the public website, terms/privacy references and production release checks.


## Assessment automation contract

- Every registered subject stays in the weekly programme; the Balanced policy distributes workload across real available study periods and reports capacity conflicts rather than silently dropping subjects.
- Weekly subject tests default to 10 questions, with a learner-controlled question-count preference.
- Every subject also receives a monthly comprehensive test and a quarterly examination, scheduled separately from weekly practice.
- Near-term tests are prepared automatically in bounded batches. Future monthly and quarterly tests are stored in the programme and generated as their dates approach.
- The Monitor repository owns the scheduler and submission Edge Functions; the Student repository owns only the learner-facing programme and preferences.
- Submitting an assessment marks its programme item complete, including when the submission is late.
