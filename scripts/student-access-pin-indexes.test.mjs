import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  "supabase/migrations/20261112203307_studyspace_add_student_access_pin_fk_indexes.sql",
  "utf8",
);

test("student access PIN creator and redeemer foreign keys are indexed", () => {
  assert.match(sql, /create index if not exists student_access_pins_created_by_idx\s+on public\.student_access_pins \(created_by\)/i);
  assert.match(sql, /create index if not exists student_access_pins_redeemed_by_idx\s+on public\.student_access_pins \(redeemed_by\)/i);
});
