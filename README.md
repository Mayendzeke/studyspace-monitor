# Studyspace Monitor

The administrator dashboard for the Studyspace Student Academic Planner.

## Shared backend foundation

The Supabase foundation is stored in this repository:

- `supabase/migrations/20261104000100_studyspace_core.sql` — profiles, learner subjects, planner tasks, study sessions, resources, exercise sets/questions, assignments, attempts, audit events, RLS policies, one-time PIN redemption and attempt throttling.
- `supabase/functions/create-enrolment-pin/index.ts` — authenticated administrator-only PIN creation. The raw PIN is returned once; only its SHA-256 digest is stored.
- `supabase/functions/redeem-enrolment-pin/index.ts` — authenticated learner redemption.
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
3. Deploy both Edge Functions: `create-enrolment-pin` and `redeem-enrolment-pin`.
4. Set Edge Function secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and (when known) `APP_ORIGIN`. The service-role key belongs only in Supabase function secrets and must never be placed in Vite variables or committed to GitHub.
5. Create the first administrator through Supabase Auth, then promote that exact profile to admin and active using the Supabase SQL Editor. Do this only for the account you control:
   `UPDATE public.profiles SET role = 'admin', account_status = 'active' WHERE id = '<your-auth-user-uuid>';`
6. Configure the frontend with the Supabase project URL and public anon/publishable key. Never use the service-role key in either frontend.
7. Test learner isolation, administrator permissions, PIN expiry/revocation/single-use, failed-attempt throttling, private file access and exercise answer confidentiality before using real learner records.

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
