import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/generate-lesson-recap/index.ts", "utf8");
const provider = readFileSync("supabase/functions/generate-lesson-recap/provider.ts", "utf8");

test("lesson recap provider adapter handles raw responses and content variants", () => {
  assert.ok(provider.includes("const responseText = await response.text()"), "Read the raw provider body before parsing it.");
  assert.ok(provider.includes("JSON.parse(responseText)"), "Parse the provider response body explicitly.");
  assert.ok(source.includes("systemPrompt"), "Lesson recap policy must be passed separately from lesson notes.");
  assert.ok(provider.includes('systemInstruction: { parts: [{ text: options.systemPrompt }] }'), "Gemini must receive a trusted system instruction.");
  assert.ok(provider.includes("candidate?.content?.parts"), "Support Gemini candidate content-part arrays.");
  assert.ok(provider.includes('typeof part?.text === "string"'), "Extract text from Gemini content parts.");
  assert.ok(provider.includes('.join("\\n")'), "Join Gemini text parts with one escaped newline.");
  assert.ok(provider.includes('responseMimeType: "application/json"'), "Request JSON mode for structured Gemini responses.");
  assert.ok(!provider.includes("CLOUDFLARE") && !provider.includes("callGemma"), "Lesson recap must not call a paid secondary provider.");
  assert.ok(source.includes("jsonMode: true"), "The recap endpoint must request JSON mode through the adapter.");
});

test("lesson recap forwards null-body HTTP statuses safely", () => {
  assert.ok(source.includes("[204, 205, 304].includes(error.status)"), "Do not construct a text body for bodyless HTTP statuses.");
  assert.ok(source.includes("new Response(null, { status: error.status, headers })"), "Forward bodyless statuses with a null body.");
});
