import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const enrolment = read("supabase/functions/enrol-learner/index.ts");
const guardianConsent = read("supabase/functions/guardian-consent/index.ts");
const guardianAdmin = read("supabase/functions/manage-guardian-verification/index.ts");
const guardianUi = read("src/components/GuardianVerificationPage.tsx");
const subscriptions = read("src/components/SubscriptionsPage.tsx");
const migration = read("supabase/migrations/20261124140242_studyspace_48_hour_trial_and_terms_v9.sql");

test("new Monitor enrolments receive a 48-hour trial and terms v9", () => {
  assert.match(enrolment, /TERMS_VERSION = "2026-11-24-v9"/);
  assert.match(enrolment, /trialHours: 48/);
  assert.match(enrolment, /48-hour free trial has started/);
});

test("in-person and guardian-link consent use the same current terms version", () => {
  assert.match(guardianUi, /TERMS_VERSION = "2026-11-24-v9"/);
  assert.match(guardianAdmin, /2026-11-24-v9/);
  assert.match(guardianConsent, /2026-11-24-v9/);
});

test("Monitor subscription register labels the current trial correctly", () => {
  assert.match(subscriptions, /48-hour Free Trial/);
});

test("database migration aligns activation, consent and guardian approval", () => {
  assert.match(migration, /2026-11-24-v9/);
  assert.match(migration, /2026-11-07-v3/);
  assert.match(migration, /interval ''48 hours''/);
  assert.match(migration, /terms_version in \(''2026-11-09-v8'', ''2026-11-24-v9''\)/);
});

test("existing trial expiry timestamps are preserved and reminders follow actual expiry", () => {
  assert.match(migration, /trial_expires_at - interval ''24 hours''/);
  assert.doesNotMatch(migration, /UPDATE public\.profiles\s+SET trial_expires_at/i);
});

test("assessment scheduler uses the learner's configurable question count and keeps AI questions unverified", () => {
  const scheduler = read("supabase/functions/assessment-scheduler/index.ts");
  const helper = read("supabase/functions/assessment-scheduler/scheduler.ts");
  assert.match(scheduler, /2026-11-24-v9/);
  assert.match(scheduler, /question_count/);
  assert.match(scheduler, /questionCount=Math\.max\(1,Math\.min\(100,Number\(prefs\.question_count\)\|\|10\)\)/);
  assert.match(scheduler, /verification_status:"pending"/);
  assert.match(helper, /questionCount=10/);
});

test("late assessment submissions remain allowed and are recorded", () => {
  const submit = read("supabase/functions/submit-exercise-attempt/index.ts");
  assert.match(submit, /submitted_late/);
  assert.match(submit, /minutesLate/);
  assert.match(submit, /2026-11-24-v9/);
});

test("submitting an assessment updates its central programme item", () => {
  const submit = read("supabase/functions/submit-exercise-attempt/index.ts");
  assert.match(submit, /assessment_schedule_items/);
  assert.match(submit, /update\(\{ status: "completed" \}\)/);
});

test("central scheduler creates monthly and quarterly assessment periods", () => {
  const scheduler = read("supabase/functions/assessment-scheduler/index.ts");
  const helper = read("supabase/functions/assessment-scheduler/scheduler.ts");
  assert.match(scheduler, /persistPeriod\("monthly"/);
  assert.match(scheduler, /persistPeriod\("quarterly"/);
  assert.match(scheduler, /assessment_type:assessmentType/);
  assert.match(scheduler, /hasMore/);
  assert.match(helper, /expandPeriodWindows/);
  assert.match(helper, /slot\.date\|\|slot\.day/);
});

test("MIΛ keeps model and provider identities out of learner-facing responses", () => {
  const mia = read("supabase/functions/mia-assistant/index.ts");
  assert.match(mia, /CURRENT_TERMS_VERSION = "2026-11-24-v9"/);
  assert.match(mia, /return json\(200, \{ success: true, conversationId, reply, timetableDraft, sources:[\s\S]*?memoryUpdated \}\)/);
  const response = mia.slice(mia.lastIndexOf("return json(200, { success: true, conversationId"));
  assert.doesNotMatch(response, /provider|model|fallbackUsed/i);
  assert.match(mia, /usage_status"\) return json\(200, \{ success: true, quotaManagedByProvider: true \}\)/);
});

test("private study material engine uses the shared learner AI provider and hides it from students", () => {
  const engine = read("supabase/functions/study-material-engine/index.ts");
  const sharedProvider = read("supabase/functions/_shared/ai-provider.ts");
  assert.match(engine, /CURRENT_TERMS_VERSION = "2026-11-24-v9"/);
  assert.match(engine, /from "\.\.\/_shared\/ai-provider\.ts"/);
  assert.match(engine, /learner_study_packs/);
  assert.match(engine, /source_text:extractedText/);
  assert.match(sharedProvider, /GEMMA_MODEL/);
  assert.match(sharedProvider, /SECONDARY_MODEL/);
  const response = engine.slice(engine.lastIndexOf('return json(200,{success:true,status:"ready"'));
  assert.match(response, /return json\(200,\{success:true,status:"ready",packId,sourceHash,content:pack\}\)/);
  assert.doesNotMatch(response, /provider|model|fallbackUsed/i);
});

test("curriculum material generation uses Monitor research and literature review before publication", () => {
  const monitorEngine = read("supabase/functions/mia-monitor-assistant/index.ts");
  assert.match(monitorEngine, /action === "prepare_material"/);
  assert.match(monitorEngine, /literature_text_registry/);
  assert.match(monitorEngine, /source_references/);
  assert.match(monitorEngine, /research_status: "cross_referenced"/);
  assert.match(monitorEngine, /learning_material_review_queue/);
  assert.match(monitorEngine, /status: "pending"/);
});

test("scheduled and on-demand assessments are stored in the canonical exercise tables", () => {
  const scheduler = read("supabase/functions/assessment-scheduler/index.ts");
  const materialEngine = read("supabase/functions/study-material-engine/index.ts");
  assert.match(scheduler, /generateQuestions/);
  assert.match(scheduler, /request_practice/);
  assert.match(scheduler, /process_practice_requests/);
  assert.match(scheduler, /learner_practice_requests/);
  assert.match(scheduler, /assignment_type:"scheduled_assessment"/);
  assert.match(scheduler, /assignment_type:"practice"/);
  assert.match(scheduler, /from\("exercise_questions"\)/);
  assert.doesNotMatch(scheduler, /exercise_set_questions/);
  assert.match(materialEngine, /resumePracticeRequests/);
});
