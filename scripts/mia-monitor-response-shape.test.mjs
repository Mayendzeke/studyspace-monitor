import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/mia-monitor-assistant/index.ts", "utf8");
const provider = readFileSync("supabase/functions/mia-monitor-assistant/provider.ts", "utf8");

test("Monitor MIA uses Gemini response normalization with Gemma 4 fallback", () => {
  assert.ok(source.includes("generateWithFallback(prompt"), "Monitor MIA must use the shared provider adapter.");
  assert.ok(source.includes("systemPrompt: system"), "MIA policy must be passed separately from chat history.");
  assert.ok(provider.includes('systemInstruction: { parts: [{ text: options.systemPrompt }] }'), "Gemini must receive a trusted system instruction.");
  assert.ok(provider.includes("candidate?.content?.parts"), "Gemini candidate content parts must be parsed.");
  assert.ok(provider.includes('typeof part?.text === "string"'), "MIA must extract text from typed content parts.");
  assert.ok(provider.includes('.join("\\n")'), "MIA must separate content parts with one escaped newline.");
  assert.ok(provider.includes("if (!text) throw new Error("), "MIA must fail clearly when no usable text is returned.");
  assert.ok(provider.includes("Gemini primary failed"), "Gemini failures must be reported before fallback errors.");
  assert.ok(provider.includes("Cloudflare Workers AI · Gemma 4"), "The Cloudflare backup must be identified.");
  assert.ok(provider.includes("callGemma(prompt, config)"), "The backup must be attempted automatically.");
  assert.ok(provider.includes("fallbackUsed: true"), "Fallback use must be recorded.");
  assert.ok(provider.includes("ProviderSafetyError"), "Safety refusals must never fall through to another provider.");
});

test("Administrator MIA is restricted to educational purposes", () => {
  assert.ok(source.includes("for educational purposes only"));
  assert.ok(source.includes("not clearly educational, refuse briefly"));
});
