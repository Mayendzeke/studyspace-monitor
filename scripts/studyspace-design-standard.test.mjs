import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const brandStyles = readFileSync(new URL("../src/brand-home-link.css", import.meta.url), "utf8");
const standard = readFileSync(new URL("../STUDYSPACE_DEVELOPMENT_STANDARD.md", import.meta.url), "utf8");
const pullRequest = readFileSync(new URL("../.github/pull_request_template.md", import.meta.url), "utf8");

test("Monitor Study Space brand control returns to the home page", () => {
  assert.match(app, /className="brand-home-link" onClick={() => navigate('Overview')}/);
  assert.match(brandStyles, /.brand-home-link:focus-visible/);
});

test("the uniform Study Space visual standard is part of the repository release process", () => {
  assert.match(standard, /Mandatory design and experience rule/);
  assert.match(standard, /Every development change, bug fix, refactor, integration, and upgrade/);
  assert.match(pullRequest, /follows `STUDYSPACE_DEVELOPMENT_STANDARD.md`/);
  assert.match(pullRequest, /Desktop and mobile layouts have been checked/);
  assert.match(pullRequest, /Light and dark themes have been checked/);
});
