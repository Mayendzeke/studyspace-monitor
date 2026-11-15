import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("Monitor exposes the shared StudySpace brand and typography tokens", () => {
  assert.match(css, /--brand-primary:\s*var\(--purple\)/);
  assert.match(css, /--brand-primary-strong:\s*var\(--purple-dark\)/);
  assert.match(css, /--brand-secondary:\s*var\(--mint\)/);
  assert.match(css, /--font-body:\s*'DM Sans'/);
  assert.match(css, /--font-display:\s*'Manrope'/);
  assert.match(css, /font-family:\s*var\(--font-body\)/);
});

test("Monitor keeps the shared purple base and teal secondary accent", () => {
  assert.match(css, /--purple:\s*#7164d8/);
  assert.match(css, /--purple-dark:\s*#5d51c3/);
  assert.match(css, /--mint:\s*#26866e/);
});
