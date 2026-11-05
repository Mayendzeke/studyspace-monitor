import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPublishableKey, getSecretKey } from "../_shared/supabase-keys.ts";
import { getTokenAssuranceLevel } from "../_shared/jwt-assurance.ts";
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
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = getPublishableKey();
  const serviceKey = getSecretKey();
  if (!accessToken || !url || !anonKey || !serviceKey) return json(500, { error: "Function configuration is incomplete." });
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization! } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser(accessToken);
  if (authError || !authData.user) return json(401, { error: "Sign in is required." });
  if (getTokenAssuranceLevel(accessToken) !== "aal2") return json(403, { error: "Administrator multi-factor authentication is required." });
  const { data: profile, error: profileError } = await caller.from("profiles").select("role,account_status").eq("id", authData.user.id).single();
  if (profileError || profile?.role !== "admin" || profile?.account_status !== "active") return json(403, { error: "Active administrator access is required." });
  let body: { pinId?: string };
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const pinId = String(body.pinId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(pinId)) return json(400, { error: "A valid enrolment record is required." });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: pin, error: pinError } = await admin.from("enrolment_pins").select("id,redeemed_at,revoked_at,expires_at").eq("id", pinId).single();
  if (pinError || !pin) return json(404, { error: "Enrolment record not found." });
  if (pin.redeemed_at) return json(409, { error: "A redeemed PIN cannot be revoked. Disable the learner account instead." });
  if (pin.revoked_at) return json(409, { error: "This PIN has already been revoked." });
  const { error } = await admin.from("enrolment_pins").update({ revoked_at: new Date().toISOString() }).eq("id", pinId).is("redeemed_at", null).is("revoked_at", null);
  if (error) return json(500, { error: "The enrolment PIN could not be revoked." });
  await admin.from("audit_events").insert({ actor_id: authData.user.id, event_type: "enrolment_pin_revoked", target_type: "enrolment_pin", target_id: pinId });
  return json(200, { success: true, message: "Unused enrolment PIN revoked." });
});
