import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const functionsRoot = join(root, "supabase", "functions");
const functionDirectories = readdirSync(functionsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name);

const sources = new Map(functionDirectories.map(name => [
  name,
  readFileSync(join(functionsRoot, name, "index.ts"), "utf8"),
]));

test("no production Edge Function source retains the obsolete Terms v8 identifier", () => {
  const stale = [...sources.entries()]
    .filter(([, source]) => source.includes("2026-11-09-v8"))
    .map(([name]) => name);
  assert.deepEqual(stale, [], "Stale Terms v8 references remain in: " + stale.join(", "));
});

test("all Terms-gated learning, guardian and classroom functions require Terms v9", () => {
  const required = [
    "assessment-scheduler",
    "guardian-consent",
    "jaas-token",
    "lab-learning-engine",
    "manage-guardian-verification",
    "mark-class-homework",
    "mia-assistant",
    "study-material-engine",
    "submit-exercise-attempt",
  ];
  for (const name of required) {
    const source = sources.get(name);
    assert.ok(source, "Missing Edge Function source: " + name);
    assert.ok(source.includes("2026-11-24-v9"), name + " must enforce the current Terms version.");
  }
});
