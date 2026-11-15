import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const pathways = read("../src/lib/educationPathways.ts");
const learners = read("../src/components/LearnersPage.tsx");
const edge = read("../supabase/functions/manage-learner-account/index.ts");
const studio = read("../src/components/ContentStudio.tsx");

test("Monitor uses the same five-stage pathway model as Student", () => {
  for (const stage of ["Primary", "Secondary High", "High School", "Matric", "Tertiary"]) {
    assert.ok(pathways.includes('"' + stage + '"'));
  }
  assert.match(pathways, /Grades 0–7/);
  assert.match(pathways, /Forms 1–3/);
  assert.match(pathways, /Forms 4–5/);
  assert.match(pathways, /Form 6/);
  assert.match(pathways, /TERTIARY_QUALIFICATIONS/);
});

test("learner records preserve the selected pathway and qualification fields", () => {
  assert.match(learners, /institution_type/);
  assert.match(learners, /qualification_level/);
  assert.match(learners, /education_level: learner\.education_level \|\| "Secondary High"/);
  assert.match(learners, /education_level: profileForm\.education_level/);
  assert.match(learners, /EDUCATION_PATHWAYS\.map/);
  assert.match(learners, /TERTIARY_INSTITUTION_TYPES/);
  assert.match(learners, /TERTIARY_QUALIFICATIONS/);
  assert.doesNotMatch(learners, /value="Secondary High" disabled/);
});

test("Monitor's learner API validates stage and tertiary institution and award data", () => {
  assert.match(edge, /educationStages = \["Primary", "Secondary High", "High School", "Matric", "Tertiary"\]/);
  assert.match(edge, /institutionTypes = \["University", "College", "Technical \/ TVET", "Other"\]/);
  assert.match(edge, /qualifications = \[/);
  assert.match(edge, /updates\.institution_type = institutionType/);
  assert.match(edge, /updates\.qualification_level = qualificationLevel/);
  assert.match(edge, /updates\.institution_type = "School"/);
});

test("Content Studio scopes assessments and bulk assignment to the selected education stage", () => {
  assert.match(studio, /standardEducationLevels = \[\.\.\.EDUCATION_STAGES\]/);
  assert.match(studio, /level: String\(set\.education_level \|\| 'Secondary High'\)/);
  assert.match(studio, /isTertiaryStage\(level\)/);
  assert.match(studio, /\? levelLearners/);
  assert.match(studio, /All active learners in selected level/);
  assert.doesNotMatch(studio, /All learners \(Secondary High\)/);
});
