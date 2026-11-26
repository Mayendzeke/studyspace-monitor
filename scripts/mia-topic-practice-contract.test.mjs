import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/mia-assistant/index.ts", "utf8");
const provider = readFileSync("supabase/functions/mia-assistant/provider.ts", "utf8");

test("student MIΛ keeps the production topic-practice endpoint in source control", () => {
  assert.match(source, /body\.action === "generate_topic_test"/);
  assert.match(source, /body\.subject/);
  assert.match(source, /body\.notesText/);
  assert.match(source, /body\.questionCount/);
  assert.match(source, /recentAssessmentContext/);
});

test("topic practice is limited to registered subjects and validates every question", () => {
  assert.match(source, /subjects\.some/);
  assert.match(source, /question_type/);
  assert.match(source, /multiple_choice/);
  assert.match(source, /true_false/);
  assert.match(source, /fill_blank/);
  assert.match(source, /word_puzzle/);
  assert.match(source, /matching/);
  assert.match(source, /did not meet the assessment quality checks/);
});

test("student MIΛ enforces password setup and current terms before protected learning actions", () => {
  assert.match(source, /must_change_password/);
  assert.match(source, /2026-11-24-v9/);
  assert.match(source, /generate_topic_test/);
});

test("student MIΛ chat responses and provider output stay bounded", () => {
  assert.match(source, /maximum 1200 characters/);
  assert.match(source, /String\(result\.reply\)\.slice\(0, 1200\)/);
  assert.match(provider, /Math\.min\(3000/);
  assert.match(provider, /MIΛ’s primary learning model was temporarily unavailable/);
  assert.doesNotMatch(provider, /Qwen 3\.8 completed it/);
});
