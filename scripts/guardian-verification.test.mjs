import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const endpoint = readFileSync(new URL("../supabase/functions/manage-guardian-verification/index.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const queue = readFileSync(new URL("../src/components/GuardianVerificationPage.tsx", import.meta.url), "utf8");

test("guardian verification queue validates real ISO calendar dates", () => {
  assert.ok(endpoint.includes(String.raw`const dob = /^\\d{4}-\\d{2}-\\d{2}$/`));
  assert.ok(endpoint.includes("dob.toISOString().slice(0, 10) === dateOfBirth"));
});

test("guardian verification is available in Monitor navigation and protected by administrator MFA", () => {
  assert.match(app, /label: 'Guardian verification'/);
  assert.match(app, /page === 'Guardian verification' && <GuardianVerificationPage \/>/);
  assert.match(endpoint, /assurance\.currentLevel !== "aal2"/);
});

test("guardian queue does not expose a negative age for malformed legacy records", () => {
  assert.match(queue, /Age unavailable/);
});

test("Monitor security settings identify the current terms version", () => {
  assert.match(app, /current Terms v9/);
  assert.doesNotMatch(app, /current Terms v8/);
});
