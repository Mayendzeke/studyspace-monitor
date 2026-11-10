# Studyspace Supabase setup

Use **one Supabase project for both applications**. The student planner and the Monitor dashboard share the same Postgres database, Auth users, private Storage bucket, Realtime channels and Edge Functions.

## 1. Connect the project

The Supabase project is linked to the GitHub repository `Mayendzeke/studyspace-monitor`. Keep the Supabase project private. Do not expose database credentials or secret API keys.

## 2. Configure production deployment

In **Project Settings → Integrations → GitHub**, confirm:

- Repository: `Mayendzeke/studyspace-monitor`
- Production branch: `main`
- Working directory: `.` (the repository root, where the `supabase/` folder exists)
- Production project reference: `tibcoottzstnqkfpwabk` (declared under `[remotes.production]` in `supabase/config.toml`)
- **Deploy to production**: enabled

The GitHub integration watches commits to the production branch. When Deploy to production is enabled, Supabase applies pending migrations in `supabase/migrations/` and deploys the Edge Functions declared in `supabase/config.toml`. The migration files are applied in timestamp order. Do not manually run the same SQL files in the SQL Editor or run `supabase db push` as a second deployment route; that can desynchronise migration history.

Migration 006 is a corrective, forward-only repair for the two production columns `student_subjects.period_ids` and `exercise_assignments.available_at`. It uses `ADD COLUMN IF NOT EXISTS`, preserving existing rows and values. It also normalizes learner assessment-read policies so scheduled assessments remain hidden until release, restores authenticated table privileges for administrators to manage answer keys through Content Studio, and keeps answer-key access restricted by the AAL2 administrator-only RLS policy. It is safe to apply if the columns or policies are already present.

The age-gated enrolment migration stores each learner's date of birth and introduces the `pending_guardian_verification` account state. The public enrolment function calculates age server-side: learners aged 18 or older accept the current terms personally and receive an active account; learners under 18 remain blocked from sign-in and dashboard access until an authorised AAL2 administrator records the guardian's name, relationship, contact number and in-person consent through the Monitor's Guardian verification page. Guardian verification records are restricted to the service role and are not directly readable or writable by learner clients. The learner's 48-hour trial starts only after the adult registration or guardian approval succeeds. The legacy PIN-redemption RPC is restricted to adult accounts with a recorded date of birth so it cannot bypass guardian verification.

The university/course profile migration creates the `profiles.course` field and keeps both the legacy eight-argument and current course-aware learner profile RPC signatures. It must precede the single-learner profile RPC migration.

The universal trial migration starts the 48-hour trial only after successful PIN redemption, records acceptance of the current terms, and enforces that terms and a valid paid plan or trial are required for learner access. The payment-reference migration prevents a reused MTN MoMo transaction reference from activating a second subscription. The enrolment-capacity migration serializes successful enrolments and enforces the 100-learner ceiling at the database layer.

Migrations 007 and 008 close the last assessment/resource access gaps: answer variants, correct matching pairs and explanations are moved out of learner-readable question records into the AAL2-protected answer-key table; matching choices are shuffled for learners; and the private Storage bucket receives policies for administrator uploads and assigned learner downloads. The bucket remains private.

Migration 009 adds a protected teacher-marking workflow for written assessment answers. Learners can read their own attempts but cannot change scores or feedback; AAL2 administrators can mark written responses and update saved progress.

Migration 010 restores Word Puzzle clues to learner-visible question content after answer-key sanitisation, while keeping the answer word in the protected key.

Migration 011 removes a legacy administrator-wide Storage policy. Administrators can manage teacher resources only in their own `/resources/` path; learners can read resources assigned to them; personal `/personal/` files remain owner-only.

