import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const learners = read("../src/components/LearnersPage.tsx");
const studio = read("../src/components/ContentStudio.tsx");

test("Monitor fixes every learner record to Secondary High", () => {
  assert.match(learners, /education_level: "Secondary High"/);
  assert.match(learners, /profile: \{ \.\.\.profileForm, education_level: "Secondary High"/);
  assert.match(learners, /value="Secondary High" disabled/);
  assert.doesNotMatch(learners, /placeholder="Primary, Secondary, Tertiary/);
});

test("Content Studio exposes and saves only Secondary High", () => {
  assert.match(studio, /standardEducationLevels = \['Secondary High'\]/);
  assert.match(studio, /const learnerLevels=standardEducationLevels/);
  assert.match(studio, /level: 'Secondary High'/);
  assert.match(studio, /level==='Secondary High'\?'Form \/ grade'/);
  assert.doesNotMatch(studio, /standardEducationLevels = \[[^\]]*(Primary school|Secondary school|College|University)/);
  assert.doesNotMatch(studio, /All learners \(all levels\)/);
});
