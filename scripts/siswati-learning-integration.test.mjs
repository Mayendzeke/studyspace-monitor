import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const learnerAssistant = readFileSync("supabase/functions/mia-assistant/index.ts", "utf8");
const registrySeed = readFileSync("supabase/migrations/20261125132701_add_eceswa_2027_2029_literature_and_siswati_sources.sql", "utf8");
const literatureSeed = readFileSync("supabase/migrations/20261124152000_seed_eswatini_literature_registry.sql", "utf8");
const secondLanguageSeed = readFileSync("supabase/migrations/20261126235826_add_eceswa_egcse_siswati_second_language_2027_2029.sql", "utf8");

test("learner MIΛ loads SiSwati registry metadata only when relevant", () => {
  assert.ok(learnerAssistant.includes(String.raw`const requestsSiswati = /\b(?:siswati|si\s*swati)\b/i.test(siswatiSearchText);`));
  assert.ok(learnerAssistant.includes('admin.from("curriculum_reference_registry")'));
  assert.ok(learnerAssistant.includes('admin.from("literature_text_registry")'));
  assert.ok(learnerAssistant.includes('eq("verified_status", "verified")'));
  assert.ok(learnerAssistant.includes('if (requestsSiswati)'));
});

test("learner MIΛ distinguishes verified syllabus references from publisher-reported books", () => {
  assert.ok(learnerAssistant.includes("VERIFIED ECESWA REFERENCE"));
  assert.ok(learnerAssistant.includes("PUBLISHER-REPORTED, NOT ECESWA-PRESCRIBED"));
  assert.ok(learnerAssistant.includes("never claim to have read a PDF"));
  assert.ok(learnerAssistant.includes("Do not invent translations, idioms, proverbs, grammar rules"));
  assert.ok(literatureSeed.includes("'publisher_reported'"));
  assert.ok(literatureSeed.includes("not ECESWA confirmation of a prescribed set text"));
});

test("official ECESWA First Language SiSwati source is registered for 2027–2029", () => {
  assert.ok(registrySeed.includes("First Language SiSwati"));
  assert.ok(registrySeed.includes("EGCSE First Language SiSwati Syllabus — 2027–2029"));
  assert.ok(registrySeed.includes("6870"));
  assert.ok(registrySeed.includes("verified"));
});

test("learner personal-data separation remains explicit in MIΛ context", () => {
  assert.ok(learnerAssistant.includes("No learner name, account identifier or date of birth is sent to the AI provider."));
  assert.ok(learnerAssistant.includes("Student identifiers are not included in the model context."));
});

test("official ECESWA SiSwati as a Second Language syllabus is registered", () => {
  assert.ok(secondLanguageSeed.includes("SiSwati as a Second Language"));
  assert.ok(secondLanguageSeed.includes("2027–2029"));
  assert.ok(secondLanguageSeed.includes("6871"));
  assert.ok(secondLanguageSeed.includes("verified"));
});

test("SiSwati Second Language 6871 exposes its verified 2027–2029 assessment structure to MIΛ", () => {
  const enrichment = readFileSync("supabase/migrations/20261127014500_enrich_eceswa_siswati_second_language_assessment_context.sql", "utf8");
  assert.ok(enrichment.includes("Reading and Directed Writing"));
  assert.ok(enrichment.includes("2 hours 15 minutes"));
  assert.ok(enrichment.includes("50%"));
  assert.ok(enrichment.includes("Listening"));
  assert.ok(enrichment.includes("25%"));
  assert.ok(enrichment.includes("Speaking"));
  assert.ok(enrichment.includes("all_papers_compulsory"));
});

test("learner MIΛ includes the full verified syllabus note within its bounded context", () => {
  assert.ok(learnerAssistant.includes('String(item.notes || "").slice(0, 1200)'));
});
