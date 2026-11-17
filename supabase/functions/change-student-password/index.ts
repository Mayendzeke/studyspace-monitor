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

const allowedOrigin = Deno.env.get("APP_ORIGIN") ?? "https://mayendzeke.github.io";
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "Vary": "Origin",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  const origin = request.headers.get("Origin");
  if (!origin || origin !== allowedOrigin) return json(403, { error: "This StudySpace origin is not allowed." });

  const authorization = request.headers.get("Authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!accessToken) return json(401, { error: "Sign in with your Student ID and temporary password first." });

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = getPublishableKey();
  const secretKey = getSecretKey();
  if (!url || !publishableKey || !secretKey) return json(503, { error: "The secure password service is not configured." });

  let body: { password?: unknown };
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 12 || password.length > 128 || !password.trim()) {
    return json(400, { error: "Choose a password between 12 and 128 characters. Avoid a blank password." });
  }

  const caller = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(accessToken);
  if (authError || !authData.user) return json(401, { error: "Your sign-in has expired. Sign in again and retry." });

  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("id,role,account_status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) return json(503, { error: "Your StudySpace account could not be verified. Try again." });
  if (!profile || profile.role !== "learner" || profile.account_status !== "active") {
    return json(403, { error: "Only an active learner can change a StudySpace student password." });
  }

  const nextAppMetadata = {
    ...(authData.user.app_metadata ?? {}),
    must_change_password: false,
    password_changed_at: new Date().toISOString(),
  };
  const { error: updateError } = await admin.auth.admin.updateUserById(authData.user.id, {
    password,
    app_metadata: nextAppMetadata,
  });
  if (updateError) {
    console.error("[change-student-password] Auth update failed:", updateError.message);
    return json(400, { error: "Your new password could not be saved. Check the requirements and try again." });
  }

  const { error: auditError } = await admin.from("audit_events").insert({
    actor_id: authData.user.id,
    event_type: "learner_password_changed_by_learner",
    target_type: "profile",
    target_id: authData.user.id,
    details: { method: "student_self_service" },
  });
  if (auditError) console.error("[change-student-password] Audit event could not be recorded:", auditError.message);

  return json(200, {
    success: true,
    must_change_password: false,
    message: "Your password has been changed. You can now use your private password on future sign-ins.",
  });
});
