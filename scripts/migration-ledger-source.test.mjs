import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

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
  "20261106051401_studyspace_realtime_classroom_membership.sql",
  "20261108161203_studyspace_realtime_homework_notifications.sql",
  "20261108182736_student_feedback_realtime_inbox.sql",
  "20261108190000_studyspace_guardian_verifications_verified_by_index.sql",
  "20261109012204_studyspace_age9_mia_education_terms_v7.sql",
  "20261109014303_studyspace_terms_v8_gemini_admin_provider_disclosure.sql",
  "20261109060047_studyspace_announcement_creator_index.sql",
  "20261110151719_studyspace_public_self_service_enrolment.sql",
  "20261110201714_studyspace_post_trial_access_pins.sql",
  "20261110202759_studyspace_course_profile_rpc_compatibility.sql",
  "20261110205145_studyspace_profile_setup_dismissal.sql",
  "20261110205311_studyspace_profile_country_save.sql",
  "20261111130107_studyspace_fix_auto_group_subject_aggregation.sql",
  "20261111132915_studyspace_remove_grouped_subject_having_from_auto_groups.sql",
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
  "20261109031500_studyspace_age9_mia_education_terms_v7.sql",
  "20261109043000_studyspace_terms_v8_gemini_admin_provider_disclosure.sql",
  "20261109060200_studyspace_announcement_creator_index.sql",
];

test("migration files use applied Supabase versions and retain every applied migration", () => {
  for (const file of required) assert.ok(files.includes(file), "Missing migration source: " + file);
  for (const file of superseded) assert.ok(!files.includes(file), "Superseded migration version remains: " + file);
  const versions = files.map((file) => file.slice(0, 14));
  assert.equal(new Set(versions).size, versions.length, "Migration version prefixes must be unique.");
});

const realtimeMigrations = [
  ["20261106051401_studyspace_realtime_classroom_membership.sql", "class_session_members"],
  ["20261108161203_studyspace_realtime_homework_notifications.sql", "exercise_assignments"],
  ["20261108182736_student_feedback_realtime_inbox.sql", "student_feedback"],
];

test("all Realtime publication migrations are present and idempotent", () => {
  for (const [file, table] of realtimeMigrations) {
    assert.ok(files.includes(file), "Missing Realtime migration source: " + file);
    const sql = readFileSync("supabase/migrations/" + file, "utf8");
    assert.match(sql, /\bif\s+not\s+exists\b/i, file + " must guard against duplicate publication entries.");
    assert.match(sql, /pg_publication_tables/i, file + " must inspect the current publication.");
    assert.ok(
      sql.toLowerCase().includes("alter publication supabase_realtime add table public." + table),
      file + " must publish public." + table + ".",
    );
  }
});
