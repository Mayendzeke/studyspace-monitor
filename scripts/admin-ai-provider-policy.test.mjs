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

  test(`${name} exposes Gemini primary and Gemma 4 backup health`, () => {
    assert.ok(provider.includes('primary: "Google Gemini API (Free tier)"'));
    assert.ok(provider.includes('backup: "Cloudflare Workers AI · Gemma 4"'));
    assert.ok(provider.includes('export const GEMINI_MODEL = "gemini-2.5-flash"'));
    assert.ok(provider.includes('export const GEMMA_MODEL = "@cf/google/gemma-4-26b-a4b-it"'));
    assert.ok(provider.includes("gemini: { configured: Boolean(geminiKey()), model: GEMINI_MODEL }"));
    assert.ok(provider.includes("gemma: { configured: Boolean(cloudflare.accountId && cloudflare.apiToken), model: GEMMA_MODEL }"));
    assert.ok(provider.includes('Deno.env.get("GEMINI_API_KEY")'));
    assert.ok(provider.includes('Deno.env.get("CLOUDFLARE_ACCOUNT_ID")'));
    assert.ok(provider.includes('Deno.env.get("CLOUDFLARE_API_TOKEN")'));
    assert.ok(provider.includes("AbortSignal.timeout(60000)"));
    assert.ok(provider.includes("AbortSignal.timeout(45000)"));
    assert.ok(!provider.includes("backup: \"Disabled\""));
    assert.ok(!provider.includes("No paid AI fallback is enabled"));
  });

  test(`${name} tries Gemini first and automatically falls back to Gemma 4`, () => {
    const generation = provider.slice(provider.indexOf("export async function generateWithFallback("));
    assert.ok(generation.indexOf("callGemini(prompt, config)") < generation.indexOf("callGemma(prompt, config)"));
    assert.ok(generation.includes("if (error instanceof ProviderSafetyError) throw error"));
    assert.ok(generation.includes("fallbackUsed: true"));
    assert.ok(generation.includes("Gemini was unavailable for this request"));
    assert.ok(generation.includes("if (config.googleSearch)"));
    assert.ok(generation.includes("Gemma backup does not provide"));
  });

  test(`${name} keeps personal-data restrictions and request auditing`, () => {
    assert.ok(provider.includes("assertNoPersonalIdentifiers"));
    assert.ok(source.includes("event_type: \"mia_admin_request\""), "Usage must still be audited.");
    assert.ok(source.includes('backup_provider: "Cloudflare Workers AI · Gemma 4"'));
    assert.ok(!source.includes("daily MIΛ limit of 80 requests"));
    assert.ok(!source.includes(">= 80"));
  });
}

test("Monitor MIΛ shows both hybrid providers without a daily request counter", () => {
  const source = readFileSync("supabase/functions/mia-monitor-assistant/index.ts", "utf8");
  const ui = readFileSync("src/components/MiaStudio.tsx", "utf8");
  assert.ok(!source.includes("remainingDailyRequests"));
  assert.ok(!ui.includes("requests left today"));
  assert.ok(!ui.includes("setRemaining("));
  assert.ok(ui.includes("Hybrid AI · Gemini primary · Gemma 4 backup"));
  assert.ok(ui.includes("Cloudflare Workers AI · Gemma 4"));
  assert.ok(ui.includes("CLOUDFLARE_ACCOUNT_ID"));
});

test("learner MIΛ remains separate from the administrator hybrid system", () => {
  const source = readFileSync("supabase/functions/mia-assistant/index.ts", "utf8");
  const provider = readFileSync("supabase/functions/_shared/ai-provider.ts", "utf8");
  assert.ok(!source.includes("GEMINI_API_KEY"));
  assert.ok(!source.includes("mia-monitor-assistant"));
  assert.ok(source.includes('Deno.env.get("CLOUDFLARE_API_TOKEN")'), "Learner Cloudflare credentials are read server-side.");
  assert.ok(!source.includes(">= 20"), "Learner MIΛ must not add an application-level daily cap.");
  assert.ok(!source.includes("remainingDailyRequests"));
  assert.ok(source.includes("quotaManagedByProvider"));
  assert.ok(provider.includes("export const GEMMA_MODEL"));
  assert.ok(provider.includes("export const SECONDARY_MODEL"));
  assert.ok(provider.includes("@cf/qwen/qwen3.8-27b"));
});

test("Monitor and learner apps retain the seven-day future trial policy without resetting active expiries", () => {
  const migration = readFileSync("supabase/migrations/20261125161943_studyspace_seven_day_trial.sql", "utf8");
  assert.ok(migration.includes("interval ''168 hours''"));
  assert.ok(!/UPDATE public\.profiles\s+SET trial_expires_at/i.test(migration));
  assert.ok(readFileSync("src/components/SubscriptionsPage.tsx", "utf8").includes("7-day Free Trial"));
});

test("Monitor toolbar removes redundant breadcrumb and duplicate quick actions", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const start = app.indexOf('<header className="topbar"');
  const end = app.indexOf("</header>", start);
  assert.ok(start >= 0 && end > start);
  const header = app.slice(start, end);
  assert.ok(!header.includes("breadcrumb"));
  assert.ok(!header.includes("monitor-install-button"));
  assert.ok(!header.includes("Open messages"));
  assert.ok(header.includes("MFA verified"));
  assert.ok(header.includes("NotificationCenter"));
  assert.ok(header.includes("aria-label=\"Sign out\""));
});
