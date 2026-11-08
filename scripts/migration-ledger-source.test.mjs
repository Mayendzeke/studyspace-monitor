import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

const files = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql"));
const required = [
  "20261108095237_studyspace_age_gate_guardian_verification.sql",
  "20261108095954_studyspace_guardian_invitation_links.sql",
  "20261108100656_studyspace_eswatini_age_calculation.sql",
  "20261108100835_studyspace_in_person_guardian_override.sql",
  "20261108133522_studyspace_terms_v5_backend_alignment.sql",
  "20261108134824_studyspace_connected_school_homework_help_and_cron.sql",
  "20261108135554_studyspace_harden_homework_uploads_and_timer.sql",
  "20261108135646_studyspace_fix_homework_photo_extension_pattern.sql",
  "20261108140011_studyspace_terms_v6_homework_ai_disclosure.sql",
  "20261108161203_studyspace_realtime_homework_notifications.sql",
  "20261108190000_studyspace_guardian_verifications_verified_by_index.sql",
];

const superseded = [
  "20261108115000_studyspace_age_gate_guardian_verification.sql",
  "20261108130000_studyspace_guardian_invitation_links.sql",
  "20261108133000_studyspace_eswatini_age_calculation.sql",
  "20261108140000_studyspace_in_person_guardian_override.sql",
  "20261108150000_studyspace_terms_v5_backend_alignment.sql",
  "20261108153000_studyspace_connected_school_homework_help_and_cron.sql",
  "20261108160000_studyspace_harden_homework_uploads_and_timer.sql",
  "20261108161000_studyspace_fix_homework_photo_extension_pattern.sql",
  "20261108162000_studyspace_terms_v6_homework_ai_disclosure.sql",
];

test("migration files use applied Supabase versions and retain every applied migration", () => {
  for (const file of required) assert.ok(files.includes(file), "Missing migration source: " + file);
  for (const file of superseded) assert.ok(!files.includes(file), "Superseded migration version remains: " + file);
  const versions = files.map((file) => file.slice(0, 14));
  assert.equal(new Set(versions).size, versions.length, "Migration version prefixes must be unique.");
});
