import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("APP_ORIGIN");
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin ?? "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const origin = request.headers.get("Origin");
  if (!allowedOrigin || !origin || origin !== allowedOrigin) return json(403, { error: "This application origin is not allowed." });

  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authorization || !url || !anonKey || !serviceKey) return json(500, { error: "Function configuration is incomplete." });

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json(401, { error: "Sign in is required." });
  const { data: assurance, error: assuranceError } = await caller.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance.currentLevel !== "aal2") return json(403, { error: "Administrator multi-factor authentication is required." });
  const { data: profile, error: profileError } = await caller.from("profiles").select("role,account_status").eq("id", authData.user.id).single();
  if (profileError || profile?.role !== "admin" || profile?.account_status !== "active") return json(403, { error: "Active administrator access is required." });

  let body: { learnerId?: string; action?: string };
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const learnerId = String(body.learnerId ?? "");
  const action = String(body.action ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(learnerId)) return json(400, { error: "A valid learner account ID is required." });
  if (!["disable", "enable", "reset_password"].includes(action)) return json(400, { error: "Unsupported account action." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: learner, error: learnerError } = await admin.from("profiles").select("id,role,account_status").eq("id", learnerId).single();
  if (learnerError || !learner || learner.role !== "learner") return json(404, { error: "Learner account not found." });

  if (action === "disable") {
    const { error } = await admin.auth.admin.updateUserById(learnerId, { ban_duration: "876000h" });
    if (error) return json(500, { error: "Supabase could not revoke this account's sessions." });
    const { error: updateError } = await admin.from("profiles").update({ account_status: "disabled", updated_at: new Date().toISOString() }).eq("id", learnerId);
    if (updateError) return json(500, { error: "The account was blocked in Auth, but its profile status needs reconciliation." });
    await admin.from("audit_events").insert({ actor_id: authData.user.id, event_type: "learner_account_disabled", target_type: "profile", target_id: learnerId });
    return json(200, { success: true, message: "Learner sign-in has been blocked and existing sessions revoked." });
  }

  if (action === "enable") {
    if (learner.account_status !== "disabled") return json(409, { error: "Only a disabled learner account can be re-enabled." });
    const { error } = await admin.auth.admin.updateUserById(learnerId, { ban_duration: "none" });
    if (error) return json(500, { error: "Supabase could not re-enable this account." });
    const { error: updateError } = await admin.from("profiles").update({ account_status: "active", updated_at: new Date().toISOString() }).eq("id", learnerId);
    if (updateError) return json(500, { error: "Auth was re-enabled, but the profile status needs reconciliation." });
    await admin.from("audit_events").insert({ actor_id: authData.user.id, event_type: "learner_account_enabled", target_type: "profile", target_id: learnerId });
    return json(200, { success: true, message: "Learner account re-enabled. A new sign-in is required." });
  }

  const temporaryPassword = Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, "0")).join("");
  const { error: passwordError } = await admin.auth.admin.updateUserById(learnerId, { password: temporaryPassword });
  if (passwordError) return json(500, { error: "Supabase could not rotate the learner password." });
  await admin.from("audit_events").insert({ actor_id: authData.user.id, event_type: "learner_password_reset_by_admin", target_type: "profile", target_id: learnerId });
  return json(200, { success: true, temporaryPassword, message: "A new temporary password was generated. Deliver it privately; it is shown only once." });
});
