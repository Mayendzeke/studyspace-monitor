import test from "node:test";
import assert from "node:assert/strict";
import { validateAssessmentEvidenceQuestions } from "../supabase/functions/assessment-scheduler/question-evidence.js";

const notes = "Chapter 2: Linear equations. A linear equation is an equation whose highest power of the variable is one. To solve it, isolate the variable by performing the same operation on both sides.";

test("accepts exact supporting text with formatting differences", () => {
  const result = validateAssessmentEvidenceQuestions([{
    question_type: "short_answer",
    prompt: "What is the highest power in a linear equation?",
    answer: "One",
    source_evidence: "A linear equation is an equation whose highest power of the variable is one",
    source_reference: "Chapter 2: Linear equations",
  }], notes, 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].source_reference, "Chapter 2: Linear equations");
});

test("rejects a question whose evidence is not in the approved notes", () => {
  assert.throws(() => validateAssessmentEvidenceQuestions([{
    question_type: "short_answer",
    prompt: "What is the quadratic formula?",
    answer: "…",
    source_evidence: "The quadratic formula solves second degree equations using a discriminant",
    source_reference: "Chapter 8",
  }], notes, 1), /could not be matched/);
});

test("rejects missing evidence and wrong question counts", () => {
  assert.throws(() => validateAssessmentEvidenceQuestions([{
    prompt: "Define a linear equation.",
    answer: "…",
    source_reference: "Chapter 2",
  }], notes, 1), /could not be matched/);
  assert.throws(() => validateAssessmentEvidenceQuestions([], notes, 1), /exactly the requested number/);
});
