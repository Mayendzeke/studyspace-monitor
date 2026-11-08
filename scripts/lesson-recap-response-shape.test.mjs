import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/generate-lesson-recap/index.ts", "utf8");

test("lesson recap handles Cloudflare response bodies and content variants", () => {
  assert.match(source, /const responseText = await response\.text\(\)/, "Read the raw provider body before parsing it.");
  assert.match(source, /JSON\.parse\(responseText\)/, "Parse the provider response body explicitly.");
  assert.match(source, /Array\.isArray\(content\)/, "Support structured content-part arrays.");
  assert.match(source, /typeof choice\?\.text === ["']string["']/, "Support the legacy completion text field.");
  assert.match(source, /response_format:\s*\{\s*type:\s*["']json_object["']\s*\}/, "Request JSON mode for the recap object.");
});
