import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const pathways = read("../src/lib/educationPathways.ts");
const learners = read("../src/components/LearnersPage.tsx");
const studio = read("../src/components/ContentStudio.tsx");
const manageAccount = read("../supabase/functions/manage-learner-account/index.ts");

test("Monitor uses the shared five-stage Eswatini education pathway", () => {
  for (const stage of ["Primary", "Secondary High", "High School", "Matric", "Tertiary"]) {
    assert.ok(pathways.includes('"'+stage+'"') || pathways.includes(stage + ":"));
  }
  assert.match(pathways, /Grades 0–7/);
  assert.match(pathways, /Forms 1–3/);
  assert.match(pathways, /Forms 4–5/);
  assert.match(pathways, /Form 6/);
  assert.match(pathways, /Bachelor's Degree/);
  assert.match(pathways, /Master's Degree/);
  assert.match(pathways, /Doctorate \/ PhD/);
  assert.match(pathways, /Grade 0/);
  assert.match(pathways, /Form 1.*Form 2.*Form 3/s);
  assert.match(pathways, /Form 4.*Form 5/s);
  assert.match(pathways, /Year 1/);
});

test("Monitor learner profile editing preserves all five stages and tertiary details", () => {
  assert.match(learners, /EDUCATION_STAGES\.map/);
  assert.match(learners, /education_level: EDUCATION_STAGES\.includes/);
  assert.match(learners, /education_level: profileForm\.education_level/);
  assert.match(learners, /institution_type: isTertiaryStage/);
  assert.match(learners, /qualification_level: isTertiaryStage/);
  assert.match(learners, /TERTIARY_INSTITUTION_TYPES\.map/);
  assert.match(learners, /TERTIARY_QUALIFICATIONS\.map/);
  assert.doesNotMatch(learners, /value="Secondary High" disabled/);
  assert.doesNotMatch(learners, /education_level: "Secondary High",\s*grade: learner\.grade/);
});

test("Content Studio filters registered learners by the same pathway stages", () => {
  assert.match(studio, /const learnerLevels=EDUCATION_STAGES/);
  assert.match(studio, /const isTertiaryLevel=isTertiaryStage\(level\)/);
  assert.match(studio, /institutionTypeFilter/);
  assert.match(studio, /qualificationFilter/);
  assert.match(studio, /standardGrades=gradeOptionsFor\(level\)/);
  assert.match(studio, /TERTIARY_INSTITUTION_TYPES\.map/);
  assert.match(studio, /TERTIARY_QUALIFICATIONS\.map/);
  assert.match(studio, /Year \/ semester/);
  assert.match(studio, /All active learners/);
  assert.doesNotMatch(studio, /standardEducationLevels/);
  assert.doesNotMatch(studio, /level==='College'\|\|level==='University'/);
  assert.doesNotMatch(studio, /All learners \(Secondary High\)/);
});

test("the administrator account endpoint validates and persists tertiary profile fields", () => {
  assert.match(manageAccount, /institution_type: 60/);
  assert.match(manageAccount, /qualification_level: 80/);
  assert.match(manageAccount, /TERTIARY_INSTITUTION_TYPES\.includes/);
  assert.match(manageAccount, /TERTIARY_QUALIFICATIONS\.includes/);
  assert.match(manageAccount, /education_level,institution_type,qualification_level/);
});

test("the applied education-pathway migration is represented in source control", () => {
  const migration = read("../supabase/migrations/20261115200243_studyspace_education_pathways.sql");
  assert.match(migration, /drop trigger if exists enforce_studyspace_learner_education_level/i);
  assert.match(migration, /drop constraint if exists profiles_learner_education_level_check/i);
  assert.match(migration, /profiles_learner_education_level_check[\s\S]*Primary[\s\S]*Secondary High[\s\S]*High School[\s\S]*Matric[\s\S]*Tertiary/);
});

test("both learner profile RPC signatures persist and validate every pathway field", () => {
  const migration = read("../supabase/migrations/20261116120000_studyspace_restore_education_pathways.sql");
  assert.match(migration, /p_course text/);
  assert.match(migration, /full_name = left\(coalesce\(p_full_name/);
  assert.match(migration, /course = left\(coalesce\(p_course/);
  assert.match(migration, /Choose a valid Study Space education pathway/);
  assert.match(migration, /create or replace function public\.update_studyspace_learner_profile\([\s\S]*?p_academic_year text,\s*p_course text/);
  assert.match(migration, /create or replace function public\.update_studyspace_learner_profile\([\s\S]*?p_course text\s*\)/);
  assert.match(learners, /education_level: ""/);
  assert.doesNotMatch(learners, /education_level: "Secondary High",\s*institution_type:/);
});
