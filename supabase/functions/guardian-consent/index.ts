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
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const value = parsed?.default;
      if (typeof value === "string" && value.length > 0) return value;
    } catch { /* Fall back to the legacy anon key. */ }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
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
  const publishableKey = getPublishableKey();
  if (!url || !secretKey || !publishableKey) return json(500, { error: "Guardian consent service configuration is incomplete." });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const action = String(body.action ?? "");
  const token = String(body.token ?? "").trim();
  if (action !== "issue_invite" && !TOKEN_PATTERN.test(token)) {
    return json(400, { error: "This guardian invitation is invalid. Ask the learner or StudySpace for a current link." });
  }
  const tokenHash = TOKEN_PATTERN.test(token) ? await digest(token.toLowerCase()) : "";
  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (action === "issue_invite") {
    const studentId = String(body.studentId ?? "").trim().toUpperCase();
    const password = String(body.password ?? "");
    if (!/^STU-[A-Z0-9]{8}$/.test(studentId) || password.length < 10 || password.length > 128) {
      return json(400, { error: "Enter the Student ID and password used to create this account." });
    }
    const authClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: studentId.toLowerCase() + "@students.studyspace.invalid",
      password,
    });
    if (authError || !authData.user) return json(401, { error: "Student ID or password could not be verified." });

    const { data: learner, error: learnerError } = await admin.from("profiles")
      .select("id,date_of_birth,account_status")
      .eq("id", authData.user.id).eq("student_id", studentId).eq("role", "learner").single();
    if (learnerError || !learner || learner.account_status !== "pending_guardian_verification" || !learner.date_of_birth) {
      return json(409, { error: "This learner account is not awaiting guardian verification." });
    }
    const { data: existingConsent, error: consentError } = await admin.from("guardian_verifications")
      .select("id").eq("learner_id", learner.id).maybeSingle();
    if (consentError) return json(503, { error: "The existing guardian consent record could not be checked." });
    if (existingConsent) return json(409, { error: "Guardian consent has already been submitted. StudySpace must review it in Monitor." });

    const randomToken = crypto.getRandomValues(new Uint8Array(32));
    const inviteToken = Array.from(randomToken, byte => byte.toString(16).padStart(2, "0")).join("");
    const tokenHash = await digest(inviteToken);
    const { error: inviteError } = await admin.from("guardian_verification_invites").upsert({
      learner_id: learner.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      redeemed_at: null,
      revoked_at: null,
    }, { onConflict: "learner_id" });
    if (inviteError) return json(503, { error: "The guardian invitation link could not be created. Ask a StudySpace representative for assistance." });

    const studentAppUrl = Deno.env.get("STUDENT_APP_URL") ?? "https://mayendzeke.github.io/planner/";
    const shareUrl = new URL(studentAppUrl);
    shareUrl.searchParams.set("guardian_consent", inviteToken);
    return json(200, { success: true, guardianUrl: shareUrl.toString(), expiresInDays: 14 });
  }

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
    const localToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Mbabane", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const today = new Date(localToday + "T00:00:00.000Z");
    let age = today.getUTCFullYear() - dob.getUTCFullYear();
    if (today.getUTCMonth() < dob.getUTCMonth() || (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate())) age--;
    if (age < 0 || age >= 18) return json(409, { error: "This invitation is not eligible for guardian consent." });
    return json(200, {
      success: true,
      learner: {
        studentId: learner.student_id,
        name: learner.preferred_name || learner.full_name,
      },
      expiresAt: invite.expires_at,
      termsVersion: "2026-11-09-v7",
    });
  }

  if (action === "submit_consent") {
    const guardianFullName = String(body.guardianFullName ?? "").trim().replace(/\s+/g, " ");
    const relationship = String(body.relationship ?? "");
    const relationshipDetails = String(body.relationshipDetails ?? "").trim().replace(/\s+/g, " ");
    const guardianPhone = String(body.guardianPhone ?? "").trim();
    const consent = body.guardianConsent === true;
    const termsVersion = String(body.termsVersion ?? "");
    const testimonialMarketingConsent = body.testimonialMarketingConsent === true;
    if (guardianFullName.length < 2 || guardianFullName.length > 120) return json(400, { error: "Enter the parent or guardian’s full name." });
    if (!["mother", "father", "legal_guardian", "grandparent", "other"].includes(relationship)) return json(400, { error: "Choose the relationship to the learner." });
    if (relationship === "other" && (relationshipDetails.length < 2 || relationshipDetails.length > 100)) return json(400, { error: "Describe the relationship to the learner." });
    if (!/^\+?[0-9][0-9 ()-]{5,28}$/.test(guardianPhone)) return json(400, { error: "Enter a valid contact number." });
    if (!consent) return json(400, { error: "The parent or legal guardian must personally give consent before submitting this form." });
    if (termsVersion !== "2026-11-09-v7") return json(400, { error: "The current StudySpace Terms and Conditions must be reviewed." });

    const { data: submitted, error: submitError } = await admin.rpc("submit_studyspace_guardian_link_consent", {
      p_token_hash: tokenHash,
      p_guardian_full_name: guardianFullName,
      p_relationship: relationship,
      p_relationship_details: relationshipDetails,
      p_guardian_phone: guardianPhone,
      p_guardian_consent: true,
      p_terms_version: termsVersion,
      p_testimonial_marketing_consent: testimonialMarketingConsent,
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
