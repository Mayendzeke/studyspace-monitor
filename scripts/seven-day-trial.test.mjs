import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");

test("all learner activation paths receive a seven-day free trial", () => {
  const migration = read("supabase/migrations/20261113134926_extend_studyspace_free_trial_to_seven_days.sql");
  for (const fn of [
    "activate_studyspace_minor_learner",
    "approve_studyspace_guardian_link_consent",
    "complete_public_studyspace_enrolment",
    "complete_studyspace_enrolment",
    "redeem_studyspace_pin",
  ]) assert.ok(migration.includes(fn), `migration must update ${fn}`);
  assert.match(migration, /interval ''7 days''/);
  assert.match(migration, /trial_expires_at = trial_started_at \+ interval '7 days'/);
});

test("trial reminder remains one day before the new seven-day trial expires", () => {
  const migration = read("supabase/migrations/20261113134926_extend_studyspace_free_trial_to_seven_days.sql");
  assert.match(migration, /mark_studyspace_trial_reminder_shown/);
  assert.match(migration, /interval ''6 days''/);
});

test("only currently active free trials are extended; paid and expired access is untouched", () => {
  const migration = read("supabase/migrations/20261113134926_extend_studyspace_free_trial_to_seven_days.sql");
  assert.match(migration, /account_status = 'active'/);
  assert.match(migration, /subscription_tier\s+is\s+null/i);
  assert.match(migration, /trial_expires_at > clock_timestamp\(\)/);
});
