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

## Initial audit findings — 24 November 2026 (superseded baseline)

The findings in this section describe the pre-implementation state. Use the 25 November production verification update below for the current status.

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


## Implementation update — 24 November 2026

The initial audit above records the pre-implementation baseline. The following changes have since been made in the current working branches; they are source changes, not yet proof of production behaviour.

### Working-branch implementation

- **Monitor backend branch:** `fix/align-48-hour-trial-20261124`
  - Added the central assessment scheduler and balanced schedule builder.
  - Added stored study-pack generation for readable learner uploads and teacher-assigned resources.
  - Added a curriculum research engine that uses non-identifying academic profile context and web-grounded research where available.
  - Curriculum guides are saved as pending review items. They are not published automatically.
  - Added the Monitor AI Material Review page. Approval publishes a private Markdown resource and assigns it to the learner; rejection prevents publication.
  - Added queued, stored on-demand practice requests and assignment-source classification.
  - Assessment question generation now calls the shared assessment provider directly; it does not call the live MIΛ chat endpoint.
  - Increased MIΛ response limits to remove the 1,200-character truncation that could cut off explanations.
  - Added migrations `20261124140243_study_material_generation_packs.sql` and `20261124140244_practice_assessment_requests.sql`.

- **Student app branch:** `feat/central-assessment-engine`
  - Added the Student Library study-pack status and automatic preparation hand-off.
  - Replaced the legacy MIΛ-dependent practice-test generator with a stored practice-request workflow.
  - Separated practice assignments from teacher assignments and kept scheduled assessments visible in the non-practice assignment view.
  - The Student app requests practice preparation through the central assessment scheduler and refreshes when the stored assignment becomes ready.

- **Public website main branch**
  - Updated the trial from seven days to 48 hours.
  - Updated the feature descriptions for automatic study guides and the weekly/monthly/quarterly assessment programme.
  - Updated Terms and Privacy effective dates and the data-certificate notice.
  - Website CI completed successfully for the latest website update observed during this audit.

### Required release gates — still open

1. Resolve the current merge conflicts in the Monitor and Student pull requests.
2. Run the latest Monitor and Student regression suites, Deno type checks and production builds against the exact final branch heads.
3. Confirm the pending migrations are present in the correct order and apply them to the shared Supabase project.
4. Deploy the updated Edge Functions from the Monitor repository only.
5. Confirm the public Student and Monitor Pages deployments use the matching frontend/backend versions.
6. Test with real test accounts: new learner registration, under-18 guardian approval, 48-hour trial start/expiry, post-trial PIN, resource approval, study-pack creation, scheduled assessments, practice tests, answer submission and results.
7. Verify RLS and private storage from both learner and Monitor roles.
8. Record separate outcomes for source tests, deployed endpoint checks and real-account end-to-end tests.

**Release rule:** Do not mark the platform production-ready solely because a branch builds or a migration file exists. The matching migrations, Edge Functions, Student UI and Monitor UI must be deployed together, and the workflows above must be verified.

## Assessment automation contract

- Every registered subject stays in the weekly programme; the Balanced policy distributes workload across real available study periods and reports capacity conflicts rather than silently dropping subjects.
- Weekly subject tests default to 10 questions, with a learner-controlled question-count preference.
- Every subject also receives a monthly comprehensive test and a quarterly examination, scheduled separately from weekly practice.
- Near-term tests are prepared automatically in bounded batches. Future monthly and quarterly tests are stored in the programme and generated as their dates approach.
- The Monitor repository owns the scheduler and submission Edge Functions; the Student repository owns only the learner-facing programme and preferences.
- Submitting an assessment marks its programme item complete, including when the submission is late.


## Production verification update — 25 November 2026

This update supersedes the pre-implementation findings recorded in the 24 November initial audit above. It records the state observed on the current `main` branches and the live shared Supabase project on 25 November 2026. Passing CI is evidence of the checks listed below; it is not a substitute for real learner/guardian account testing.

