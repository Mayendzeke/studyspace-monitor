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
function json(status: number, body: Record<string, unknown>) { return new Response(JSON.stringify(body), { status, headers }); }
async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
async function pinDigest(value: string, pepper: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("");
}
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const origin = request.headers.get("Origin");
  if (!allowedOrigin || !origin || origin !== allowedOrigin) return json(403, { error: "This application origin is not allowed." });
  const url = Deno.env.get("SUPABASE_URL"), anonKey = getPublishableKey();
  const serviceKey = getSecretKey();
  const pinPepper = Deno.env.get("PIN_PEPPER"), ratePepper = Deno.env.get("AUTH_RATE_LIMIT_PEPPER");
  if (!url || !anonKey || !serviceKey || !pinPepper || !ratePepper) return json(500, { error: "Enrolment service configuration is incomplete." });
  let body: { studentId?: string; pin?: string; password?: string; fullName?: string; preferredName?: string };
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const studentId = String(body.studentId ?? "").trim().toUpperCase();
  const pin = String(body.pin ?? "").replace(/\s+/g, "");
  const password = String(body.password ?? "");
  const fullName = String(body.fullName ?? "").trim().slice(0, 120);
  const preferredName = String(body.preferredName ?? "").trim().slice(0, 80);
  if (!/^STU-[A-Z0-9]{8}$/.test(studentId) || !/^\d{8}$/.test(pin)) return json(400, { error: "Check the Student ID and 8-digit enrolment PIN." });
  if (password.length < 10 || password.length > 128) return json(400, { error: "Choose a password between 10 and 128 characters." });
  if (!fullName || !preferredName) return json(400, { error: "Enter your name and the name you want your teacher to use." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const source = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identifierHash = await digest(ratePepper + ":" + studentId);
  const sourceHash = await digest(ratePepper + ":" + source);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [byId, bySource] = await Promise.all([
    admin.from("student_auth_attempts").select("id", { count: "exact", head: true }).eq("identifier_hash", identifierHash).eq("action", "enrol").gte("attempted_at", since),
    admin.from("student_auth_attempts").select("id", { count: "exact", head: true }).eq("source_hash", sourceHash).eq("action", "enrol").gte("attempted_at", since),
  ]);
  if (byId.error || bySource.error) return json(503, { error: "Enrolment protection is temporarily unavailable." });
  if ((byId.count ?? 0) >= 5 || (bySource.count ?? 0) >= 12) return json(429, { error: "Too many enrolment attempts. Wait 15 minutes and try again." });

  const pinHash = await pinDigest(pin, pinPepper);
  const { data: invitation, error: pinError } = await admin.from("enrolment_pins")
    .select("id,student_id,expires_at,redeemed_by,revoked_at")
    .eq("student_id", studentId).eq("pin_hash", pinHash)
    .is("redeemed_by", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (pinError || !invitation) {
    await admin.from("student_auth_attempts").insert({ identifier_hash: identifierHash, source_hash: sourceHash, action: "enrol", was_successful: false });
    return json(400, { error: "The Student ID or PIN is invalid, expired, revoked or already used." });
  }

  const email = studentId.toLowerCase() + "@students.studyspace.invalid";
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: fullName, preferred_name: preferredName, student_id: studentId },
  });
  if (createError || !created.user) {
    await admin.from("student_auth_attempts").insert({ identifier_hash: identifierHash, source_hash: sourceHash, action: "enrol", was_successful: false });
    return json(409, { error: "This invitation could not create an account. Contact your administrator if the Student ID has already been used." });
  }

  const { data: claimed, error: claimError } = await admin.from("enrolment_pins")
    .update({ redeemed_by: created.user.id, redeemed_at: new Date().toISOString() })
    .eq("id", invitation.id).is("redeemed_by", null).is("revoked_at", null)
    .gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
  if (claimError || !claimed) {
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from("student_auth_attempts").insert({ identifier_hash: identifierHash, source_hash: sourceHash, action: "enrol", was_successful: false });
    return json(409, { error: "This invitation has just been used or revoked. Ask your administrator for a new one." });
  }

  const { data: completedProfile, error: profileError } = await admin.from("profiles").update({
    student_id: studentId, account_status: "active", full_name: fullName, preferred_name: preferredName, updated_at: new Date().toISOString(),
  }).eq("id", created.user.id).select("id").single();
  if (profileError || !completedProfile) {
    await admin.from("enrolment_pins").update({ redeemed_by: null, redeemed_at: null }).eq("id", invitation.id);
    await admin.auth.admin.deleteUser(created.user.id);
    return json(500, { error: "The account was not completed. The invitation has been released; contact your administrator." });
  }
  await admin.from("student_auth_attempts").insert({ identifier_hash: identifierHash, source_hash: sourceHash, action: "enrol", was_successful: true });
  await admin.from("audit_events").insert({ actor_id: created.user.id, event_type: "learner_account_enrolled", target_type: "profile", target_id: created.user.id });
  return json(200, { success: true, studentId, message: "Account created. Sign in with your Student ID and password." });
});
