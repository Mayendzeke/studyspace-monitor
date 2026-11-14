import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { markWithCloudflare } from "./provider.ts";

function getNamedKey(variable: string): string | undefined {
  const raw = Deno.env.get(variable);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    const value = parsed?.default;
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch { return undefined; }
}
function getPublishableKey(): string {
  return getNamedKey("SUPABASE_PUBLISHABLE_KEYS") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}
function getSecretKey(): string {
  return getNamedKey("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
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
function clampMark(value: unknown, max: number): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > max) return null;
  return Math.round(numeric * 100) / 100;
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
  const { data: profile, error: profileError } = await caller.from("profiles")
    .select("role,account_status,subscription_tier,subscription_expires_at,trial_started_at,trial_expires_at,terms_accepted_at,terms_version")
    .eq("id", authData.user.id).single();
  if (profileError || profile?.role !== "learner" || profile?.account_status !== "active") {
    return json(403, { error: "An active learner account is required." });
  }
  const now = Date.now();
  const paidExpiry = profile.subscription_expires_at ? Date.parse(profile.subscription_expires_at) : NaN;
  const trialStart = profile.trial_started_at ? Date.parse(profile.trial_started_at) : NaN;
  const trialExpiry = profile.trial_expires_at ? Date.parse(profile.trial_expires_at) : NaN;
  const hasPaidAccess = Boolean(profile.subscription_tier && Number.isFinite(paidExpiry) && paidExpiry > now);
  const hasTrialAccess = Boolean(!profile.subscription_tier && Number.isFinite(trialStart)
    && Number.isFinite(trialExpiry) && trialStart <= now && trialExpiry > now);
  const hasAcceptedTerms = Boolean(profile.terms_accepted_at && profile.terms_version === "2026-11-09-v8");
  if (!hasAcceptedTerms) return json(403, { error: "Please accept the current StudySpace Terms and Conditions before submitting assessments." });
  if (!hasPaidAccess && !hasTrialAccess) return json(403, { error: "Your StudySpace access is paused. Choose a paid plan to continue." });

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
    .select("id,question_type,points,prompt,content,explanation,topic").eq("exercise_set_id", set.id).order("position");
  if (questionError || !questions?.length) return json(503, { error: "Assessment marking data is unavailable. Try again later." });
  const questionIds = questions.map(question => question.id);
  const { data: keys, error: keyError } = await admin.from("exercise_answer_keys")
    .select("question_id,answer_key").in("question_id", questionIds);
  if (keyError) return json(503, { error: "Assessment marking data is unavailable. Try again later." });
  const keyMap = new Map((keys ?? []).map(row => [row.question_id, row.answer_key as Record<string, unknown>]));

  const written = questions.filter(question => question.question_type === "short_answer" && normalize(answers[question.id]).length > 0);
  const aiMarks = new Map<string, { awarded: number; confidence: number; feedback: string }>();
  let aiMarkingFailure = "";
  if (written.length > 0 && written.length <= 20) {
    const markingQuestions = written.map(question => {
      const key = keyMap.get(question.id) ?? {};
      return {
        question_id: question.id,
        question: String(question.prompt || "").slice(0, 1500),
        learner_answer: String(answers[question.id] ?? "").slice(0, 5000),
        marking_guide: String(key.markingGuide || key.explanation || question.explanation || "").slice(0, 2500),
        maximum_marks: Number(question.points || 1),
        topic: String(question.topic || "").slice(0, 120),
      };
    });
    try {
      const generated = await markWithCloudflare([
        {
          role: "system",
          content: [
            "You are MIΛ, a careful educational assessment marker for StudySpace.",
            "Mark only the written learner responses against the supplied question, teacher marking guide and maximum marks.",
            "Award fair partial credit for correct reasoning and relevant knowledge. Do not invent expected facts or penalise valid equivalent wording.",
            "If the response is unclear, the rubric is insufficient, or the answer cannot be judged fairly, return confidence below 0.75.",
            "Return JSON only with this exact top-level shape: { marks: [{ question_id: string, points_awarded: number, confidence: number, feedback: string }] }.",
            "Each question_id must match an input question. points_awarded must be between zero and maximum_marks. confidence must be between zero and one. Feedback must be brief, educational and specific.",
            "Do not include learner names, identifiers, personal information, provider details or extra keys.",
          ].join(" "),
        },
        { role: "user", content: JSON.stringify({ questions: markingQuestions }) },
      ]);
      const payload = JSON.parse(generated.text) as { marks?: unknown[] };
      if (!Array.isArray(payload.marks)) throw new Error("The marking response did not contain a marks array.");
      const known = new Map(written.map(question => [question.id, question]));
      for (const item of payload.marks) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const id = String(record.question_id || "");
        const question = known.get(id);
        if (!question || aiMarks.has(id)) continue;
        const max = Number(question.points || 1);
        const awarded = clampMark(record.points_awarded, max);
        const confidence = Number(record.confidence);
        if (awarded === null || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) continue;
        aiMarks.set(id, {
          awarded,
          confidence,
          feedback: String(record.feedback || "").trim().slice(0, 1200),
        });
      }
    } catch (error) {
      aiMarkingFailure = error instanceof Error ? error.message.slice(0, 240) : "MIΛ could not complete written marking.";
    }
  } else if (written.length > 20) {
    aiMarkingFailure = "This assessment has more than 20 written answers; teacher review is required.";
  }

  let score = 0;
  let totalPoints = 0;
  let manualReview = 0;
  let aiMarkedCount = 0;
  const results: Record<string, {
    correct: boolean | null; points: number; awarded: number; explanation: string;
    markingMethod: "objective" | "miλ" | "teacher_review";
    confidence?: number; status: "marked" | "teacher_review" | "no_answer";
  }> = {};
  const markingDetails: Record<string, Record<string, unknown>> = {};
  for (const question of questions) {
    const points = Number(question.points || 1);
    totalPoints += points;
    const key = keyMap.get(question.id) ?? {};
    const submitted = answers[question.id];
    const answerText = normalize(submitted);
    let correct: boolean | null = false;
    let awarded = 0;
    let explanation = String(key.explanation || question.explanation || "").slice(0, 1500);
    let markingMethod: "objective" | "miλ" | "teacher_review" = "objective";
    let status: "marked" | "teacher_review" | "no_answer" = answerText ? "marked" : "no_answer";
    if (question.question_type === "short_answer") {
      if (!answerText) {
        correct = false;
        explanation = "No written answer was submitted.";
        markingDetails[question.id] = { method: "not_answered", awarded: 0, maximum: points, feedback: explanation };
      } else {
        const mark = aiMarks.get(question.id);
        if (mark && mark.confidence >= 0.75) {
          awarded = mark.awarded;
          score += awarded;
          aiMarkedCount++;
          correct = awarded >= points ? true : awarded > 0 ? null : false;
          explanation = mark.feedback || explanation || "MIΛ marked this written response using the teacher's marking guide.";
          markingMethod = "miλ";
          markingDetails[question.id] = {
            method: "miλ", awarded, maximum: points, confidence: mark.confidence, feedback: explanation,
          };
        } else {
          manualReview++;
          correct = null;
          status = "teacher_review";
          markingMethod = "teacher_review";
          explanation = "This written response has been sent to your teacher for a final mark.";
          markingDetails[question.id] = {
            method: "teacher_review",
            ai_suggested_mark: mark?.awarded ?? null,
            confidence: mark?.confidence ?? null,
            feedback: mark?.feedback || aiMarkingFailure || "MIΛ could not confidently judge this response.",
            maximum: points,
          };
        }
      }
    } else if (question.question_type === "matching") {
      const expected = Array.isArray(key.pairs) ? key.pairs as {left:string;right:string}[] : [];
      const actual = submitted && typeof submitted === "object" && !Array.isArray(submitted) ? submitted as Record<string,unknown> : null;
      correct = Boolean(actual && expected.length > 0
        && expected.every(pair => normalize(actual[pair.left]) === normalize(pair.right))
        && Object.keys(actual).length === expected.length);
      awarded = correct ? points : 0;
      score += awarded;
      markingDetails[question.id] = { method: "objective", awarded, maximum: points };
    } else {
      const acceptedAnswers = Array.isArray(key.acceptedAnswers) ? key.acceptedAnswers : [];
      const accepted = [key.answer, ...acceptedAnswers].map(normalize).filter(Boolean);
      correct = accepted.includes(answerText);
      awarded = correct ? points : 0;
      score += awarded;
      markingDetails[question.id] = { method: "objective", awarded, maximum: points };
    }
    if (question.question_type === "short_answer" && answerText && aiMarks.has(question.id) && aiMarks.get(question.id)!.confidence < 0.75) {
      markingDetails[question.id].confidence = aiMarks.get(question.id)!.confidence;
    }
    results[question.id] = {
      correct, points, awarded, explanation, markingMethod, status,
      ...(markingDetails[question.id].confidence === undefined ? {} : { confidence: Number(markingDetails[question.id].confidence) }),
    };
  }

  const markedAt = aiMarkedCount > 0 ? new Date().toISOString() : null;
  const markingStatus = manualReview > 0 ? "teacher_review" : aiMarkedCount > 0 ? "ai_marked" : "not_required";
  const { data: attempt, error: attemptError } = await admin.from("exercise_attempts").insert({
    assignment_id: assignment.id,
    learner_id: authData.user.id,
    answers,
    score,
    total_points: totalPoints,
    marking_status: markingStatus,
    marking_details: markingDetails,
    ai_marked_at: markedAt,
    teacher_review_required: manualReview > 0,
  }).select("id,submitted_at").single();
  if (attemptError) return json(503, { error: "Your answers could not be saved. Please try again." });

  return json(200, {
    success: true,
    attemptId: attempt.id,
    submittedAt: attempt.submitted_at,
    title: set.title,
    score,
    totalPoints,
    percentage: totalPoints > 0 ? Math.round(score / totalPoints * 10000) / 100 : 0,
    manualReview,
    aiMarked: aiMarkedCount,
    markingStatus,
    markingNotice: aiMarkingFailure,
    progressRecorded: true,
    results,
  });
});
