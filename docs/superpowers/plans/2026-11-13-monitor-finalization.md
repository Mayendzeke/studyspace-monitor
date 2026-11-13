# StudySpace Monitor Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining explicit Monitor requirements: learner-profile resource assignment, sticky navigation, current subscription pricing, and a truthful CI check.

**Architecture:** Add a focused React component that uses the existing private Storage bucket and the existing `learning_resources` and `resource_assignments` tables. Keep the other fixes limited to the Monitor page, shared styles and deployment workflow.

**Tech Stack:** React 19, TypeScript, Supabase JS v2, Vite, GitHub Actions, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-13-monitor-finalization-design.md`

## Global Constraints
- Do not change the Student app or its working enrolment, MIΛ or password flows.
- Keep the resource bucket private and use existing RLS policies.
- Allow only the existing document/image extensions and files up to 25 MB.
- Keep the two-week plan at E180/14 days; weekly E100/7 days; monthly E350/28 days.
- Keep the automatic 48-hour trial unchanged.

## Review Focus
- Failed assignment after a successful upload must not orphan a file or falsely claim it was assigned.
- Removing an assignment must not delete the shared resource from the library.
- Duplicate assignments must be idempotent.
- Unsupported file types and files over 25 MB must be rejected before upload.
- New controls must remain readable in both themes and usable inside the learner modal on small screens.

---

### Task 1: Learner-profile resource management

**Files:**
- Create: `src/components/LearnerResourcePanel.tsx`
- Modify: `src/components/LearnersPage.tsx`
- Modify: `src/styles.css`
- Test: `scripts/monitor-finalization.test.mjs`

**Interfaces:**
- Component: `LearnerResourcePanel({ learnerId, learnerName, subjects })`
- Uses `learning_resources` for administrator-owned library items, `resource_assignments` for per-learner access, and private bucket `studyspace-resources`.

- [ ] Write failing tests for profile integration, private upload/assignment behavior, file allowlist/25 MB limit, and safe unassignment.
- [ ] Run `node --test scripts/monitor-finalization.test.mjs` and confirm the missing component/integration assertions fail.
- [ ] Implement the panel with library assignment, direct upload-and-assign, assigned-resource listing, unassignment and refresh.
- [ ] Mount the panel in the learner detail modal.
- [ ] Run the targeted tests and Monitor typecheck/build.

### Task 2: Monitor layout, pricing and CI

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/LearnersPage.tsx`
- Modify: `.github/workflows/deploy.yml`
- Test: `scripts/monitor-finalization.test.mjs`

**Interfaces:**
- Sticky top bar: `.topbar` remains above content and below the fixed sidebar.
- Paid tiers: Weekly E100/7 days, 2 Weeks E180/14 days, Monthly E350/28 days.
- Timetable CI assertion targets `src/components/TeacherWeeklyTimetable.tsx`.

- [ ] Confirm the regression tests fail against the current stale price, non-sticky top bar and legacy workflow path.
- [ ] Apply the three focused fixes and add the regression test to GitHub Actions.
- [ ] Run `node --test scripts/monitor-finalization.test.mjs`, then `npm run typecheck` and `npm run build`.
- [ ] Inspect the full PR diff and the CI result before integration.
