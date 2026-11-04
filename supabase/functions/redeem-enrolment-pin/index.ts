import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !url || !anonKey) return json(500, { error: "Function configuration is incomplete." });

  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return json(401, { error: "Sign in is required before redeeming a PIN." });

  let body: { pin?: string };
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const pin = String(body.pin ?? "").replace(/\s+/g, "");
  if (!/^\d{8}$/.test(pin)) return json(400, { error: "Enter the 8-digit enrolment PIN." });

  const pinDigest = await sha256(pin);
  const { data, error } = await client.rpc("redeem_studyspace_pin", { pin_digest: pinDigest });
  if (error) {
    const throttled = error.message.toLowerCase().includes("too many pin attempts");
    return json(throttled ? 429 : 400, { error: throttled ? "Too many attempts. Try again in 15 minutes." : "This PIN is invalid, expired, revoked, or already used." });
  }
  if (data !== true) return json(400, { error: "This PIN is invalid, expired, revoked, or already used." });
  return json(200, { success: true, message: "Enrolment complete. Your account is now active." });
});
