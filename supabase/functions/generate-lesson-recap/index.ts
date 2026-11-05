import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const origin = request.headers.get("Origin");
  if (!allowedOrigin || !origin || origin !== allowedOrigin) return json(403, { error: "This application origin is not allowed." });

  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash";
  if (!authorization || !url || !anonKey || !serviceKey) return json(500, { error: "Supabase function configuration is incomplete." });
  if (!apiKey) return json(503, { error: "The AI provider is not configured yet. Add GEMINI_API_KEY to Supabase Edge Function secrets." });

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json(401, { error: "Sign in is required." });
  const { data: assurance, error: assuranceError } = await caller.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance.currentLevel !== "aal2") return json(403, { error: "Administrator multi-factor authentication is required." });
  const { data: profile, error: profileError } = await caller.from("profiles").select("role,account_status").eq("id", authData.user.id).single();
  if (profileError || profile?.role !== "admin" || profile?.account_status !== "active") return json(403, { error: "Active administrator access is required." });

  let body: { title?: string; subject?: string; level?: string; grade?: string; curriculum?: string; objectives?: string; sourceNotes?: string };
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const title = String(body.title ?? "").trim().slice(0, 160);
  const subject = String(body.subject ?? "").trim().slice(0, 100);
  const level = String(body.level ?? "").trim().slice(0, 60);
  const grade = String(body.grade ?? "").trim().slice(0, 60);
  const curriculum = String(body.curriculum ?? "").trim().slice(0, 100);
  const objectives = String(body.objectives ?? "").trim().slice(0, 2500);
  const sourceNotes = String(body.sourceNotes ?? "").trim().slice(0, 14000);
  if (!title || !subject || (!objectives && !sourceNotes)) return json(400, { error: "Provide a lesson title, subject and objectives or source material." });
  if (sourceNotes.length + objectives.length > 15000) return json(413, { error: "Lesson material is too long. Keep the combined source below 15,000 characters." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin.from("ai_generation_usage")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", authData.user.id).gte("created_at", since);
  if (countError) return json(503, { error: "AI usage limits could not be checked. Try again later." });
  if ((count ?? 0) >= 20) return json(429, { error: "Daily AI limit reached for this administrator. Try again after 24 hours." });

  const prompt = [
    "You are a careful teaching assistant. Create concise, age-appropriate lesson notes using only the supplied lesson information.",
    "Do not invent facts, curriculum requirements, quotations, examples or answers. If source material is insufficient, state that clearly in the summary.",
    "Do not include student names or personal data. Return only valid JSON with keys: summary (2-4 short sentences), keyPoints (3-5 concise strings), workedExample (short string; empty if not relevant), exitQuestion (one short understanding-check question).",
    "Keep the tone clear, encouraging and not childish. Avoid long paragraphs.",
    "LESSON TITLE: " + title,
    "SUBJECT: " + subject,
    "LEVEL: " + level,
    "GRADE: " + grade,
    "CURRICULUM: " + curriculum,
    "OBJECTIVES: " + objectives,
    "TEACHER SOURCE MATERIAL: " + sourceNotes,
  ].join("\n\n");

  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return json(502, { error: "The AI provider could not be reached. No lesson recap was generated." });
  }
  if (!response.ok) return json(response.status === 429 ? 429 : 502, { error: "The AI provider did not complete the request. Check provider limits and configuration." });
  const payload = await response.json();
  const generated = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!generated) return json(502, { error: "The AI provider returned an empty response." });
  let recap: { summary?: string; keyPoints?: string[]; workedExample?: string; exitQuestion?: string };
  try { recap = JSON.parse(generated); } catch { return json(502, { error: "The AI provider returned an invalid recap format." }); }
  if (typeof recap.summary !== "string" || !Array.isArray(recap.keyPoints) || recap.keyPoints.length < 1) return json(502, { error: "The generated recap did not pass validation." });
  recap = {
    summary: recap.summary.slice(0, 1400),
    keyPoints: recap.keyPoints.filter((point): point is string => typeof point === "string").slice(0, 5).map(point => point.slice(0, 240)),
    workedExample: typeof recap.workedExample === "string" ? recap.workedExample.slice(0, 1800) : "",
    exitQuestion: typeof recap.exitQuestion === "string" ? recap.exitQuestion.slice(0, 400) : "",
  };

  await admin.from("ai_generation_usage").insert({
    actor_id: authData.user.id, provider: "gemini", purpose: "lesson_recap",
    input_characters: prompt.length,
    output_characters: JSON.stringify(recap).length,
  });
  return json(200, { success: true, provider: "gemini", model, recap });
});
