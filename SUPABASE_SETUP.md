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
21. `supabase/migrations/20261106051354_studyspace_realtime_classroom_membership.sql`

Migrations 007 and 008 are required before using the shared assessment and resource workflows. Migration 007 removes answer variants, correct matching pairs and explanations from learner-readable question rows after moving them into the protected answer-key table. Migration 008 permits AAL2 administrators to manage teacher files in the private bucket and permits learners to download only resources assigned to their own account.

These migrations create the shared learner/admin profiles, enrolment and authentication controls, planner data, private resource storage, exercises, classroom sessions, chat, whiteboards, lesson notes, homework, and AI usage records. Row Level Security (RLS) is enabled for application tables. The final migration allows a trusted SQL Editor session to promote the first administrator while ordinary client requests remain protected.

If Deploy to production is disabled, commits in GitHub will **not** apply these migrations or deploy the functions to the live project. Enable it before expecting the backend to activate.
## 3. Configure Edge Function secrets

Supabase automatically injects `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, and `SUPABASE_SECRET_KEYS` into hosted Edge Functions. The functions in this repository read the modern publishable/secret key maps and retain legacy fallbacks. **Do not manually create secrets whose names start with `SUPABASE_`.**

In **Supabase Dashboard → Edge Functions → Secrets**, add:

- `PIN_PEPPER` — a randomly generated secret containing at least 32 random bytes.
- `AUTH_RATE_LIMIT_PEPPER` — a different randomly generated secret containing at least 32 random bytes.
- `APP_ORIGIN` — `https://mayendzeke.github.io`

Keep both peppers private. Do not put them in GitHub, browser environment variables, frontend bundles, or chat.

AI lesson recaps are optional. Leave AI unconfigured until a provider and current supported model have been selected. If enabling it later, add `AI_PROVIDER`, the matching provider API key, and the matching model name as Edge Function secrets only.

## 4. Deploy Edge Functions

Deploy these functions to the same Supabase project:

- `create-enrolment-pin`
- `manage-enrolment-pin`
- `enrol-learner`
- `student-sign-in`
- `manage-learner-account`
- `generate-lesson-recap`
- `submit-exercise-attempt`

The legacy `redeem-enrolment-pin` function is retained for compatibility. The current enrolment flow uses `enrol-learner`.

Gateway JWT verification is enabled for the protected administrator functions (`create-enrolment-pin`, `manage-enrolment-pin`, `manage-learner-account`, `generate-lesson-recap`, and the legacy `redeem-enrolment-pin`) and disabled only for the public enrolment and student sign-in endpoints (`enrol-learner` and `student-sign-in`). Protected functions also validate the user's access token; administrator operations require AAL2 MFA and an active administrator profile. The public enrolment and sign-in functions apply server-side throttling.

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

- One Supabase project is shared by both apps.
- Keep the `studyspace-resources` Storage bucket private.
- Admin functions require MFA; student enrolment and sign-in have server-side attempt throttling.
- AI lesson recaps are teacher drafts. Review every recap before publishing and submit anonymised lesson material only.
- Jitsi video/audio links are hosted by a third party and are not private database content. Do not share a class link outside the assigned class.
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
