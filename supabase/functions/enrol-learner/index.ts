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

const TERMS_VERSION = "2026-11-09-v8";
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

function localToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Mbabane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > localToday()) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function ageOnLocalDate(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = localToday().split("-").map(Number);
  let age = todayYear - year;
  if (todayMonth < month || (todayMonth === month && todayDay < day)) age--;
  return age;
}

function createStudentId(): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return "STU-" + Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  if (!allowedOrigin || request.headers.get("Origin") !== allowedOrigin) {
    return json(403, { error: "This application origin is not allowed." });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = getPublishableKey();
  const serviceKey = getSecretKey();
  const ratePepper = Deno.env.get("AUTH_RATE_LIMIT_PEPPER");
  if (!url || !anonKey || !serviceKey || !ratePepper) {
    return json(500, { error: "Enrolment service configuration is incomplete." });
  }

  let body: {
    password?: string;
    referralCode?: string;
    fullName?: string;
    preferredName?: string;
    dateOfBirth?: string;
    sex?: string;
    termsAccepted?: boolean;
    termsVersion?: string;
    acceptedByName?: string;
    acceptanceRole?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const password = String(body.password ?? "");
  const fullName = String(body.fullName ?? "").trim().replace(/\s+/g, " ");
  const preferredName = String(body.preferredName ?? "").trim().replace(/\s+/g, " ");
  const dateOfBirth = String(body.dateOfBirth ?? "");
  const sex = String(body.sex ?? "");
  const acceptedByName = String(body.acceptedByName ?? "").trim().replace(/\s+/g, " ");
  const acceptanceRole = String(body.acceptanceRole ?? "");

  if (password.length < 10 || password.length > 128) {
    return json(400, { error: "Choose a password between 10 and 128 characters." });
  }
  if (fullName.length < 2 || fullName.length > 120) {
    return json(400, { error: "Enter the learner’s full legal name." });
  }
  if (preferredName.length > 80) {
    return json(400, { error: "The preferred name is too long." });
  }
  if (!validDate(dateOfBirth)) {
    return json(400, { error: "Enter a valid date of birth." });
  }
  if (sex !== "male" && sex !== "female") {
    return json(400, { error: "Select Male or Female to complete registration." });
  }

  const learnerAge = ageOnLocalDate(dateOfBirth);
  if (learnerAge < 9) {
    return json(400, { error: "StudySpace registration is not available for children under 9 years old." });
  }
  const isAdult = learnerAge >= 18;

  if (isAdult) {
    if (body.termsAccepted !== true || body.termsVersion !== TERMS_VERSION) {
      return json(400, { error: "Read and personally accept the current StudySpace Terms and Conditions before creating your account." });
    }
    if (acceptedByName !== fullName || acceptanceRole !== "adult_learner") {
      return json(400, { error: "The adult learner must accept the Terms and Conditions in their own full name." });
    }
  } else if (body.termsAccepted === true || acceptedByName || acceptanceRole) {
    return json(400, { error: "Guardian consent for learners under 18 must be completed through StudySpace Monitor or the guardian invitation link." });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: capacityAvailable, error: capacityError } = await admin.rpc("studyspace_enrolment_capacity_available");
  if (capacityError) {
    return json(503, { error: "Enrolment capacity could not be verified. Please try again shortly." });
  }
  if (capacityAvailable !== true) {
    return json(409, { error: "StudySpace has reached its current enrolment limit. Existing learners can continue using their accounts." });
  }

  const source = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const sourceHash = await digest(ratePepper + ":" + source);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error: rateError } = await admin.from("student_auth_attempts")
    .select("id", { count: "exact", head: true })
    .eq("source_hash", sourceHash)
    .eq("action", "enrol")
    .gte("attempted_at", since);

  if (rateError) return json(503, { error: "Enrolment protection is temporarily unavailable." });
  if ((count ?? 0) >= 12) {
    return json(429, { error: "Too many registration attempts. Wait 15 minutes and try again." });
  }

  const identifierHash = await digest(ratePepper + ":public-enrol:" + source + ":" + crypto.randomUUID());
  const recordAttempt = async (successful: boolean) => {
    const { error } = await admin.from("student_auth_attempts").insert({
      identifier_hash: identifierHash,
      source_hash: sourceHash,
      action: "enrol",
      was_successful: successful,
    });
    if (error) console.error("Could not record enrolment attempt:", error.message);
  };

  let createdUser: { id: string; email?: string } | null = null;
  let studentId = "";
  let createErrorMessage = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    studentId = createStudentId();
    const email = studentId.toLowerCase() + "@students.studyspace.invalid";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        student_id: studentId,
        full_name: fullName,
        preferred_name: preferredName || fullName,
        date_of_birth: dateOfBirth,
        sex,
      },
    });
    if (!error && data.user) {
      createdUser = data.user;
      break;
    }
    createErrorMessage = error?.message ?? "The authentication service did not return the new account.";
    if (!/already (been )?registered|already exists|duplicate/i.test(createErrorMessage)) break;
  }

  if (!createdUser) {
    await recordAttempt(false);
    return json(409, { error: "StudySpace could not create this account. Please try again or contact support if the problem continues." });
  }

  const { data: completed, error: completionError } = await admin.rpc("complete_public_studyspace_enrolment", {
    p_learner_id: createdUser.id,
    p_student_id: studentId,
    p_full_name: fullName,
    p_preferred_name: preferredName || fullName,
    p_date_of_birth: dateOfBirth,
    p_sex: sex,
    p_accepted_by_name: isAdult ? acceptedByName : null,
    p_acceptance_role: isAdult ? "adult_learner" : null,
  });

  if (completionError || !["active", "pending_guardian_verification"].includes(String(completed))) {
    await admin.auth.admin.deleteUser(createdUser.id);
    await recordAttempt(false);
    if (!completionError && completed === "capacity_reached") {
      return json(409, { error: "StudySpace has reached its current enrolment limit. Existing learners can continue using their accounts." });
    }
    console.error("Public enrolment completion failed:", completionError?.message ?? String(completed));
    return json(500, { error: "Your account could not be completed. No account was left active; please try again." });
  }

  await recordAttempt(true);

  if (completed === "pending_guardian_verification") {
    return json(200, {
      success: true,
      studentId,
      accountStatus: "pending_guardian_verification",
      message: "Registration is complete. Your account remains locked until guardian consent is verified. You can request a private guardian link or visit a StudySpace representative.",
    });
  }

  return json(200, {
    success: true,
    studentId,
    accountStatus: "active",
    trialHours: 48,
    message: "Your account is ready. Your 48-hour free trial has started.",
  });
});
