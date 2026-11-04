# Studyspace Monitor

The administrator dashboard for the Studyspace Student Academic Planner.

## Shared backend foundation

The Supabase foundation is stored in this repository:

- `supabase/migrations/20261104000100_studyspace_core.sql` — profiles, learner subjects, planner tasks, study sessions, resources, exercise sets/questions, assignments, attempts, audit events, RLS policies, one-time PIN redemption and attempt throttling.
- `supabase/functions/create-enrolment-pin/index.ts` — authenticated administrator-only PIN creation. The raw PIN is returned once; only its HMAC-SHA-256 digest is stored. A server-only pepper protects low-entropy numeric PINs against offline guessing if the database is exposed.
- `supabase/functions/redeem-enrolment-pin/index.ts` — authenticated learner redemption.
- `supabase/functions/manage-learner-account/index.ts` — administrator-only learner account disable/enable and one-time password recovery link generation.
- `supabase/config.toml` — Supabase CLI project/function configuration.

The migration separates correct answers from learner-visible question content. Learners cannot query answer keys. Learner profiles cannot directly change their own role or account status. PIN redemption is single-use, expiry-checked, revocation-aware and throttled after five attempts in a rolling 15-minute window.

## Technology

- React + TypeScript + Vite
- Supabase Auth and PostgreSQL
- PostgreSQL Row Level Security (RLS)
- Supabase Edge Functions for privileged PIN operations
- GitHub Pages for the static dashboard frontend

## Supabase setup

1. Create a Supabase project.
2. Install the Supabase CLI on a trusted development machine, link the project, and apply the migration in `supabase/migrations`. Alternatively, paste the migration SQL into the Supabase SQL Editor.
3. Deploy all three Edge Functions: `create-enrolment-pin`, `redeem-enrolment-pin` and `manage-learner-account`.
4. Set Edge Function secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, a long random `PIN_PEPPER` (at least 32 random bytes), and (when known) `APP_ORIGIN`. The service-role key belongs only in Supabase function secrets and must never be placed in Vite variables or committed to GitHub.
5. Create the first administrator through Supabase Auth, then promote that exact profile to admin and active using the Supabase SQL Editor. Do this only for the account you control:
   `UPDATE public.profiles SET role = 'admin', account_status = 'active' WHERE id = '<your-auth-user-uuid>';`
6. Configure the frontend with the Supabase project URL and public anon/publishable key. Never use the service-role key in either frontend.
7. In GitHub, open the repository **Settings → Secrets and variables → Actions → Variables** and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public anon/publishable key only). The deployment workflow injects these at build time. Never add `SUPABASE_SERVICE_ROLE_KEY` here.
8. Test learner isolation, administrator permissions, PIN expiry/revocation/single-use, failed-attempt throttling, private file access and exercise answer confidentiality before using real learner records.

## Frontend configuration

Copy `.env.example` to `.env.local` and set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or the supported public publishable key)

The dashboard is not yet connected to a configured Supabase project. The migration and Edge Functions are prepared in source control; they are not deployed until a project is supplied and configured.

## Development

```bash
npm install
npm run dev
npm run build
```

## Security principles

- Never commit passwords, learner records, PINs, service-role keys, or secrets.
- Use Supabase Auth for passwords; never store plaintext passwords.
- Validate and redeem enrolment PINs on the server, not in browser code.
- Store only a cryptographic hash of each PIN.
- Enforce learner data access with PostgreSQL RLS.
- Keep uploaded learning resources in a private Storage bucket.
- Keep answer keys inaccessible to learner clients.
- Do not describe the platform as production-ready until backend deployment, storage policies, authentication flows, RLS and multi-user tests are complete.

## Content Studio status

The Monitor now includes a local-first authoring workflow:

- Dedicated editors for multiple-choice, fill-in-the-blank (with accepted variants), true/false, structured matching pairs, and clue-based word puzzles.
- Assessment metadata for subject, level, grade, curriculum, instructions, duration, due date, question topics, difficulty and marks.
- Validation before review/approval, student preview, draft/review/approved states, and local assignment planning.
- Resource library metadata for subject, topic, resource type and description, plus search, filters, sorting, metadata editing, download and delete.
- Browser-local drafts use localStorage; uploaded files use IndexedDB. They are not shared or backed up and must not be treated as durable production storage.

Actual publishing, student targeting, assignment delivery, and attempt grading remain disabled until the Supabase project is configured and the shared data workflow is connected.

## Administrator authentication and password lifecycle

The public GitHub Pages frontend now fails closed:

- If Supabase URL/public key are missing, the dashboard displays a locked setup screen instead of the admin interface.
- When configured, sign-in uses Supabase Auth email/password.
- The frontend checks the signed-in profile and permits access only when `role = admin` and `account_status = active`.
- Password recovery uses Supabase Auth recovery links. Passwords are never stored in this frontend.
- Password changes are submitted to Supabase Auth; the administrator dashboard never handles or stores plaintext credentials.
- The Monitor requires TOTP authenticator MFA for active administrator sessions. The first administrator sign-in is routed through MFA enrolment; subsequent sessions require a fresh authenticator challenge when Supabase reports AAL1. Configure strong password policy, leaked-password protection, email confirmation, rate limits and session settings in the Supabase project.

Privileged learner account operations are implemented in `supabase/functions/manage-learner-account/index.ts`:

- `disable`: bans the Supabase Auth account (blocking sign-in and revoking existing sessions), then marks the learner profile disabled.
- `enable`: removes the Auth ban and reactivates a disabled learner profile.
- `send_password_recovery`: asks Supabase Auth to generate a one-time recovery link. The administrator must deliver it privately; the learner chooses their own new password through Supabase Auth. The administrator never sees the password.

The function checks the caller's Supabase JWT, AAL2 MFA and active admin role, validates the target learner, records an audit event, disables caching, and requires an exact `APP_ORIGIN` match. The PIN creation function also requires AAL2. The PIN Edge Functions now also require the configured origin. Do not use wildcard CORS for privileged functions.

Deploy the new function as well as the PIN functions. Configure Edge Function secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (Edge Functions only)
- `PIN_PEPPER` (at least 32 random bytes)
- `APP_ORIGIN=https://mayendzeke.github.io` (the origin only; no repository path)

Apply migrations in order:
1. `20261104000100_studyspace_core.sql`
2. `20261104000200_studyspace_security_hardening.sql`
3. `20261104000300_studyspace_admin_mfa_enforcement.sql`

The security hardening migration removes direct learner write access to assessment scores and direct browser writes to audit events. The third migration requires an AAL2 (MFA-verified) session for all database administrator privileges. It adds private Storage object policies and checks learner account status in RLS, so disabled learners lose data access even while an already-issued JWT has not yet expired.

### Before live use

- Configure Supabase Auth email delivery with a verified SMTP provider; default test email delivery is not suitable for production.
- Configure Supabase Auth MFA/TOTP support and test the Monitor's mandatory AAL2 administrator gate.
- Configure password policy (minimum 12 characters), leaked-password protection, email verification and Auth rate limits.
- Restrict the first admin account to an email address you control; promote it through the Supabase SQL Editor only after verifying its Auth user ID.
- Deploy all Edge Functions and set secrets; never place the service-role key in GitHub Pages variables or client code.
- Test disabled-account session revocation, recovery-link expiry and single use, RLS isolation, private file access and answer-key confidentiality.
- The account management Edge Function is prepared but not yet wired into a live learner management screen.
- The dashboard cannot be considered production-ready until a real Supabase project is connected and end-to-end security tests pass.
