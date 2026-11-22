import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("Monitor retains its enhanced neumorphic identity in both themes", () => {
  assert.match(css, /Study Space enhanced neumorphic layer/);
  assert.match(css, /--raised-hover:/);
  assert.match(css, /data-theme='dark'/);
  assert.match(css, /var\(--raised\)/);
});

test("Monitor cards and controls provide raised, inset and press states", () => {
  assert.match(css, /\.panel/);
  assert.match(css, /box-shadow:\s*var\(--inset\)/);
  assert.match(css, /button:active/);
  assert.match(css, /perspective\(900px\)/);
});

test("Monitor motion and mobile styling remain accessible", () => {
  assert.match(css, /max-width:\s*760px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible/);
});
