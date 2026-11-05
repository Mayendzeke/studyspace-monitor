import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPublishableKey, getSecretKey } from "../_shared/supabase-keys.ts";
import { getTokenAssuranceLevel } from "../_shared/jwt-assurance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
  "Cache-Control": "no-store",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function pinDigest(value: string, pepper: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const allowedOrigin = Deno.env.get("APP_ORIGIN");
  const requestOrigin = request.headers.get("Origin");
  if (!allowedOrigin || !requestOrigin || requestOrigin !== allowedOrigin) return json(403, { error: "This application origin is not allowed." });

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = getPublishableKey();
  const serviceKey = getSecretKey();
  const pinPepper = Deno.env.get("PIN_PEPPER");
  if (!accessToken || !url || !anonKey || !serviceKey || !pinPepper) return json(500, { error: "Function configuration is incomplete." });

  const caller = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser(accessToken);
  if (authError || !authData.user) return json(401, { error: "Sign in is required." });
  if (getTokenAssuranceLevel(accessToken) !== "aal2") return json(403, { error: "Administrator multi-factor authentication is required." });

  const { data: profile, error: profileError } = await caller.from("profiles").select("role,account_status").eq("id", authData.user.id).single();
  if (profileError || profile?.role !== "admin" || profile?.account_status !== "active") return json(403, { error: "Active administrator access is required." });

  let body: { expiresInDays?: number };
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const days = Number(body.expiresInDays ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 30) return json(400, { error: "Expiry must be between 1 and 30 days." });

  const pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000000).padStart(8, "0");
  const studentId = "STU-" + Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => (byte % 36).toString(36)).join("").toUpperCase();
  const pinHash = await pinDigest(pin, pinPepper);
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error: insertError } = await admin.from("enrolment_pins").insert({
    pin_hash: pinHash,
    student_id: studentId,
    created_by: authData.user.id,
    expires_at: expiresAt,
  });
  if (insertError) return json(500, { error: "Could not create the enrolment PIN." });

  await admin.from("audit_events").insert({
    actor_id: authData.user.id,
    event_type: "enrolment_pin_created",
    target_type: "enrolment_pin",
    details: { expires_at: expiresAt },
  });

  return json(200, { pin, studentId, expiresAt, message: "Copy the student ID and one-time PIN now. The PIN will not be shown again." });
});
