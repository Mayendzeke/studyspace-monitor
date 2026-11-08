import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getNamedKey(variable: string): string | undefined {
  const raw = Deno.env.get(variable);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    const value = parsed?.default;
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch { return undefined; }
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const origin = request.headers.get("Origin");
  if (!allowedOrigin || !origin || origin !== allowedOrigin) return json(403, { error: "This application origin is not allowed." });

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!accessToken) return json(401, { error: "Administrator sign-in is required." });

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = getPublishableKey();
  const secretKey = getSecretKey();
  if (!url || !publishableKey || !secretKey) return json(500, { error: "Guardian verification service configuration is incomplete." });

  const caller = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization! } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(accessToken);
  if (authError || !authData.user) return json(401, { error: "Administrator sign-in is required." });
  const { data: assurance, error: assuranceError } = await caller.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
  if (assuranceError || assurance.currentLevel !== "aal2") return json(403, { error: "Administrator multi-factor authentication is required." });

  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: administrator, error: administratorError } = await admin.from("profiles")
    .select("id,role,account_status").eq("id", authData.user.id).single();
  if (administratorError || administrator?.role !== "admin" || administrator.account_status !== "active") {
    return json(403, { error: "Active StudySpace administrator access is required." });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const action = String(body.action ?? "");

  if (action === "list_pending") {
    const { data, error } = await admin.from("profiles")
      .select("id,student_id,full_name,preferred_name,date_of_birth,created_at")
      .eq("role", "learner")
      .eq("account_status", "pending_guardian_verification")
      .order("created_at", { ascending: true });
    if (error) return json(503, { error: "The guardian verification queue could not be loaded." });
    const today = new Date();
    const learners = (data ?? []).map(row => {
      const dob = new Date(String(row.date_of_birth) + "T00:00:00Z");
      let age = today.getUTCFullYear() - dob.getUTCFullYear();
      const monthDelta = today.getUTCMonth() - dob.getUTCMonth();
      if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < dob.getUTCDate())) age--;
      return { ...row, age };
    });
    return json(200, { success: true, learners });
  }

  if (action !== "approve") return json(400, { error: "Unsupported guardian verification action." });
  const learnerId = String(body.learnerId ?? "");
  const guardianFullName = String(body.guardianFullName ?? "").trim().replace(/\s+/g, " ");
  const relationship = String(body.relationship ?? "");
  const relationshipDetails = String(body.relationshipDetails ?? "").trim().replace(/\s+/g, " ");
  const guardianPhone = String(body.guardianPhone ?? "").trim();
  const guardianConsent = body.guardianConsent === true;
  const termsVersion = String(body.termsVersion ?? "");

  if (!UUID_PATTERN.test(learnerId)) return json(400, { error: "Select a valid learner account." });
  if (guardianFullName.length < 2 || guardianFullName.length > 120) return json(400, { error: "Enter the guardian’s full name." });
  if (!["mother", "father", "legal_guardian", "grandparent", "other"].includes(relationship)) return json(400, { error: "Choose the guardian’s relationship to the learner." });
  if (relationship === "other" && (relationshipDetails.length < 2 || relationshipDetails.length > 100)) return json(400, { error: "Describe the guardian’s relationship to the learner." });
  if (!/^\+?[0-9][0-9 ()-]{5,28}$/.test(guardianPhone)) return json(400, { error: "Enter a valid guardian contact number." });
  if (!guardianConsent) return json(400, { error: "The guardian must personally agree to the Terms and Conditions and give consent before activation." });
  if (termsVersion !== "2026-11-07-v3") return json(400, { error: "The current Terms and Conditions must be reviewed before activation." });

  const { data: activated, error: activationError } = await admin.rpc("activate_studyspace_minor_learner", {
    p_learner_id: learnerId,
    p_guardian_full_name: guardianFullName,
    p_relationship: relationship,
    p_relationship_details: relationshipDetails,
    p_guardian_phone: guardianPhone,
    p_guardian_consent: true,
    p_terms_version: termsVersion,
    p_verified_by: authData.user.id,
  });
  if (activationError || activated !== true) {
    return json(activationError ? 409 : 500, {
      error: activationError?.message || "The learner account could not be activated. Refresh the queue and try again.",
    });
  }
  return json(200, { success: true, message: "Guardian consent recorded and learner account activated. The learner can now sign in." });
});
