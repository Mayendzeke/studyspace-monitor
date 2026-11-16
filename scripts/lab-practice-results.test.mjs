import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const monitor = readFileSync("src/components/LabsManagementPage.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261116094000_lab_practice_attempts_admin_read.sql", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

test("Monitor reads only submitted Lab practice attempts through a dedicated results view", () => {
  assert.ok(monitor.includes('from("lab_practice_attempts")'));
  assert.ok(monitor.includes('eq("status","submitted")'));
  assert.ok(monitor.includes('item==="Practice results"'));
  assert.ok(monitor.includes("Student practice results"));
  assert.ok(monitor.includes("Review answers and explanations"));
  assert.ok(monitor.includes("formative"));
});

test("Practice results access is read-only and requires administrator MFA", () => {
  assert.ok(migration.includes("create policy lab_practice_attempts_admin_read"));
  assert.ok(migration.includes("for select"));
  assert.ok(migration.includes("public.is_studyspace_admin()"));
  assert.ok(migration.includes("= 'aal2'"));
  assert.doesNotMatch(migration, /for\s+(insert|update|delete|all)/i);
});

test("Practice results are clearly separated from official school marks", () => {
  assert.ok(monitor.includes("not official school assessment marks"));
  assert.ok(monitor.includes("formative learner practice"));
  assert.ok(styles.includes(".monitor-labs-practice-card"));
  assert.ok(styles.includes("@media(max-width:620px)"));
});
