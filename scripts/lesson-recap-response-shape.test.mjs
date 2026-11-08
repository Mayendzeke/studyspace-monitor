import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/generate-lesson-recap/index.ts", "utf8");

test("lesson recap handles Cloudflare response bodies and content variants", () => {
  assert.match(source, /const responseText = await response\.text\(\)/, "Read the raw provider body before parsing it.");
  assert.match(source, /JSON\.parse\(responseText\)/, "Parse the provider response body explicitly.");
  assert.match(source, /Array\.isArray\(content\)/, "Support structured content-part arrays.");
  const newlineSeparatorSlashes = source.slice(source.indexOf("Array.isArray(rawContent)")).match(/\.join\("(\\+)n"\)/)?.[1]?.length;
  assert.equal(newlineSeparatorSlashes, 1, "Join provider text parts with one escaped newline.");
  assert.match(source, /typeof choice\?\.text === ["']string["']/, "Support the legacy completion text field.");
  assert.match(source, /response_format:\s*\{\s*type:\s*["']json_object["']\s*\}/, "Request JSON mode for the recap object.");
});

test("lesson recap forwards null-body HTTP statuses safely", () => {
  assert.match(source, /if\s*\(\[204,\s*205,\s*304\]\.includes\(error\.status\)\)/, "Do not construct a text body for bodyless HTTP statuses.");
  assert.match(source, /new Response\(null,\s*\{\s*status:\s*error\.status,\s*headers\s*\}\)/, "Forward bodyless statuses with a null body.");
});
