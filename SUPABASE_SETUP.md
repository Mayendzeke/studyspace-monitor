# Studyspace Supabase setup

Use **one Supabase project for both applications**. The student planner and the Monitor dashboard share the same Postgres database, Auth users, private Storage bucket, Realtime channels and Edge Functions.

## 1. Connect the project

The Supabase project is linked to the GitHub repository `Mayendzeke/studyspace-monitor`. Keep the Supabase project private. Do not expose database credentials or secret API keys.

## 2. Apply database migrations in this exact order

The migrations are versioned SQL files. Apply them once, in order:

1. `supabase/migrations/20261104000100_studyspace_core.sql`
2. `supabase/migrations/20261104000200_studyspace_security_hardening.sql`
3. `supabase/migrations/20261104000300_studyspace_admin_mfa_enforcement.sql`
4. `supabase/migrations/20261105000100_studyspace_classroom_and_ai.sql`
5. `supabase/migrations/20261105000200_studyspace_admin_bootstrap_fix.sql`

For the initial setup, use the Supabase Dashboard **SQL Editor** and run one migration at a time, checking for a successful result before continuing. Do not also run `supabase db push` after manually applying these files unless the migration history has been reconciled; otherwise the CLI may try to apply them again.

The migrations create the shared learner/admin profiles, enrolment and authentication controls, planner data, private resource storage, exercises, classroom sessions, chat, whiteboards, lesson notes, homework, and AI usage records. Row Level Security (RLS) is enabled for application tables. The final migration ensures the trusted SQL Editor can promote the first administrator while ordinary client requests remain protected.

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

The legacy `redeem-enrolment-pin` function is retained for compatibility. The current enrolment flow uses `enrol-learner`.

The Edge Function gateway JWT check is disabled in `supabase/config.toml` so the modern publishable key can be used correctly. Each protected function validates the user's access token itself; administrator functions additionally require AAL2 MFA and an active administrator profile. The public enrolment and sign-in functions apply server-side throttling.

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
- General planner tasks, resources, and some progress data may still be stored locally until the Student Planner's sync and resource-upload paths are fully integrated.
