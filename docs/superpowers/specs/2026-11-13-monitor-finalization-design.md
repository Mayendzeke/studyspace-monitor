# StudySpace Monitor Finalization — Design

## Intent
Close the Monitor gaps found in the requirements audit without changing the student app or disrupting working Monitor features.

## Goals
- Let an administrator open a learner record and upload a document or PDF directly into that learner's Student Library.
- Let an administrator assign an existing library resource to that learner and remove only the learner's assignment when needed.
- Keep the existing private `studyspace-resources` bucket and the `learning_resources` / `resource_assignments` data model.
- Keep the Monitor top bar visible while the workspace scrolls.
- Correct the Monitor's two-week plan label to E180 for 14 days.
- Repair the deployment workflow's stale timetable component assertion so CI checks the component that actually exists.

## Non-goals
- No changes to the Student app, its AI, enrolment, password or trial behavior.
- No changes to the subscription durations other than preserving the already agreed 28-day monthly plan.
- No public Storage bucket or new database schema.

## Constraints
- Only the active MFA-protected administrator can upload, assign or remove resources; existing RLS and private Storage policies remain authoritative.
- Use the established resource upload allowlist and 25 MB per-file limit.
- Upload path remains `<admin-user-id>/resources/<resource-id>/<safe-file-name>`.
- Student Library access remains controlled by `resource_assignments`.

## Approaches
1. Put all upload and assignment logic directly into the large LearnersPage component. This is quick but makes an already large screen harder to maintain.
2. Reuse Content Studio only. This keeps code simple but does not satisfy the explicit requirement to add material from the learner's own profile.
3. Add a focused LearnerResourcePanel used inside the learner detail modal. This reuses the existing tables, private bucket and upload conventions while keeping the learner screen maintainable.

**Selected approach:** 3, because it meets the learner-profile workflow without duplicating the assessment/resource library or changing the backend schema.

## Implementation decisions
- The panel will show resources already assigned to the selected learner, allow assignment from the current administrator's library, support direct upload-and-assign, and allow unassignment without deleting the shared resource.
- Upload and assignment errors will be reported clearly; uploaded library records will not be silently deleted if only the assignment step fails.
- The top bar will use sticky positioning with an opaque theme-aware surface and a z-index below the fixed sidebar.
- CI will validate `TeacherWeeklyTimetable.tsx`, the current component, rather than a nonexistent legacy file.