The current migration sequence is:
1. `supabase/migrations/20261104000100_studyspace_core.sql`
2. `supabase/migrations/20261104000200_studyspace_security_hardening.sql`
3. `supabase/migrations/20261104000300_studyspace_admin_mfa_enforcement.sql`
4. `supabase/migrations/20261105000100_studyspace_classroom_and_ai.sql`
5. `supabase/migrations/20261105000200_studyspace_admin_bootstrap_fix.sql`
6. `supabase/migrations/20261105000300_studyspace_planner_sync_and_personal_files.sql`
7. `supabase/migrations/20261105000400_studyspace_content_studio_cloud.sql`
8. `supabase/migrations/20261105000500_studyspace_sync_deletion_ledger.sql`
9. `supabase/migrations/20261105000600_studyspace_schema_repair_missing_sync_columns.sql`
10. `supabase/migrations/20261105000700_studyspace_protect_assessment_answers.sql`
11. `supabase/migrations/20261105000800_studyspace_resource_storage_access.sql`
12. `supabase/migrations/20261105000900_studyspace_manual_assessment_marking.sql`
13. `supabase/migrations/20261105001000_studyspace_word_puzzle_clue_visibility.sql`
14. `supabase/migrations/20261105001100_studyspace_isolate_personal_resource_storage.sql`
15. `supabase/migrations/20261105221739_studyspace_restrict_security_definer_function_grants.sql`
16. `supabase/migrations/20261105224535_studyspace_add_foreign_key_indexes.sql`
17. `supabase/migrations/20261105224637_studyspace_optimize_rls_and_lock_attempt_logs.sql`
18. `supabase/migrations/20261105224728_studyspace_remove_identical_duplicate_policies.sql`
19. `supabase/migrations/20261105224839_studyspace_harden_security_definer_search_paths.sql`
20. `supabase/migrations/20261105225421_studyspace_remove_duplicate_storage_read_policy.sql`
21. `supabase/migrations/20261106051401_studyspace_realtime_classroom_membership.sql`
22. `supabase/migrations/20261106062504_studyspace_link_past_paper_source_resource.sql`
23. `supabase/migrations/20261106062657_studyspace_secure_classroom_meetings.sql`
24. `supabase/migrations/20261106071138_studyspace_atomic_assessment_save.sql`
25. `supabase/migrations/20261106074344_studyspace_student_feedback.sql`
26. `supabase/migrations/20261106121531_mia_learning_companion_foundation.sql`
27. `supabase/migrations/20261106171600_remove_duplicate_timetable_index.sql`
28. `supabase/migrations/20261106192500_add_university_course_profile.sql`
29. `supabase/migrations/20261106214130_teacher_timetable_access.sql`
30. `supabase/migrations/20261106214438_consolidate_timetable_access_policy.sql`
31. `supabase/migrations/20261106214510_remove_duplicate_timetable_index.sql`
32. `supabase/migrations/20261106235339_mia_messages_learner_id_index.sql`
33. `supabase/migrations/20261107002924_studyspace_single_learner_profile_rpc.sql`
34. `supabase/migrations/20261107005219_add_student_subscription_expiry.sql`
35. `supabase/migrations/20261108070859_universal_trial_and_terms_acceptance.sql`
36. `supabase/migrations/20261108070904_studyspace_unique_payment_transaction_references.sql`
37. `supabase/migrations/20261108070909_studyspace_enrolment_capacity.sql`
38. `supabase/migrations/20261108115000_studyspace_age_gate_guardian_verification.sql`
39. `supabase/migrations/20261108130000_studyspace_guardian_invitation_links.sql`
40. `supabase/migrations/20261108133000_studyspace_eswatini_age_calculation.sql`
41. `supabase/migrations/20261108140000_studyspace_in_person_guardian_override.sql`

Migrations 007 and 008 are required before using the shared assessment and resource workflows. Migration 007 removes answer variants, correct matching pairs and explanations from learner-readable question rows after moving them into the protected answer-key table. Migration 008 permits AAL2 administrators to manage teacher files in the private bucket and permits learners to download only resources assigned to their own account.

These migrations create the shared learner/admin profiles, enrolment and authentication controls, planner data, private resource storage, exercises, classroom sessions, chat, whiteboards, lesson notes, homework, and AI usage records. Row Level Security (RLS) is enabled for application tables. The final migration allows a trusted SQL Editor session to promote the first administrator while ordinary client requests remain protected.

If Deploy to production is disabled, commits in GitHub will **not** apply these migrations or deploy the functions to the live project. Enable it before expecting the backend to activate.
## 3. Configure Edge Function secrets

