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
    const learnerIds = (data ?? []).map(row => row.id);
    const { data: guardianRows, error: guardianRowsError } = learnerIds.length
      ? await admin.from("guardian_verifications")
          .select("learner_id,guardian_full_name,relationship,relationship_details,guardian_phone,consent_given,terms_version,terms_accepted_at,verification_source,approval_status,verified_at,testimonial_marketing_consent")
          .in("learner_id", learnerIds)
      : { data: [], error: null };
    if (guardianRowsError) return json(503, { error: "Guardian consent submissions could not be loaded." });
    const guardianByLearner = new Map((guardianRows ?? []).map(row => [row.learner_id, row]));
    const localParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Mbabane", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const part = (key: string) => localParts.find(item => item.type === key)?.value || "";
    const localToday = new Date(part("year") + "-" + part("month") + "-" + part("day") + "T00:00:00Z");
    const learners = (data ?? []).map(row => {
      const dateOfBirth = String(row.date_of_birth ?? "");
      const dob = /^\\d{4}-\\d{2}-\\d{2}$/.test(dateOfBirth) ? new Date(dateOfBirth + "T00:00:00Z") : null;
      let age = -1;
      if (dob && !Number.isNaN(dob.getTime()) && dob.toISOString().slice(0, 10) === dateOfBirth) {
        age = localToday.getUTCFullYear() - dob.getUTCFullYear();
        const monthDelta = localToday.getUTCMonth() - dob.getUTCMonth();
        if (monthDelta < 0 || (monthDelta === 0 && localToday.getUTCDate() < dob.getUTCDate())) age--;
      }
      return { ...row, age, guardianSubmission: guardianByLearner.get(row.id) ?? null };
    });
    return json(200, { success: true, learners });
  }

  if (action === "create_invite") {
    const learnerId = String(body.learnerId ?? "");
    if (!UUID_PATTERN.test(learnerId)) return json(400, { error: "Select a valid learner account." });
    const { data: learner, error: learnerError } = await admin.from("profiles")
      .select("id,date_of_birth,account_status")
      .eq("id", learnerId).eq("role", "learner").single();
    if (learnerError || !learner || learner.account_status !== "pending_guardian_verification" || !learner.date_of_birth) {
      return json(409, { error: "This learner is not awaiting guardian verification." });
    }
    const { data: existingConsent, error: consentError } = await admin.from("guardian_verifications")
      .select("id").eq("learner_id", learnerId).maybeSingle();
    if (consentError) return json(503, { error: "The existing guardian record could not be checked." });
    if (existingConsent) return json(409, { error: "A guardian consent submission already exists. Review it in the verification queue instead of issuing another link." });
    const randomToken = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(randomToken, byte => byte.toString(16).padStart(2, "0")).join("");
    const tokenHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHashHex = Array.from(new Uint8Array(tokenHash), byte => byte.toString(16).padStart(2, "0")).join("");
    const { error: inviteError } = await admin.from("guardian_verification_invites").upsert({
      learner_id: learnerId,
      token_hash: tokenHashHex,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      redeemed_at: null,
      revoked_at: null,
    }, { onConflict: "learner_id" });
    if (inviteError) return json(503, { error: "A guardian link could not be generated. Please try again." });
    const studentAppUrl = Deno.env.get("STUDENT_APP_URL") ?? "https://mayendzeke.github.io/planner/";
    const shareUrl = new URL(studentAppUrl);
    shareUrl.searchParams.set("guardian_consent", token);
    return json(200, { success: true, guardianUrl: shareUrl.toString(), expiresInDays: 14 });
  }

  if (action === "get_testimonial_marketing_consents") {
    const learnerIds = Array.isArray(body.learnerIds)
      ? [...new Set(body.learnerIds.filter(value => typeof value === "string" && UUID_PATTERN.test(value)))]
      : [];
    if (!learnerIds.length || learnerIds.length > 120) {
      return json(400, { error: "Provide between 1 and 120 valid learner IDs." });
    }
    const [profilesResult, guardiansResult] = await Promise.all([
      admin.from("profiles").select("id,date_of_birth").eq("role", "learner").in("id", learnerIds),
      admin.from("guardian_verifications").select("learner_id,testimonial_marketing_consent,approval_status").in("learner_id", learnerIds),
    ]);
    if (profilesResult.error || guardiansResult.error) {
      return json(503, { error: "Learner ages or guardian marketing permissions could not be verified." });
    }
    const guardianByLearner = new Map((guardiansResult.data ?? []).map(row => [row.learner_id, row]));
    const localToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Mbabane", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const today = new Date(localToday + "T00:00:00.000Z");
    const consents = (profilesResult.data ?? []).map(profile => {
      const guardian = guardianByLearner.get(profile.id);
      let isMinor: boolean | null = null;
      if (profile.date_of_birth) {
        const dob = new Date(String(profile.date_of_birth) + "T00:00:00.000Z");
        if (!Number.isNaN(dob.getTime()) && dob <= today) {
          let age = today.getUTCFullYear() - dob.getUTCFullYear();
          if (today.getUTCMonth() < dob.getUTCMonth() || (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate())) age--;
          if (age >= 0) isMinor = age < 18;
        }
      }
      return {
        learner_id: profile.id,
        is_minor: isMinor,
        testimonial_marketing_consent: guardian?.testimonial_marketing_consent === true,
        approval_status: guardian?.approval_status ?? null,
      };
    });
    return json(200, { success: true, consents });
  }

  if (action === "get_record") {
    const learnerId = String(body.learnerId ?? "");
    if (!UUID_PATTERN.test(learnerId)) return json(400, { error: "A valid learner account ID is required." });
    const { data, error } = await admin.from("guardian_verifications")
      .select("guardian_full_name,relationship,relationship_details,guardian_phone,consent_given,terms_version,terms_accepted_at,verification_source,approval_status,verified_at,testimonial_marketing_consent")
      .eq("learner_id", learnerId)
      .maybeSingle();
    if (error) return json(503, { error: "The guardian verification record could not be loaded." });
    return json(200, { success: true, record: data ?? null });
  }

  if (action === "approve_submitted") {
    const learnerId = String(body.learnerId ?? "");
    if (!UUID_PATTERN.test(learnerId)) return json(400, { error: "Select a valid learner account." });
    if (body.administratorConfirmed !== true) return json(400, { error: "Confirm that you have reviewed the guardian submission and verified the consent before activation." });
    const { data: approved, error: approvalError } = await admin.rpc("approve_studyspace_guardian_link_consent", {
      p_learner_id: learnerId,
      p_verified_by: authData.user.id,
    });
    if (approvalError || approved !== true) {
      return json(409, { error: approvalError?.message || "The guardian submission could not be approved." });
    }
    return json(200, { success: true, message: "Guardian link submission reviewed and approved. The learner account is now active." });
  }

  if (action !== "approve") return json(400, { error: "Unsupported guardian verification action." });
  const learnerId = String(body.learnerId ?? "");
  const guardianFullName = String(body.guardianFullName ?? "").trim().replace(/\s+/g, " ");
  const relationship = String(body.relationship ?? "");
  const relationshipDetails = String(body.relationshipDetails ?? "").trim().replace(/\s+/g, " ");
  const guardianPhone = String(body.guardianPhone ?? "").trim();
  const guardianConsent = body.guardianConsent === true;
  const termsVersion = String(body.termsVersion ?? "");
  const testimonialMarketingConsent = body.testimonialMarketingConsent === true;

  if (!UUID_PATTERN.test(learnerId)) return json(400, { error: "Select a valid learner account." });
  if (guardianFullName.length < 2 || guardianFullName.length > 120) return json(400, { error: "Enter the guardian’s full name." });
  if (!["mother", "father", "legal_guardian", "grandparent", "other"].includes(relationship)) return json(400, { error: "Choose the guardian’s relationship to the learner." });
  if (relationship === "other" && (relationshipDetails.length < 2 || relationshipDetails.length > 100)) return json(400, { error: "Describe the guardian’s relationship to the learner." });
  if (!/^\+?[0-9][0-9 ()-]{5,28}$/.test(guardianPhone)) return json(400, { error: "Enter a valid guardian contact number." });
  if (!guardianConsent) return json(400, { error: "The guardian must personally agree to the Terms and Conditions and give consent before activation." });
  if (termsVersion !== "2026-11-08-v6") return json(400, { error: "The current Terms and Conditions must be reviewed before activation." });

  const { data: activated, error: activationError } = await admin.rpc("activate_studyspace_minor_learner", {
    p_learner_id: learnerId,
    p_guardian_full_name: guardianFullName,
    p_relationship: relationship,
    p_relationship_details: relationshipDetails,
    p_guardian_phone: guardianPhone,
    p_guardian_consent: true,
    p_terms_version: termsVersion,
    p_verified_by: authData.user.id,
    p_testimonial_marketing_consent: testimonialMarketingConsent,
  });
  if (activationError || activated !== true) {
    return json(activationError ? 409 : 500, {
      error: activationError?.message || "The learner account could not be activated. Refresh the queue and try again.",
    });
  }
  return json(200, { success: true, message: "Guardian consent recorded and learner account activated. The learner can now sign in." });
});
