import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getNamedKey(variable: string): string | undefined {
  const raw = Deno.env.get(variable);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.default === "string" ? parsed.default : undefined;
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

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

async function pinDigest(value: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomPin(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 100000000;
  return String(value).padStart(8, "0");
}

const planDurations: Record<string, number> = {
  weekly: 7,
  two_weeks: 14,
  monthly: 28,
};

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  const origin = request.headers.get("Origin");
  if (!allowedOrigin || origin !== allowedOrigin) return json(403, { error: "This application origin is not allowed." });

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = getPublishableKey();
  const serviceKey = getSecretKey();
  const pinPepper = Deno.env.get("PIN_PEPPER");
  if (!accessToken || !url || !anonKey || !serviceKey || !pinPepper) {
    return json(500, { error: "Access PIN service configuration is incomplete." });
  }

  let body: { studentId?: string; planTier?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const studentId = String(body.studentId ?? "").trim().toUpperCase();
  const planTier = String(body.planTier ?? "").trim();
  const durationDays = planDurations[planTier];
  if (!/^STU-[A-Z0-9]{8}$/.test(studentId)) return json(400, { error: "Select a valid learner account." });
  if (!durationDays) return json(400, { error: "Choose a valid access plan." });

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization! } },
    auth: { persistSession: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(accessToken);
  if (authError || !authData.user) return json(401, { error: "Sign in is required." });

  const { data: assurance, error: assuranceError } = await caller.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
  if (assuranceError || assurance.currentLevel !== "aal2") {
    return json(403, { error: "Administrator multi-factor authentication is required." });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: actor, error: actorError } = await admin.from("profiles")
    .select("role,account_status")
    .eq("id", authData.user.id)
    .single();
  if (actorError || actor?.role !== "admin" || actor?.account_status !== "active") {
    return json(403, { error: "Active administrator access is required." });
  }

  const { data: learner, error: learnerError } = await admin.from("profiles")
    .select("id,student_id,full_name,preferred_name,account_status,subscription_tier,subscription_expires_at,trial_started_at,trial_expires_at")
    .eq("student_id", studentId)
    .eq("role", "learner")
    .maybeSingle();
  if (learnerError || !learner) return json(404, { error: "No learner account was found for that Student ID." });
  if (learner.account_status !== "active") return json(409, { error: "This learner account is not active. Resolve its verification or account status first." });

  const now = Date.now();
  const currentExpiry = learner.subscription_tier
    ? learner.subscription_expires_at
    : learner.trial_expires_at;
  if (currentExpiry && new Date(currentExpiry).getTime() > now) {
    return json(409, { error: "This learner still has active access. A renewal PIN can only be issued after their trial or plan expires." });
  }

  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const { error: revokeError } = await admin.from("student_access_pins")
    .update({ revoked_at: issuedAt })
    .eq("learner_id", learner.id)
    .is("redeemed_at", null)
    .is("revoked_at", null);
  if (revokeError) return json(503, { error: "The previous unused PIN could not be safely replaced. Please try again." });

  const pin = randomPin();
  const pinHash = await pinDigest(pin, pinPepper);
  const { error: insertError } = await admin.from("student_access_pins").insert({
    learner_id: learner.id,
    pin_hash: pinHash,
    plan_tier: planTier,
    duration_days: durationDays,
    expires_at: expiresAt,
    created_by: authData.user.id,
  });
  if (insertError) {
    console.error("Student access PIN creation failed:", insertError.message);
    return json(500, { error: "The access PIN could not be created. Please try again." });
  }

  const { error: auditError } = await admin.from("audit_events").insert({
    actor_id: authData.user.id,
    event_type: "student_access_pin_created",
    target_type: "student_access_pin",
    target_id: learner.id,
    details: { student_id: studentId, plan_tier: planTier, expires_at: expiresAt },
  });
  if (auditError) console.error("Access PIN audit event could not be recorded:", auditError.message);

  return json(200, {
    success: true,
    pin,
    studentId,
    planTier,
    durationDays,
    expiresAt,
    message: "Access PIN created. Copy it now; it is shown only once.",
  });
});
