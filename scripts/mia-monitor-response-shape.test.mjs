import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/mia-monitor-assistant/index.ts", "utf8");
const provider = readFileSync("supabase/functions/mia-monitor-assistant/provider.ts", "utf8");

test("Monitor MIA uses Gemini response normalization without a paid secondary provider", () => {
  assert.ok(source.includes("generateWithFallback(prompt"), "Monitor MIA must use the shared provider adapter.");
  assert.ok(source.includes("systemPrompt: system"), "MIA policy must be passed separately from chat history.");
  assert.ok(provider.includes('systemInstruction: { parts: [{ text: options.systemPrompt }] }'), "Gemini must receive a trusted system instruction.");
  assert.ok(provider.includes("candidate?.content?.parts"), "Gemini candidate content parts must be parsed.");
  assert.ok(provider.includes('typeof part?.text === "string"'), "MIA must extract text from typed content parts.");
  assert.ok(provider.includes('.join("\\n")'), "MIA must separate content parts with one escaped newline.");
  assert.ok(provider.includes("if (!text) throw new Error("), "MIA must fail clearly when no usable text is returned.");
  assert.ok(provider.includes("Gemini Free tier is temporarily unavailable"));
  assert.ok(!provider.includes("CLOUDFLARE"));
  assert.ok(!provider.includes("callGemma"));
});

test("Administrator MIA is restricted to educational purposes", () => {
  assert.ok(source.includes("for educational purposes only"));
  assert.ok(source.includes("not clearly educational, refuse briefly"));
});
