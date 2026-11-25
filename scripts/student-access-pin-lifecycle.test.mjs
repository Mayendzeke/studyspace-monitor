import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const creator = read("supabase/functions/create-access-pin/index.ts");
const redeemer = read("supabase/functions/redeem-access-pin/index.ts");
const migration = read("supabase/migrations/20261110201714_studyspace_post_trial_access_pins.sql");
const workflow = read(".github/workflows/deploy.yml");

test("renewal PIN issuance is restricted to an active MFA-verified administrator after access expires", () => {
  assert.match(creator, /currentLevel !== "aal2"/);
  assert.match(creator, /actor\?\.role !== "admin"/);
  assert.match(creator, /actor\?\.account_status !== "active"/);
  assert.match(creator, /if \(currentExpiry && new Date\(currentExpiry\)\.getTime\(\) > now\)/);
});

test("each renewal PIN expires exactly 24 hours after issue and stores only its keyed digest", () => {
  assert.match(creator, /const expiresAt = new Date\(now \+ 24 \* 60 \* 60 \* 1000\)\.toISOString\(\)/);
  assert.match(creator, /const pinHash = await pinDigest\(pin, pinPepper\)/);
  assert.match(creator, /pin_hash: pinHash/);
  assert.match(creator, /message: "Access PIN created\. Copy it now; it is shown only once\."/);
  assert.doesNotMatch(creator, /pin_hash:\s*pin\s*[,}]/);
});

test("issuing a replacement revokes the learner's prior unused PIN", () => {
  assert.match(creator, /from\("student_access_pins"\)[\s\S]*?\.update\(\{ revoked_at: issuedAt \}\)[\s\S]*?\.eq\("learner_id", learner\.id\)[\s\S]*?\.is\("redeemed_at", null\)[\s\S]*?\.is\("revoked_at", null\)/);
  assert.match(migration, /student_access_pins_one_unused_per_learner_idx[\s\S]*?where redeemed_at is null and revoked_at is null/i);
});

test("renewal PIN redemption requires an authenticated active learner and is rate limited", () => {
  assert.match(redeemer, /auth\.getUser\(token\)/);
  assert.match(redeemer, /account_status/);
  assert.match(redeemer, /count \?\? 0\) >= 5/);
  assert.match(redeemer, /15 minutes/);
  assert.match(redeemer, /redeem_studyspace_access_pin/);
});

test("the database atomically consumes only a matching unexpired, unrevoked, unused PIN after access ends", () => {
  assert.match(migration, /v_profile\.account_status <> 'active'/);
  assert.match(migration, /subscription_expires_at > v_now/);
  assert.match(migration, /trial_expires_at > v_now/);
  assert.match(migration, /set redeemed_at = v_now,[\s\S]*?redeemed_by = p_learner_id/);
  assert.match(migration, /p\.pin_hash = p_pin_hash[\s\S]*?p\.redeemed_at is null[\s\S]*?p\.revoked_at is null[\s\S]*?p\.expires_at > v_now/);
  assert.match(migration, /revoke all on function public\.redeem_studyspace_access_pin\(uuid, text\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.redeem_studyspace_access_pin\(uuid, text\) to service_role/i);
});

test("Monitor deployment type-checks the renewal PIN creator and redeemer", () => {
  assert.match(workflow, /deno check supabase\/functions\/create-access-pin\/index\.ts/);
  assert.match(workflow, /deno check supabase\/functions\/redeem-access-pin\/index\.ts/);
  assert.match(workflow, /run complete automated regression suite/i);
});
