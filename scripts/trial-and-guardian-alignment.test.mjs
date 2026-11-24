import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const enrolment = read("supabase/functions/enrol-learner/index.ts");
const guardianConsent = read("supabase/functions/guardian-consent/index.ts");
const guardianAdmin = read("supabase/functions/manage-guardian-verification/index.ts");
const guardianUi = read("src/components/GuardianVerificationPage.tsx");
const subscriptions = read("src/components/SubscriptionsPage.tsx");
const migration = read("supabase/migrations/20261124140242_studyspace_48_hour_trial_and_terms_v9.sql");

test("new Monitor enrolments receive a 48-hour trial and terms v9", () => {
  assert.match(enrolment, /TERMS_VERSION = "2026-11-24-v9"/);
  assert.match(enrolment, /trialHours: 48/);
  assert.match(enrolment, /48-hour free trial has started/);
});

test("in-person and guardian-link consent use the same current terms version", () => {
  assert.match(guardianUi, /TERMS_VERSION = "2026-11-24-v9"/);
  assert.match(guardianAdmin, /2026-11-24-v9/);
  assert.match(guardianConsent, /2026-11-24-v9/);
});

test("Monitor subscription register labels the current trial correctly", () => {
  assert.match(subscriptions, /48-hour Free Trial/);
});

test("database migration aligns activation, consent and guardian approval", () => {
  assert.match(migration, /2026-11-24-v9/);
  assert.match(migration, /2026-11-07-v3/);
  assert.match(migration, /interval ''48 hours''/);
  assert.match(migration, /terms_version in \(''2026-11-09-v8'', ''2026-11-24-v9''\)/);
});

test("existing trial expiry timestamps are preserved and reminders follow actual expiry", () => {
  assert.match(migration, /trial_expires_at - interval ''24 hours''/);
  assert.doesNotMatch(migration, /UPDATE public\.profiles\s+SET trial_expires_at/i);
});
