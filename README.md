# Studyspace Monitor

The administrator dashboard for the Studyspace Student Academic Planner.

## Purpose

Studyspace Monitor is the administrative control centre for learner enrolment and academic oversight. It will manage administrator access, one-time enrolment PINs, learner accounts, and learner progress.

## Technology

- React + TypeScript + Vite
- Supabase Auth and PostgreSQL for authentication and shared data
- Row Level Security (RLS) for server-enforced access control
- GitHub Pages for the static dashboard frontend

## Security principles

- Never commit passwords, learner records, PINs, Supabase service-role keys, or other secrets.
- Use Supabase Auth for passwords; never store plaintext passwords.
- Validate and redeem enrolment PINs on the server, not in browser code.
- Store only a cryptographic hash of each PIN.
- Enforce learner data access with PostgreSQL Row Level Security.
- Admin-only operations must be checked server-side.
- The frontend may contain only the Supabase project URL and public anon/publishable key.

## Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and provide the public Supabase project URL and anon key when the backend is configured.

## Project status

Initial frontend foundation. Authentication, database schema, PIN issuance/redemption, audit logging, and planner integration are planned next. The dashboard must not be used with real learner information until those backend controls are implemented and tested.
