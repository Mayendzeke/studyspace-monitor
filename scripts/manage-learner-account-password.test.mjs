import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const edge = read("../supabase/functions/manage-learner-account/index.ts");
const learners = read("../src/components/LearnersPage.tsx");

test("administrator password reset forces a new private learner password", () => {
  assert.ok(edge.includes("if (action === \"reset_password\")"));
  assert.ok(edge.includes("learner.account_status !== \"active\""));
  assert.ok(edge.includes("must_change_password: true"));
  assert.ok(edge.includes("password_reset_at: new Date().toISOString()"));
  assert.ok(edge.includes("password: temporaryPassword,"));
  assert.ok(edge.includes("temporaryPassword,"));
});

test("administrator password reset revokes refresh sessions", () => {
  assert.ok(edge.includes("admin.auth.admin.signOut(temporarySession.session.access_token)"));
  assert.ok(edge.includes("Could not create a temporary learner session for session revocation"));
});

test("Monitor reveals the one-time password only after a successful reset", () => {
  assert.ok(learners.includes("body: { learnerId: learner.id, action }"));
  assert.ok(learners.includes("if (action === \"reset_password\")"));
  assert.ok(learners.includes("data.temporaryPassword"));
  assert.ok(learners.includes("It will only be shown once."));
});
