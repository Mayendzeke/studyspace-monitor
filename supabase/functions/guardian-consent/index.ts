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
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const origin = request.headers.get("Origin");
  if (!allowedOrigin || !origin || origin !== allowedOrigin) return json(403, { error: "This application origin is not allowed." });

  const url = Deno.env.get("SUPABASE_URL");
  const secretKey = getSecretKey();
  if (!url || !secretKey) return json(500, { error: "Guardian consent service configuration is incomplete." });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const action = String(body.action ?? "");
  const token = String(body.token ?? "").trim();
  if (!TOKEN_PATTERN.test(token)) return json(400, { error: "This guardian invitation is invalid. Ask the learner or StudySpace for a current link." });
  const tokenHash = await digest(token.toLowerCase());
  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (action === "get_invite") {
    const { data: invite, error: inviteError } = await admin.from("guardian_verification_invites")
      .select("learner_id,expires_at,redeemed_at,revoked_at")
      .eq("token_hash", tokenHash).maybeSingle();
    if (inviteError || !invite || invite.redeemed_at || invite.revoked_at || Date.parse(invite.expires_at) <= Date.now()) {
      return json(404, { error: "This guardian invitation has expired or has already been used. Ask StudySpace for a new link." });
    }
    const { data: learner, error: learnerError } = await admin.from("profiles")
      .select("student_id,full_name,preferred_name,date_of_birth,account_status")
      .eq("id", invite.learner_id).eq("role", "learner").maybeSingle();
    if (learnerError || !learner || learner.account_status !== "pending_guardian_verification" || !learner.date_of_birth) {
      return json(409, { error: "This learner's account is no longer awaiting guardian verification." });
    }
    const dob = new Date(String(learner.date_of_birth) + "T00:00:00.000Z");
    const now = new Date();
    let age = now.getUTCFullYear() - dob.getUTCFullYear();
    if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) age--;
    if (age < 0 || age >= 18) return json(409, { error: "This invitation is not eligible for guardian consent." });
    return json(200, {
      success: true,
      learner: {
        studentId: learner.student_id,
        name: learner.preferred_name || learner.full_name,
      },
      expiresAt: invite.expires_at,
      termsVersion: "2026-11-07-v3",
    });
  }

  if (action === "submit_consent") {
    const guardianFullName = String(body.guardianFullName ?? "").trim().replace(/\s+/g, " ");
    const relationship = String(body.relationship ?? "");
    const relationshipDetails = String(body.relationshipDetails ?? "").trim().replace(/\s+/g, " ");
    const guardianPhone = String(body.guardianPhone ?? "").trim();
    const consent = body.guardianConsent === true;
    const termsVersion = String(body.termsVersion ?? "");
    if (guardianFullName.length < 2 || guardianFullName.length > 120) return json(400, { error: "Enter the parent or guardian’s full name." });
    if (!["mother", "father", "legal_guardian", "grandparent", "other"].includes(relationship)) return json(400, { error: "Choose the relationship to the learner." });
    if (relationship === "other" && (relationshipDetails.length < 2 || relationshipDetails.length > 100)) return json(400, { error: "Describe the relationship to the learner." });
    if (!/^\+?[0-9][0-9 ()-]{5,28}$/.test(guardianPhone)) return json(400, { error: "Enter a valid contact number." });
    if (!consent) return json(400, { error: "The parent or legal guardian must personally give consent before submitting this form." });
    if (termsVersion !== "2026-11-07-v3") return json(400, { error: "The current StudySpace Terms and Conditions must be reviewed." });

    const { data: submitted, error: submitError } = await admin.rpc("submit_studyspace_guardian_link_consent", {
      p_token_hash: tokenHash,
      p_guardian_full_name: guardianFullName,
      p_relationship: relationship,
      p_relationship_details: relationshipDetails,
      p_guardian_phone: guardianPhone,
      p_guardian_consent: true,
      p_terms_version: termsVersion,
    });
    if (submitError || submitted !== true) {
      return json(409, { error: submitError?.message || "Guardian consent could not be submitted. Refresh the page and try again." });
    }
    return json(200, {
      success: true,
      message: "Guardian consent has been submitted to StudySpace. The learner’s account will remain locked until StudySpace reviews and approves the submission.",
    });
  }
  return json(400, { error: "Unsupported guardian consent action." });
});
