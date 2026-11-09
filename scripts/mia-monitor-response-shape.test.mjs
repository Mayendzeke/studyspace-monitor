import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/mia-monitor-assistant/index.ts", "utf8");
const provider = readFileSync("supabase/functions/mia-monitor-assistant/provider.ts", "utf8");

test("Monitor MIA delegates provider response normalization to its shared adapter", () => {
  assert.ok(source.includes("generateWithFallback(prompt"), "Monitor MIA must use the shared provider adapter.");
  assert.ok(source.includes("systemPrompt: system"), "MIA policy must be passed separately from chat history.");
  assert.ok(provider.includes('systemInstruction: { parts: [{ text: options.systemPrompt }] }'), "Gemini must receive a trusted system instruction.");
  assert.ok(provider.includes('role: "system", content: options.systemPrompt'), "Gemma must receive a trusted system message.");
  assert.ok(provider.includes("const raw = choice?.message?.content"), "Gemma message content must be read.");
  assert.ok(provider.includes('typeof raw === "string"'), "MIA must support plain string content.");
  assert.ok(provider.includes("Array.isArray(raw)"), "MIA must support structured message content arrays.");
  assert.ok(provider.includes('typeof part === "string"'), "MIA must preserve plain string content parts.");
  assert.ok(provider.includes('typeof part?.text === "string"'), "MIA must extract text from typed content parts.");
  assert.ok(provider.includes('.join("\\n")'), "MIA must separate content parts with one escaped newline.");
  assert.ok(provider.includes('typeof choice?.text === "string"'), "MIA must handle legacy completion text.");
  assert.ok(provider.includes("if (!text) throw new Error("), "MIA must fail clearly when no usable text is returned.");
  assert.ok(provider.includes("candidate?.content?.parts"), "Gemini candidate content parts must be parsed.");
});

test("Administrator MIA is restricted to educational purposes", () => {
  assert.ok(source.includes("for educational purposes only"));
  assert.ok(source.includes("not clearly educational, refuse briefly"));
});
