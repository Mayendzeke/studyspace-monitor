import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function getNamedKey(variable: string): string | undefined {
  const raw = Deno.env.get(variable);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    const value = parsed?.default;
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
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
function json(status: number, body: Record<string, unknown>) { return new Response(JSON.stringify(body), { status, headers }); }
async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const origin = request.headers.get("Origin");
  if (!allowedOrigin || !origin || origin !== allowedOrigin) return json(403, { error: "This application origin is not allowed." });
  const url = Deno.env.get("SUPABASE_URL"), anonKey = getPublishableKey();
  const serviceKey = getSecretKey(), ratePepper = Deno.env.get("AUTH_RATE_LIMIT_PEPPER");
  if (!url || !anonKey || !serviceKey || !ratePepper) return json(500, { error: "Student sign-in service configuration is incomplete." });
  let body: { studentId?: string; password?: string };
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const studentId = String(body.studentId ?? "").trim().toUpperCase();
  const password = String(body.password ?? "");
  if (!/^STU-[A-Z0-9]{8}$/.test(studentId) || !password || password.length > 128) return json(400, { error: "Student ID or password is incorrect." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const source = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identifierHash = await digest(ratePepper + ":" + studentId);
  const sourceHash = await digest(ratePepper + ":" + source);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [byId, bySource] = await Promise.all([
    admin.from("student_auth_attempts").select("id", { count: "exact", head: true }).eq("identifier_hash", identifierHash).eq("action", "signin").gte("attempted_at", since),
    admin.from("student_auth_attempts").select("id", { count: "exact", head: true }).eq("source_hash", sourceHash).eq("action", "signin").gte("attempted_at", since),
  ]);
  if (byId.error || bySource.error) return json(503, { error: "Sign-in protection is temporarily unavailable." });
  if ((byId.count ?? 0) >= 8 || (bySource.count ?? 0) >= 20) return json(429, { error: "Too many sign-in attempts. Wait 15 minutes and try again." });

  const { data: profile } = await admin.from("profiles").select("id,role,account_status,subscription_tier,subscription_expires_at").eq("student_id", studentId).maybeSingle();
  if (profile?.role === "learner" && profile.account_status === "active" && profile.subscription_expires_at && new Date(profile.subscription_expires_at).getTime() <= Date.now()) {
    await admin.from("student_auth_attempts").insert({ identifier_hash: identifierHash, source_hash: sourceHash, action: "signin", was_successful: false });
    return json(403, { error: "Your " + (profile.subscription_tier || "Studyspace") + " access has expired. Please contact your administrator to renew your account. Your saved work is still safe.", subscription_expired: true });
  }
  if (!profile || profile.role !== "learner" || profile.account_status !== "active") {
    await admin.from("student_auth_attempts").insert({ identifier_hash: identifierHash, source_hash: sourceHash, action: "signin", was_successful: false });
    return json(401, { error: "Student ID or password is incorrect." });
  }
  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = studentId.toLowerCase() + "@students.studyspace.invalid";
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session || data.user.id !== profile.id) {
    await admin.from("student_auth_attempts").insert({ identifier_hash: identifierHash, source_hash: sourceHash, action: "signin", was_successful: false });
    return json(401, { error: "Student ID or password is incorrect." });
  }
  await admin.from("student_auth_attempts").insert({ identifier_hash: identifierHash, source_hash: sourceHash, action: "signin", was_successful: true });
  return json(200, {
    success: true,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    token_type: data.session.token_type,
  });
});