### Verified release and deployment state

- **Student app:** `Mayendzeke/planner` main. GitHub Pages deployment run [45627663878](https://github.com/Mayendzeke/planner/actions/runs/45627663878) completed successfully, including the build and deploy jobs. The separate Student quality-gate run [45627663825](https://github.com/Mayendzeke/planner/actions/runs/45627663825) completed successfully.
- **Monitor app:** `Mayendzeke/studyspace-monitor` main. Deployment run [45627092538](https://github.com/Mayendzeke/studyspace-monitor/actions/runs/45627092538) completed successfully. Its build job ran the full Node regression suite, Deno type checks for the assessment scheduler, study-material engine and assessment submission function, the production dependency audit, Supabase project/key validation, unauthenticated endpoint checks, and the production build before Pages deployment.
- **Public website:** `Mayendzeke/studyspace-website` main. Website quality run [45420756193](https://github.com/Mayendzeke/studyspace-website/actions/runs/45420756193) and Pages deployment run [45420755276](https://github.com/Mayendzeke/studyspace-website/actions/runs/45420755276) both completed successfully on 24 November 2026. This is the latest website release evidence found in this audit.
- Student production build explicitly enables public self-enrolment and disables invitation-only enrolment. The student registration UI and enrolment function are wired for server-generated Student IDs; no pre-issued Student ID is required for the public path.
- The student MIΛ route is a full-screen learning workspace with grouped study entry points. Its regression suite checks the full-screen layout, responsive safe-area handling, Friends navigation and notifications.

### Verified shared-backend state

- Supabase project `studyspace-core` (`tibcoottzstnqkfpwabk`, `eu-west-1`) reported `ACTIVE_HEALTHY` during the audit.
- The live migration ledger includes the 48-hour trial/Terms v9 alignment, central assessment scheduling, study-pack persistence, stored practice requests and student friendships/notifications migrations. The Monitor repository remains the single source of truth for shared migrations and Edge Function source.
- The latest active versions observed include `enrol-learner` v37, `mia-assistant` v66, `mia-monitor-assistant` v55, `study-material-engine` v1 and `assessment-scheduler` v7.
- New learner activation uses a 48-hour trial. The migration changes future activation logic while preserving existing learners' stored expiry timestamps. Guardian approval and in-person consent components use Terms version `2026-11-24-v9`; the reminder is based on the actual expiry time.
- The 25 November database migrations include the 48-hour/Terms alignment, study-pack storage, practice-assessment requests, Eswatini literature and Siswati references, and student friends/notifications.
- Student and public-site subscription information was checked for the current standard plans: E100 / 7 days, E180 / 14 days and E350 / 28 days. The student app and website show the Study Space WhatsApp contact `+268 7994 0955` and MTN MoMo payment number `+268 7824 0679`; manual verification and Student ID payment reference are stated. Website Terms and Privacy pages were updated 24 November 2026.

### Feature wiring confirmed in source and CI

- Learner MIΛ uses Gemma as its primary Cloudflare Workers AI model with Qwen as its secondary model; learner-facing responses do not disclose provider/model names.
- Monitor MIΛ uses Gemini as its primary model and Gemma as its backup. It requires an active administrator account and verified MFA, and its provider health-check is available in MIΛ Studio.
- Student uploaded/assigned resources can be converted into persisted learner study packs. The Monitor no-material path checks existing resources and curriculum references, requires cross-referenced source evidence and saves generated material to an administrator approval queue rather than publishing it automatically.
- The assessment scheduler uses the Balanced policy, stores assessments separately from MIΛ chat, retains the 10-question default, creates weekly/monthly/quarterly programme records and reports capacity conflicts. Practice requests are stored separately from teacher assignments.
- Student friendship discovery, requests, accepted friends, direct-message hand-off and notifications are covered by a dedicated Student regression test.
- The Monitor material review queue, subscriptions, teacher timetable/classroom, MFA-gated administration and learner resource workflows are present in the current source and included in Monitor tests.

### Runtime evidence observed in the last 24 hours

Supabase function-edge logs showed:

- `assessment-scheduler`: 10 HTTP 200 responses (mean observed execution about 0.95 seconds).
- Student `mia-assistant`: 6 HTTP 200 responses, 2 HTTP 400 responses and 12 HTTP 401 responses. HTTP 200 confirms endpoint-level successful responses; it does not independently verify answer quality or model selection for each request.
- `mia-monitor-assistant`: 8 HTTP 401 responses and no successful authenticated request in the observed window. The Monitor Gemini/Gemma health-check therefore remains unverified by this audit.
- `enrol-learner`: 12 HTTP 400 validation-path responses. The deployment smoke test deliberately sends an invalid date of birth; these are not evidence of 12 completed student registrations.
- No request to `study-material-engine` appeared in the filtered 24-hour log window. The engine is deployed and wired in source, but an actual upload-to-saved-study-pack run was not demonstrated by these logs.

### Security and performance review

- Six sensitive tables with RLS enabled and no policies (`guardian_verification_invites`, `guardian_verifications`, `learner_storage_reservations`, `pin_redemption_attempts`, `student_access_pins`, `student_auth_attempts`) had no table grants to `anon` or `authenticated`. They were accessible only to the database owner/service role. Do not add broad client policies to clear an informational advisor finding.
- The Supabase advisor also reported 39 callable `SECURITY DEFINER` RPCs. A targeted sample of account/guardian, XP, storage quota, friend-discovery and PIN-redemption functions was inspected: the sampled functions use caller identity, active learner/admin or MFA checks and/or row scoping, and the definitions set a controlled search path. This is a sampled review, not a complete audit of all 39 functions; review each RPC before changing grants.
- The advisor reported `pg_net` installed in the `public` schema and performance findings for multiple permissive RLS policies and unused indexes. These are follow-up items. No extension move, policy rewrite or index deletion was made without dependency and workload analysis.

### Release gates still requiring live operator access

1. Run a real public enrolment with a disposable adult test account and verify its generated Student ID, login and 48-hour activation. Repeat with an under-18 test account and verify that neither access nor the trial starts until guardian approval. Test both in-person and guardian-link approval routes.
2. Issue and redeem a post-trial PIN using a disposable test account; verify the 24-hour expiry, single-use behaviour, attempt throttling and that paid-access renewal follows manual payment verification. Do not use a live payment for testing.
3. Upload a representative text-based PDF/DOCX or teacher-assigned source as a test learner; verify extraction, persisted study-pack creation, reopen/refresh behaviour and subsequent stored assessment generation. Also verify the no-upload curriculum/topic fallback for a registered Eswatini subject.
4. Sign in to Monitor with the authorised administrator account and complete MFA. Run the MIΛ provider health check, verify Gemini primary and Gemma fallback configuration without exposing secrets, then test one anonymised teaching prompt and one material-review request through approval and learner assignment.
5. Test the Balanced scheduler against a test learner with multiple subjects, busy school timetable periods and constrained availability. Verify no subject is silently dropped, capacity conflicts are explicit, question counts are correct, answer keys stay private and completed/late attempts update the programme and results.
6. Test end-to-end cross-device data sync, friend requests/direct messages, read states, notifications, offline resource access, dark/light themes and mobile PWA installation with actual learner and Monitor sessions.
7. Obtain a qualified Eswatini legal/privacy review of the Terms, Privacy Notice, guardian-consent process, retention and cross-border AI processing. The data-related certificate is not, by itself, a substitute for a complete legal assessment.

**Release assessment:** source implementation, automated CI, production builds/deployments and core unauthenticated endpoint checks are green. The platform is deployed and the principal feature paths are wired. Do not mark every workflow as end-to-end verified or claim full production sign-off until the live operator checks above are completed and recorded.
