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

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  if (!allowedOrigin || request.headers.get("Origin") !== allowedOrigin) {
    return json(403, { error: "This application origin is not allowed." });
  }

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = getPublishableKey();
  const serviceKey = getSecretKey();
  const pinPepper = Deno.env.get("PIN_PEPPER");
  if (!accessToken || !url || !anonKey || !serviceKey || !pinPepper) {
    return json(500, { error: "Access PIN service configuration is incomplete." });
  }

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization! } },
    auth: { persistSession: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(accessToken);
  if (authError || !authData.user) return json(401, { error: "Sign in is required." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: learner, error: profileError } = await admin.from("profiles")
    .select("role,account_status")
    .eq("id", authData.user.id)
    .single();
  if (profileError || learner?.role !== "learner" || learner?.account_status !== "active") {
    return json(403, { error: "An active learner account is required to redeem an access PIN." });
  }

  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error: rateError } = await admin.from("pin_redemption_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", authData.user.id)
    .gte("attempted_at", since);
  if (rateError) return json(503, { error: "Access PIN protection is temporarily unavailable. Please try again." });
  if ((count ?? 0) >= 5) return json(429, { error: "Too many PIN attempts. Try again in 15 minutes." });

  let body: { pin?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }
  const pin = String(body.pin ?? "").replace(/\s+/g, "");
  if (!/^\d{8}$/.test(pin)) {
    await admin.from("pin_redemption_attempts").insert({ user_id: authData.user.id, was_successful: false });
    return json(400, { error: "Enter the eight-digit access PIN." });
  }

  const pinHash = await pinDigest(pin, pinPepper);
  const { data, error: redemptionError } = await admin.rpc("redeem_studyspace_access_pin", {
    p_learner_id: authData.user.id,
    p_pin_hash: pinHash,
  });

  if (redemptionError) {
    await admin.from("pin_redemption_attempts").insert({ user_id: authData.user.id, was_successful: false });
    const activeAccess = /still has active access/i.test(redemptionError.message);
    if (activeAccess) return json(409, { error: "Your current access has not expired yet. You can redeem a renewal PIN after it ends." });
    if (/eligible for access renewal/i.test(redemptionError.message)) {
      return json(403, { error: "This account is not eligible to redeem an access PIN." });
    }
    return json(400, { error: "That PIN is invalid, expired, revoked, or has already been used." });
  }

  await admin.from("pin_redemption_attempts").insert({ user_id: authData.user.id, was_successful: true });
  const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return json(200, {
    success: true,
    planTier: result.planTier,
    durationDays: result.durationDays,
    expiresAt: result.expiresAt,
    message: "Your access has been restored.",
  });
});
