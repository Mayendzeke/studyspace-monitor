import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/generate-lesson-recap/index.ts", "utf8");
const provider = readFileSync("supabase/functions/generate-lesson-recap/provider.ts", "utf8");

test("lesson recap provider adapter handles raw responses and content variants", () => {
  assert.ok(provider.includes("const responseText = await response.text()"), "Read the raw provider body before parsing it.");
  assert.ok(provider.includes("JSON.parse(responseText)"), "Parse the provider response body explicitly.");
  assert.ok(provider.includes("Array.isArray(raw)"), "Support structured content-part arrays.");
  assert.ok(provider.includes('.join("\\n")'), "Join provider text parts with one escaped newline.");
  assert.ok(provider.includes('typeof choice?.text === "string"'), "Support the legacy completion text field.");
  assert.ok(provider.includes('response_format: { type: "json_object" }'), "Request JSON mode for structured Gemma responses.");
  assert.ok(source.includes("jsonMode: true"), "The recap endpoint must request JSON mode through the adapter.");
});

test("lesson recap forwards null-body HTTP statuses safely", () => {
  assert.ok(source.includes("[204, 205, 304].includes(error.status)"), "Do not construct a text body for bodyless HTTP statuses.");
  assert.ok(source.includes("new Response(null, { status: error.status, headers })"), "Forward bodyless statuses with a null body.");
});
