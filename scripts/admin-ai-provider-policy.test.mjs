import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adminFunctions = [
  "mia-monitor-assistant",
  "generate-lesson-recap",
  "generate-homework",
];

for (const name of adminFunctions) {
  const provider = readFileSync(`supabase/functions/${name}/provider.ts`, "utf8");
  const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8");

  test(`${name} attempts Gemini whenever its API key is configured`, () => {
    assert.ok(provider.includes("gemini: { configured: Boolean(geminiKey()), model: GEMINI_MODEL }"));
    assert.ok(!provider.includes("GEMINI_API_PAID_SERVICE_CONFIRMED"));
    assert.ok(provider.includes("if (status.gemini.configured)"));
    assert.ok(provider.includes("AbortSignal.timeout(60000)"), "Gemini must have enough time to answer before fallback.");
    assert.ok(provider.includes("[StudySpace AI provider fallback]"), "Provider fallback reason should be visible in server diagnostics.");
  });

  test(`${name} automatically falls back to Gemma after a non-safety Gemini failure`, () => {
    assert.ok(provider.includes("primaryFailure = error instanceof Error ? error.message"));
    assert.ok(provider.includes("const text = await callGemma(prompt, config)"));
    assert.ok(provider.includes("Gemma 4 handled this request as the automatic backup."));
  });

  test(`${name} does not impose a separate 80-request daily cap`, () => {
    assert.ok(!source.includes("daily MIΛ limit of 80 requests"));
    assert.ok(!source.includes(">= 80"));
    assert.ok(source.includes('event_type: "mia_admin_request"'), "Usage must still be audited.");
  });
}

test("Monitor MIΛ no longer displays or returns a daily request counter", () => {
  const source = readFileSync("supabase/functions/mia-monitor-assistant/index.ts", "utf8");
  const ui = readFileSync("src/components/MiaStudio.tsx", "utf8");
  assert.ok(!source.includes("remainingDailyRequests"));
  assert.ok(!ui.includes("requests left today"));
  assert.ok(!ui.includes("setRemaining("));
});

test("learner MIΛ remains separate from the Gemini administrator provider", () => {
  const source = readFileSync("supabase/functions/mia-assistant/index.ts", "utf8");
  assert.ok(!source.includes("GEMINI_API_KEY"));
  assert.ok(!source.includes("mia-monitor-assistant"));
  assert.ok(!source.includes(">= 20"), "Learner MIΛ must not add an application-level daily cap.");
  assert.ok(!source.includes("remainingDailyRequests"));
  assert.ok(source.includes("quotaManagedByProvider"), "Only the AI provider's own quota should govern learner requests.");
});
