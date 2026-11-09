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
const allowedOrigin = Deno.env.get("APP_ORIGIN");
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin ?? "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};
function json(status: number, body: Record<string, unknown>) { return new Response(JSON.stringify(body), { status, headers }); }
async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
async function pinDigest(value: string, pepper: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("");
}
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const PUBLIC_ENROLMENT_ENABLED = true;
  if (!PUBLIC_ENROLMENT_ENABLED) return json(503, { error: "New learner enrolment is temporarily closed while StudySpace completes the required data-controller registration and legal launch requirements." });
  const origin = request.headers.get("Origin");
  if (!allowedOrigin || !origin || origin !== allowedOrigin) return json(403, { error: "This application origin is not allowed." });
  const url = Deno.env.get("SUPABASE_URL"), anonKey = getPublishableKey();
  const serviceKey = getSecretKey();
  const pinPepper = Deno.env.get("PIN_PEPPER"), ratePepper = Deno.env.get("AUTH_RATE_LIMIT_PEPPER");
  if (!url || !anonKey || !serviceKey || !pinPepper || !ratePepper) return json(500, { error: "Enrolment service configuration is incomplete." });
  let body: {
    studentId?: string;
    pin?: string;
    password?: string;
    fullName?: string;
    preferredName?: string;
    dateOfBirth?: string;
    sex?: string;
    termsAccepted?: boolean;
    termsVersion?: string;
    acceptedByName?: string;
    acceptanceRole?: string;
  };
  try { body = await request.json(); } catch { return json(400, { error: "Invalid request body." }); }
  const studentId = String(body.studentId ?? "").trim().toUpperCase();
  const pin = String(body.pin ?? "").replace(/\s+/g, "");
  const password = String(body.password ?? "");
  if (!/^STU-[A-Z0-9]{8}$/.test(studentId) || !/^\d{8}$/.test(pin)) return json(400, { error: "Check the Student ID and 8-digit enrolment PIN." });
  if (password.length < 10 || password.length > 128) return json(400, { error: "Choose a password between 10 and 128 characters." });

  const fullName = String(body.fullName ?? "").trim().replace(/\s+/g, " ");
  const preferredName = String(body.preferredName ?? "").trim().replace(/\s+/g, " ");
  const dateOfBirth = String(body.dateOfBirth ?? "");
  const sex = String(body.sex ?? "");
  if (fullName.length < 2 || fullName.length > 120) return json(400, { error: "Enter the learner’s full name." });
  if (sex !== "male" && sex !== "female") return json(400, { error: "Select Male or Female to complete registration." });
  if (preferredName.length > 80) return json(400, { error: "The preferred name is too long." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return json(400, { error: "Enter a valid date of birth." });
  const birthDate = new Date(dateOfBirth + "T00:00:00.000Z");
  const localToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Mbabane", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== dateOfBirth || dateOfBirth > localToday) {
    return json(400, { error: "Enter a valid date of birth." });
  }
  const today = new Date(localToday + "T00:00:00.000Z");
  let learnerAge = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < birthDate.getUTCDate())) learnerAge--;
  if (learnerAge < 9) return json(400, { error: "StudySpace registration is not available for children under 9 years old." });
  const isAdult = learnerAge >= 18;

  const acceptedByName = String(body.acceptedByName ?? "").trim();
  const acceptanceRole = String(body.acceptanceRole ?? "");
  if (isAdult) {
    if (body.termsAccepted !== true || body.termsVersion !== "2026-11-09-v8") {
      return json(400, { error: "Read and personally accept the current StudySpace Terms and Conditions before creating your account." });
    }
    if (acceptedByName !== fullName || acceptanceRole !== "adult_learner") {
      return json(400, { error: "The adult learner must accept the Terms and Conditions in their own full name." });
    }
  } else if (body.termsAccepted === true || acceptedByName || acceptanceRole) {
    return json(400, { error: "Guardian consent for learners under 18 must be completed in person through StudySpace Monitor." });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: capacityAvailable, error: capacityError } = await admin.rpc("studyspace_enrolment_capacity_available");
  if (capacityError) return json(503, { error: "Enrolment capacity could not be verified. Please try again shortly." });
  if (capacityAvailable !== true) return json(409, { error: "Study Space has reached its current enrolment limit. Existing learners can continue using their accounts." });

  const source = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identifierHash = await digest(ratePepper + ":" + studentId);
  const sourceHash = await digest(ratePepper + ":" + source);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [byId, bySource] = await Promise.all([
    admin.from("student_auth_attempts").select("id", { count: "exact", head: true }).eq("identifier_hash", identifierHash).eq("action", "enrol").gte("attempted_at", since),
    admin.from("student_auth_attempts").select("id", { count: "exact", head: true }).eq("source_hash", sourceHash).eq("action", "enrol").gte("attempted_at", since),
  ]);
  if (byId.error || bySource.error) return json(503, { error: "Enrolment protection is temporarily unavailable." });
  if ((byId.count ?? 0) >= 5 || (bySource.count ?? 0) >= 12) return json(429, { error: "Too many enrolment attempts. Wait 15 minutes and try again." });

  const pinHash = await pinDigest(pin, pinPepper);
  const { data: invitation, error: pinError } = await admin.from("enrolment_pins")
    .select("id,student_id,expires_at,redeemed_by,revoked_at")
    .eq("student_id", studentId).eq("pin_hash", pinHash)
    .is("redeemed_by", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (pinError || !invitation) {
    await admin.from("student_auth_attempts").insert({ identifier_hash: identifierHash, source_hash: sourceHash, action: "enrol", was_successful: false });
    return json(400, { error: "The Student ID or PIN is invalid, expired, revoked or already used." });
  }

  const email = studentId.toLowerCase() + "@students.studyspace.invalid";
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { student_id: studentId, full_name: fullName, preferred_name: preferredName || fullName, date_of_birth: dateOfBirth, sex },
  });
  if (createError || !created.user) {
    await admin.from("student_auth_attempts").insert({ identifier_hash: identifierHash, source_hash: sourceHash, action: "enrol", was_successful: false });
    return json(409, { error: "This invitation could not create an account. Contact your administrator if the Student ID has already been used." });
  }

  const { data: claimed, error: claimError } = await admin.from("enrolment_pins")
    .update({ redeemed_by: created.user.id, redeemed_at: new Date().toISOString() })
    .eq("id", invitation.id).is("redeemed_by", null).is("revoked_at", null)
    .gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
  if (claimError || !claimed) {
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from("student_auth_attempts").insert({ identifier_hash: identifierHash, source_hash: sourceHash, action: "enrol", was_successful: false });
    return json(409, { error: "This invitation has just been used or revoked. Ask your administrator for a new one." });
  }

  const { data: completed, error: completionError } = await admin.rpc("complete_studyspace_enrolment", {
    p_learner_id: created.user.id,
    p_student_id: studentId,
    p_full_name: fullName,
    p_preferred_name: preferredName || fullName,
    p_date_of_birth: dateOfBirth,
    p_sex: sex,
    p_accepted_by_name: isAdult ? acceptedByName : null,
    p_acceptance_role: isAdult ? "adult_learner" : null,
  });
  if (completionError || !["active", "pending_guardian_verification"].includes(String(completed))) {
    await admin.from("enrolment_pins")
      .update({ redeemed_by: null, redeemed_at: null })
      .eq("id", invitation.id)
      .eq("redeemed_by", created.user.id);
    await admin.auth.admin.deleteUser(created.user.id);
    if (!completionError && completed === "capacity_reached") {
      return json(409, { error: "Study Space has reached its current enrolment limit. Existing learners can continue using their accounts." });
    }
    return json(500, { error: "The account could not be completed. The invitation has been released; please try again or contact Study Space." });
  }
  await admin.from("student_auth_attempts").insert({ identifier_hash: identifierHash, source_hash: sourceHash, action: "enrol", was_successful: true });
  if (completed === "pending_guardian_verification") {
    return json(200, {
      success: true,
      studentId,
      accountStatus: "pending_guardian_verification",
      message: "Registration is complete. Your account is locked while guardian verification is pending. You can request a private guardian link now, or a StudySpace representative can record the guardian’s consent in person.",
    });
  }
  return json(200, { success: true, studentId, accountStatus: "active", message: "Account created. Sign in with your Student ID and password." });
});