Supabase automatically injects `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, and `SUPABASE_SECRET_KEYS` into hosted Edge Functions. The functions in this repository read the modern publishable/secret key maps and retain legacy fallbacks. **Do not manually create secrets whose names start with `SUPABASE_`.**

In **Supabase Dashboard → Edge Functions → Secrets**, add:

- `PIN_PEPPER` — a randomly generated secret containing at least 32 random bytes.
- `AUTH_RATE_LIMIT_PEPPER` — a different randomly generated secret containing at least 32 random bytes.
- `JAAS_APP_ID` — the JaaS App ID from the 8x8 JaaS console.
- `JAAS_API_KEY_ID` — the key ID paired with the uploaded JaaS public key.
- `JAAS_PRIVATE_KEY` — the complete private PEM file downloaded when creating that JaaS key pair. Keep it in Supabase secrets only; never commit it, paste it into chat, or put it in a browser variable.
- `APP_ORIGIN` — `https://mayendzeke.github.io`
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` — server-side Workers AI credentials for learner MIΛ and the Gemma backup used by administrator AI.
- `GEMINI_API_KEY` — a server-side API key created in Google AI Studio on a project using the Gemini API **Free Tier**. Store it only in Supabase Edge Function secrets; do not expose it in the browser.

Do not create or set `GEMINI_API_PAID_SERVICE_CONFIRMED`. Administrator MIΛ uses the Gemini Free Tier by default; no paid billing confirmation is required. Google's free-tier requests remain subject to the model/project RPM, TPM and RPD quotas shown in AI Studio.

Keep both peppers and all provider credentials private. Do not put them in GitHub, browser environment variables, frontend bundles, source code or chat.

The learner-facing `mia-assistant` endpoint uses Cloudflare Workers AI only: Gemma 4 is primary and Qwen 3.8 is the secondary recovery model. It is restricted to active learner accounts aged 9 or older with current Terms acceptance and an active trial or paid subscription, and enforces a 20-request rolling 24-hour allowance. Do not route learner data to Google Gemini or send learner identifiers to an AI provider.

The administrator-facing Monitor MIΛ assistant, Classroom Studio lesson-recap tools and interactive homework generation use the Gemini 3.8 Flash Developer API Free Tier first, with Gemma 4 on Cloudflare Workers AI as automatic backup. If Gemini reaches a request/token quota, returns an error, times out or is unavailable, the same request is automatically sent to Gemma 4. Administrator AI endpoints do not impose a separate daily request cap; each provider's own quotas and service availability still apply. They require a valid JWT, an active administrator profile and AAL2 MFA, screen common personal identifiers, and write usage audit events. All AI functions are restricted to educational purposes.

**Free-tier privacy:** Google's Gemini API Free Tier may use submitted content and generated responses to improve Google services, and human reviewers may process that content. Use it only with anonymised, non-confidential teaching material. The administrator endpoints block common learner/guardian identifiers, but teachers must also remove confidential information not covered by those checks. Do not route learner-facing MIΛ requests or learner records to Gemini.

## 4. Deploy Edge Functions

Deploy these functions to the same Supabase project:

- `create-enrolment-pin`
- `manage-enrolment-pin`
- `enrol-learner`
- `student-sign-in`
- `manage-learner-account`
- `manage-guardian-verification`
- `guardian-consent`
- `generate-lesson-recap`
- `submit-exercise-attempt`
- `jaas-token`
- `mia-assistant` — learner-facing MIΛ learning companion
- `mia-monitor-assistant` — administrator-facing MIA teaching and StudySpace assistant

The administrator Monitor MIA, lesson-recap and homework-generation functions remain gateway-JWT protected and accept only active administrators with AAL2 MFA. They use Gemini primary only after the paid-service confirmation flag is enabled, with Gemma 4 as automatic backup. The student-facing `mia-assistant` endpoint is active for eligible learners, validates the learner's age, account status, current terms and paid/trial access, and uses Cloudflare Workers AI only. Keep these administrator and learner authorization paths separate.

The legacy `redeem-enrolment-pin` function is retained for compatibility. The current enrolment flow uses `enrol-learner`.

Gateway JWT verification is enabled for protected functions, including `jaas-token`. The JaaS endpoint validates the signed-in user's active Studyspace profile, requires AAL2 MFA for the class-creating administrator, and only issues a room-scoped 15-minute JWT to the administrator who created a live session or a learner assigned to that session. The private key is loaded and used only inside the Edge Function. The JaaS endpoint includes an administrator-only signing health check; a successful signing check does not replace an actual meeting join test. Gateway JWT verification is disabled for the public enrolment, student sign-in and guardian-consent endpoints (`enrol-learner`, `student-sign-in` and `guardian-consent`). The public enrolment and sign-in functions apply server-side throttling. The guardian-consent endpoint accepts only single-use, expiring high-entropy links for parent/guardian consent, and only allows link issuance after authenticating the pending learner with their Student ID and password. It never creates a learner session or grants dashboard access.

The `manage-learner-account` function is also protected by gateway JWT verification and validates the active administrator profile plus AAL2 MFA on every request. It supports learner profile updates (name, country, school/institution, education level, grade, curriculum and academic year), account enable/disable, one-time temporary password rotation and permanent deletion. Permanent deletion requires a second confirmation phrase containing the learner's Student ID, suspends Auth access first, removes the learner's private personal-file objects, marks redeemed PINs revoked/non-reusable while detaching the learner reference, and then deletes the Auth user. Related learner-owned database records are removed through their foreign-key cascade rules. Existing browser/device offline caches cannot be erased remotely and may need to be cleared on those devices separately.

## 5. Create the first administrator

After the migrations are applied:

1. In Supabase **Authentication → Users**, create an administrator user using an email address you control.
2. Copy that user's Auth UUID.
3. In the SQL Editor, run the following after replacing the UUID:

   ```sql
   update public.profiles
   set role = 'admin', account_status = 'active'
   where id = 'REPLACE-WITH-YOUR-AUTH-USER-UUID';
   ```

4. Sign in to the Monitor app and enrol TOTP multi-factor authentication. Administrator operations require AAL2.

Students do not need email addresses. The server assigns a Student ID and one-time PIN; enrolment creates a Supabase Auth identity using an internal non-deliverable email address. Students sign in with their Student ID and password.

## 6. Configure GitHub Pages builds

In each repository (`Mayendzeke/planner` and `Mayendzeke/studyspace-monitor`), open:

**Settings → Secrets and variables → Actions → Variables**

The intended frontend configuration is:

- `VITE_SUPABASE_URL` = the project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` = the project's publishable key

