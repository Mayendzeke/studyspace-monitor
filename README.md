# Studyspace Monitor

Studyspace Monitor is the administrator dashboard for the Studyspace Student Planner. It provides administrator-only access to learner management, content authoring, resource distribution, live classroom tools and academic progress.

## Main capabilities

- Supabase Auth administrator sign-in with mandatory TOTP MFA / AAL2.
- Learner management, enrolment PIN issuance and account disable/enable/reset workflows.
- Cloud Content Studio for creating, reviewing, approving and publishing assessments.
- Multiple-choice, true/false, fill-in, matching, word-puzzle and written-response question types.
- Assessment assignment to individual learners, scheduled release and due dates.
- Private teacher resource uploads and learner-specific resource assignments.
- Classroom tools for live lessons, lesson notes, homework and recap drafting.
- Written-response marking, teacher feedback and updated learner progress.

## Shared Supabase backend

The Monitor repository is the source of truth for the backend shared by both Studyspace applications:

- Supabase project: `tibcoottzstnqkfpwabk`
- Project URL: `https://tibcoottzstnqkfpwabk.supabase.co`
- SQL migrations: `supabase/migrations/`
- Edge Functions: `supabase/functions/`
- Function and project configuration: `supabase/config.toml`
- Full production setup: [SUPABASE_SETUP.md](SUPABASE_SETUP.md)

The student app and Monitor share Auth users, PostgreSQL tables, RLS policies, private Storage and Edge Functions. Keep the `studyspace-resources` bucket private. Do not put service-role/secret keys, database passwords, PIN peppers, learner passwords, PIN values or private learner records in GitHub or client-side environment variables.

## Security model

- The dashboard checks that the signed-in profile is an active administrator and requires an AAL2 TOTP session.
- Database policies enforce learner ownership and administrator-only authoring/marking operations.
- Assessment answer keys are stored separately from learner-readable questions.
- Assessment submissions are checked and graded by the `submit-exercise-attempt` Edge Function; learners cannot submit or edit their own marks directly.
- Short answers are marked by an administrator; marks and feedback are saved to the learner's attempt and progress record.
- Teacher files are stored in a private bucket. Learners can read only resources assigned to their account.
- Supabase Auth manages passwords. The frontend does not store plaintext passwords.

## Deployment

The dashboard is published through GitHub Pages at [mayendzeke.github.io/studyspace-monitor](https://mayendzeke.github.io/studyspace-monitor/).

The Supabase GitHub integration is configured for the `main` branch and repository root. It is intended to apply pending timestamped migrations and deploy declared Edge Functions to the production project. Check the Supabase integration and Edge Function secrets as described in [SUPABASE_SETUP.md](SUPABASE_SETUP.md) before relying on a newly committed backend change.

GitHub Actions validates the frontend project configuration, runs a live unauthenticated/invalid-token check against the assessment endpoint, typechecks and builds the frontend, and deploys GitHub Pages. A passing Pages deployment does not replace learner/admin end-to-end testing.

## Local development

Requires Node.js 20+ and npm.

```bash
npm install
npm run typecheck
npm run build
npm run preview
```

Frontend variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use only the public publishable key in the browser. Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for all server-side secrets, migration sequencing, Edge Function deployment and production verification.

## Production verification checklist

- Confirm the required migrations are applied to the production Supabase project.
- Confirm every declared Edge Function is deployed and has its required server-side secrets.
- Verify the administrator can sign in and complete TOTP MFA.
- Verify learner enrolment, sign-in, disable/enable and password reset flows.
- Verify administrator and learner RLS boundaries, including cross-account isolation.
- Verify scheduled assessment visibility, deadline enforcement, answer confidentiality and marking.
- Verify private resource upload, assignment and learner download permissions.
- Verify cloud sync and deletion behaviour across separate learner devices.

Do not treat a successful frontend deployment as proof that all backend operations or security controls have been exercised.
