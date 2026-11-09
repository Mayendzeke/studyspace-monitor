import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/mia-monitor-assistant/index.ts", "utf8");
const provider = readFileSync("supabase/functions/mia-monitor-assistant/provider.ts", "utf8");

test("Monitor MIA delegates provider response normalization to its shared adapter", () => {
  assert.match(source, /generateWithFallback\\(prompt/, "Monitor MIA must use the shared provider adapter.");
  assert.match(provider, /const raw = choice\\?\\.message\\?\\.content/, "Gemma message content must be read.");
  assert.match(provider, /typeof raw === ["']string["']/, "MIA must support plain string content.");
  assert.match(provider, /Array\\.isArray\\(raw\\)/, "MIA must support structured message content arrays.");
  assert.match(provider, /typeof part === ["']string["']/, "MIA must preserve plain string content parts.");
  assert.match(provider, /typeof part\\?\\.text === ["']string["']/, "MIA must extract text from typed content parts.");
  const newlineSeparatorSlashes = provider.match(/\\.join\\("(\\\\+)n"\\)/)?.[1]?.length;
  assert.equal(newlineSeparatorSlashes, 1, "MIA must separate content parts with one escaped newline.");
  assert.match(provider, /typeof choice\\?\\.text === ["']string["']/, "MIA must handle legacy completion text.");
  assert.match(provider, /if\\s*\\(!text\\)\\s*throw new Error/, "MIA must fail clearly when no usable text is returned.");
});

test("Administrator MIA is restricted to educational purposes", () => {
  assert.match(source, /for educational purposes only/i);
  assert.match(source, /not clearly educational, refuse briefly/i);
});