These are public client values. Never add a Supabase secret key, service-role key, database password, PIN pepper, rate-limit pepper, or AI provider key to GitHub Actions Variables used by a browser build.

Before configuring the Student Planner, confirm its current Supabase client code and build workflow use `VITE_SUPABASE_PUBLISHABLE_KEY`; do not assume the variable name alone completes the integration.

## 7. Operating notes
- Public learner enrolment is enabled in the production Edge Function. Registration remains invitation/PIN-gated and enforces the minimum age of 9, current Terms v8, parent/guardian verification for under-18 learners, server-side rate limits and the 100-learner capacity limit.

- One Supabase project is shared by both apps.
- Keep the `studyspace-resources` Storage bucket private.
- Admin functions require MFA; student enrolment and sign-in have server-side attempt throttling.
- Student MIΛ uses Cloudflare Workers AI only (Gemma 4 primary with Qwen 3.8 secondary); learner AI is age-, terms-, subscription- and education-gated and is never routed to Gemini. Adult administrator MIA, lesson recap and interactive homework generation use Gemini 3.8 Flash Free Tier first with Gemma 4 automatic backup. No extra application-level daily request cap is applied to administrator AI; Google's and Cloudflare's own model/account quotas and availability still apply. Keep `GEMINI_API_KEY` in Supabase secrets only; do not set a paid-billing confirmation flag. The free Gemini API may use prompts and outputs to improve Google services, so send anonymised, non-confidential teaching material only. Administrator endpoints require AAL2 and active administrator access, screen common personal identifiers, and separate trusted system instructions from user-supplied material. All AI features are education-only; review AI output before using it in teaching or assessment.
- Live video and audio are served by 8x8 JaaS (`8x8.vc`). Meeting tokens are signed server-side and restricted to the individual Studyspace class; the client never receives the JaaS private key. Meeting room identifiers are not secrets, but do not share class details outside the assigned class.
- The planner sync migrations add updated timestamps, account-owned personal file records, private Storage policies, and a server-side deletion ledger. The student client synchronises tasks, subjects, sessions, calendar entries, study preferences, test attempts, flashcard progress and personal files while signed in; the browser database remains the offline cache. The Content Studio migration stores assessments, answer keys, review state, resources and assignment records in the shared project. Apply all migrations to the production Supabase project before enabling these newer cloud-sync and assessment workflows.


## 8. Final database hardening

The production database has six additional forward-only hardening migrations after the original application schema:

- The SECURITY DEFINER helper functions are not executable by `anon` or `PUBLIC`; only the required authenticated helper/RPC grants remain.
- Foreign-key indexes were added for the learner, assignment, classroom, resource and audit relationships.
- RLS helper checks are evaluated through statement-level scalar subqueries, internal authentication-attempt logs have no direct client table privileges, and five exact duplicate public-table policies were removed.
- SECURITY DEFINER routines use an empty search path and schema-qualified object names.
- An exact duplicate learner Storage read policy was removed. The bucket remains private, with a single assigned-resource read policy, a separate owner-only personal-file policy, and administrator resource management limited to each administrator's own resource path.

These changes preserve the existing learner/admin authorization rules. The remaining multiple-permissive-policy performance notices are separate admin and learner access paths; do not merge them without reviewing the underlying row-access semantics. Unused-index notices are retained because the project has little production query history and these indexes support foreign-key and expected application queries.

## 9. Final Auth dashboard setting

One Auth security improvement still requires a dashboard action; the connected project tools do not expose this Auth setting:

1. Open **Supabase Dashboard → Authentication → Settings → Password Security**.
2. Enable **Leaked password protection** and save.

The administrator workflow already requires TOTP MFA/AAL2. The advisor also reports that only a limited set of MFA methods is enabled. That notice is not a reason to enable weaker or unneeded methods; keep the current TOTP requirement unless you deliberately choose and test another factor.
