import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/mia-monitor-assistant/index.ts", "utf8");

test("Monitor MIA normalizes string, text-part array, and legacy completion content", () => {
  assert.match(source, /Array\.isArray\(raw\)/, "MIA must support structured message content arrays.");
  assert.match(source, /typeof part === ["']string["']/, "MIA must preserve plain string content parts.");
  assert.match(source, /typeof part\?\.text === ["']string["']/, "MIA must extract text from typed content parts.");
  assert.ok(source.includes('.join("\\n")'), "MIA must separate content parts with an actual newline.");
  assert.match(source, /typeof choice\?\.text === ["']string["']/, "MIA must handle legacy completion text.");
  assert.match(source, /if\s*\(!text\)\s*throw new Error/, "MIA must fail clearly when no usable text is returned.");
});
