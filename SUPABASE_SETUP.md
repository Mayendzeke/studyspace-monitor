# Studyspace Supabase setup

Use **one Supabase project for both applications**. The student planner and the Monitor dashboard share the same Postgres database, Auth users, private Storage bucket, Realtime channels and Edge Functions.

## 1. Create the project

Create one Supabase project on the Free plan. Keep the project private. Do not enable public database access.

## 2. Apply database migrations in this exact order

Apply the SQL files in the Supabase SQL Editor, or link the project and run supabase db push:

1. supabase/migrations/20261104000100_studyspace_core.sql
2. supabase/migrations/20261104000200_studyspace_security_hardening.sql
3. supabase/migrations/20261104000300_studyspace_admin_mfa_enforcement.sql
4. supabase/migrations/20261105000100_studyspace_classroom_and_ai.sql

The last migration adds learner IDs, private authentication-attempt records, planner/calendar/goals/flashcards/progress tables, shared classroom sessions, chat, whiteboard snapshots, lesson notes, homework, and AI usage records. It also enables RLS and the required Realtime tables.

## 3. Configure Edge Function secrets

Set these in **Supabase Dashboard → Project Settings → Edge Functions → Secrets** (or with the Supabase CLI):

- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- PIN_PEPPER — generate at least 32 random bytes.
- AUTH_RATE_LIMIT_PEPPER — generate a different secret of at least 32 random bytes.
- APP_ORIGIN=https://mayendzeke.github.io
- AI_PROVIDER=gemini
- GEMINI_API_KEY
- GEMINI_MODEL=gemini-3.8-flash

Do not put the service-role key, either pepper, or any AI key in a frontend environment variable, GitHub Pages bundle, source file, or chat message.

For a future OpenAI switch, set AI_PROVIDER=openai, OPENAI_API_KEY, and optionally OPENAI_MODEL=gpt-4.1-mini. Do not set both providers unless you intend to switch.

## 4. Deploy Edge Functions

Deploy these functions to the same Supabase project:

- create-enrolment-pin
- manage-enrolment-pin
- enrol-learner
- student-sign-in
- manage-learner-account
- generate-lesson-recap

The legacy redeem-enrolment-pin function is retained for migration compatibility; the new learner enrolment screen uses enrol-learner.

## 5. Create the first administrator

1. In Supabase Authentication → Users, create your own administrator user with an email address you control.
2. Copy that user's Auth UUID.
3. In the SQL Editor, run the following after replacing the UUID:

    update public.profiles
    set role = 'admin', account_status = 'active'
    where id = 'REPLACE-WITH-YOUR-AUTH-USER-UUID';

4. Sign in to the Monitor app and enrol TOTP multi-factor authentication. Admin operations require AAL2.

Students do not need email addresses. The server assigns a Student ID and PIN; on first enrolment, the server creates a Supabase Auth identity using an internal non-deliverable address. The student signs in with Student ID and password.

## 6. Configure GitHub Pages builds

In **each repository** (Mayendzeke/planner and Mayendzeke/studyspace-monitor), open:

**Settings → Secrets and variables → Actions → Variables**

Add:

- VITE_SUPABASE_URL = your project URL
- VITE_SUPABASE_ANON_KEY = your project's publishable/anon key

These are public client values. The service-role key is not a client value and must never be added here.

## 7. Important operating notes

- One Supabase project is shared by both apps.
- Keep Storage buckets private. Do not make student resources public.
- Admin functions require MFA; student enrolment and sign-in have server-side attempt throttling.
- AI lesson recaps are teacher drafts. Review every recap before publishing.
- Gemini's free tier may use submitted content to improve Google's products. Submit anonymised lesson content only; never include learner names, Student IDs, contact details, or sensitive information.
- Jitsi video/audio links are hosted by a third party and are not private database content. Do not share a class link outside the assigned class.
- The current planner still keeps general tasks, resources and some progress data locally; their full cross-device synchronisation and resource upload workflow are a later integration step.
