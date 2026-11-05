import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPublishableKey, getSecretKey } from "../_shared/supabase-keys.ts";

const allowedOrigin = Deno.env.get("APP_ORIGIN");
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin ?? "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}
function normalize(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const origin = request.headers.get("Origin");
  if (!allowedOrigin || !origin || origin !== allowedOrigin) return json(403, { error: "This application origin is not allowed." });
  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = getPublishableKey();
  const secretKey = getSecretKey();
  if (!accessToken) return json(401, { error: "Sign in is required." });
  if (!url || !publishableKey || !secretKey) return json(500, { error: "Function configuration is incomplete." });

  const caller = createClient(url, publishableKey, { global: { headers: { Authorization: authorization! } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser(accessToken);
  if (authError || !authData.user) return json(401, { error: "Sign in is required." });
  const { data: profile, error: profileError } = await caller.from("profiles").select("role,account_status").eq("id", authData.user.id).single();
  if (profileError || profile?.role !== "learner" || profile?.account_status !== "active") return json(403, { error: "An active learner account is required." });

  let body: { assignmentId?: string; answers?: Record<string, unknown> };
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const assignmentId = String(body.assignmentId ?? "");
  const answers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers : null;
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId) || !answers) return json(400, { error: "A valid assignment and answer set are required." });
  if (Object.keys(answers).length > 100) return json(413, { error: "This submission contains too many answers." });

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });
  const { data: assignment, error: assignmentError } = await admin.from("exercise_assignments")
    .select("id,exercise_set_id,due_at,available_at").eq("id", assignmentId)
    .eq("learner_id", authData.user.id).maybeSingle();
  if (assignmentError || !assignment) return json(404, { error: "This assessment is not assigned to your account." });
  if (new Date(assignment.available_at).getTime() > Date.now()) return json(403, { error: "This assessment is scheduled and is not available yet." });
  if (assignment.due_at && new Date(assignment.due_at).getTime() < Date.now()) return json(403, { error: "The deadline for this assessment has passed. Your teacher can advise you on next steps." });
  const { data: set, error: setError } = await admin.from("exercise_sets")
    .select("id,title,is_published,question_count").eq("id", assignment.exercise_set_id).maybeSingle();
  if (setError || !set?.is_published) return json(404, { error: "This assessment is not currently available." });

  const { data: questions, error: questionError } = await admin.from("exercise_questions")
    .select("id,question_type,points,content").eq("exercise_set_id", set.id).order("position");
  if (questionError || !questions?.length) return json(503, { error: "Assessment marking data is unavailable. Try again later." });
  const questionIds = questions.map(question => question.id);
  const { data: keys, error: keyError } = await admin.from("exercise_answer_keys")
    .select("question_id,answer_key").in("question_id", questionIds);
  if (keyError) return json(503, { error: "Assessment marking data is unavailable. Try again later." });
  const keyMap = new Map((keys ?? []).map(row => [row.question_id, row.answer_key as Record<string, unknown>]));
  let score = 0;
  let totalPoints = 0;
  let manualReview = 0;
  const results: Record<string, { correct: boolean | null; points: number; awarded: number; explanation: string }> = {};
  for (const question of questions) {
    const points = Number(question.points || 1);
    totalPoints += points;
    const key = keyMap.get(question.id) ?? {};
    const submitted = answers[question.id];
    const correctAnswer = key.answer;
    const acceptedAnswers = Array.isArray(key.acceptedAnswers) ? key.acceptedAnswers : [];
    let correct: boolean | null = false;
    if (question.question_type === "short_answer") {
      correct = null;
      manualReview += 1;
    } else if (question.question_type === "matching") {
      const expected = Array.isArray(key.pairs) ? key.pairs as {left:string;right:string}[] : [];
      const actual = submitted && typeof submitted === "object" && !Array.isArray(submitted) ? submitted as Record<string,unknown> : null;
      correct = Boolean(actual && expected.length > 0
        && expected.every(pair => normalize(actual[pair.left]) === normalize(pair.right))
        && Object.keys(actual).length === expected.length);
    } else {
      const answer = normalize(submitted);
      const accepted = [correctAnswer, ...acceptedAnswers].map(normalize).filter(Boolean);
      correct = accepted.includes(answer);
    }
    const awarded = correct === true ? points : 0;
    score += awarded;
    results[question.id] = { correct, points, awarded, explanation: String(key.explanation || "") };
  }
  const { data: attempt, error: attemptError } = await admin.from("exercise_attempts").insert({
    assignment_id: assignment.id,
    learner_id: authData.user.id,
    answers,
    score,
    total_points: totalPoints,
  }).select("id,submitted_at").single();
  if (attemptError) return json(503, { error: "Your answers could not be saved. Please try again." });
  const { error: progressError } = await admin.from("progress_events").insert({
    learner_id: authData.user.id,
    event_type: "assigned_assessment",
    score,
    max_score: totalPoints,
    metadata: { assignment_id: assignment.id, exercise_set_id: set.id, attempt_id: attempt.id },
  });
  return json(200, {
    success: true,
    attemptId: attempt.id,
    submittedAt: attempt.submitted_at,
    title: set.title,
    score,
    totalPoints,
    percentage: totalPoints > 0 ? Math.round(score / totalPoints * 10000) / 100 : 0,
    manualReview,
    progressRecorded: !progressError,
    results,
  });
});
