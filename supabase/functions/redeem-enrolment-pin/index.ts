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
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = getPublishableKey();
  const pinPepper = Deno.env.get("PIN_PEPPER");
  if (!authorization || !url || !anonKey || !pinPepper) return json(500, { error: "Function configuration is incomplete." });

  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return json(401, { error: "Sign in is required before redeeming a PIN." });

  let body: { pin?: string };
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const pin = String(body.pin ?? "").replace(/\s+/g, "");
  if (!/^\d{8}$/.test(pin)) return json(400, { error: "Enter the 8-digit enrolment PIN." });

  const digest = await pinDigest(pin, pinPepper);
  const { data, error } = await client.rpc("redeem_studyspace_pin", { pin_digest: digest });
  if (error) {
    const throttled = error.message.toLowerCase().includes("too many pin attempts");
    return json(throttled ? 429 : 400, { error: throttled ? "Too many attempts. Try again in 15 minutes." : "This PIN is invalid, expired, revoked, or already used." });
  }
  if (data !== true) return json(400, { error: "This PIN is invalid, expired, revoked, or already used." });
  return json(200, { success: true, message: "Enrolment complete. Your account is now active." });
});
