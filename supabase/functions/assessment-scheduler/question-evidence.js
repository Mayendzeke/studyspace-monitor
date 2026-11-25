const normalize = (value) => String(value ?? "")
  .normalize("NFKC")
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

export function validateAssessmentEvidenceQuestions(questions, sourceNotes, expectedCount) {
  if (!Array.isArray(questions) || questions.length !== expectedCount) {
    throw new Error("The assessment must contain exactly the requested number of questions.");
  }
  const source = normalize(sourceNotes);
  if (source.length < 80) {
    throw new Error("The approved study material does not contain enough readable source text.");
  }
  return questions.map((question, index) => {
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      throw new Error("Question " + (index + 1) + " is not a valid question object.");
    }
    const evidence = String(question.source_evidence ?? "").trim();
    const reference = String(question.source_reference ?? "").trim();
    const excerpt = normalize(evidence);
    if (excerpt.length < 28 || !source.includes(excerpt)) {
      throw new Error("Question " + (index + 1) + " could not be matched to an exact excerpt in the approved study material. No unsupported assessment was published.");
    }
    if (!reference || reference.length > 240) {
      throw new Error("Question " + (index + 1) + " is missing a source title or section reference.");
    }
    return {
      ...question,
      source_evidence: evidence.slice(0, 700),
      source_reference: reference.slice(0, 240),
    };
  });
}
