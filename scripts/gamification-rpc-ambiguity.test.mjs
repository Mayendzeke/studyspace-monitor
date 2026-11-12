import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261112203306_studyspace_fix_gamification_rpc_output_ambiguity.sql",
  "utf8",
);

test("learner gamification output columns are qualified against table columns", () => {
  assert.match(migration, /sum\(a\.study_minutes\)/);
  assert.match(migration, /sum\(a\.completed_assessments\)/);
  assert.match(migration, /sum\(a\.flashcards_reviewed\)/);
  assert.match(migration, /where a\.learner_id = v_user/);
});

test("Monitor longest-streak aggregation qualifies learner_id in its CTE", () => {
  assert.match(migration, /select q\.learner_id, max\(q\.n\)::integer as longest/);
  assert.match(migration, /group by r\.learner_id, r\.grp/);
  assert.match(migration, /group by q\.learner_id/);
});

test("gamification RPC execute privileges remain restricted to signed-in users", () => {
  for (const fn of [
    "get_studyspace_gamification_summary",
    "get_studyspace_monitor_gamification_overview",
  ]) {
    assert.ok(migration.includes("revoke all on function public." + fn + "() from public, anon"));
    assert.ok(migration.includes("grant execute on function public." + fn + "() to authenticated"));
  }
});
