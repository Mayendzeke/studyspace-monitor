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
  "Vary": "Origin",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STORAGE_PAGE = 1000;
const MAX_STORAGE_DEPTH = 8;

async function listPersonalStorageFiles(admin: ReturnType<typeof createClient>, learnerId: string): Promise<string[]> {
  const bucket = admin.storage.from("studyspace-resources");
  const prefix = learnerId + "/personal";
  const paths = new Set<string>();
  const visitedFolders = new Set<string>();

  async function visit(folder: string, depth: number): Promise<void> {
    if (depth > MAX_STORAGE_DEPTH) {
      throw new Error("The learner's personal storage contains an unexpectedly deep folder structure.");
    }
    if (visitedFolders.has(folder)) return;
    visitedFolders.add(folder);

    let offset = 0;
    while (true) {
      const { data, error } = await bucket.list(folder, {
        limit: MAX_STORAGE_PAGE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error("Could not inspect a learner's personal storage: " + error.message);
      const entries = data ?? [];
      for (const entry of entries) {
        if (!entry.name || entry.name === "." || entry.name === "..") continue;
        const path = folder + "/" + entry.name;
        if (entry.id === null) {
          await visit(path, depth + 1);
        } else {
          paths.add(path);
        }
      }
      if (entries.length < MAX_STORAGE_PAGE) break;
      offset += MAX_STORAGE_PAGE;
    }
  }

  await visit(prefix, 0);

  // Include database-registered paths even if Storage listing pagination or
  // a just-created folder makes them absent from the current list response.
  const { data: resources, error: resourceError } = await admin
    .from("learner_personal_resources")
    .select("storage_path")
    .eq("learner_id", learnerId);
  if (resourceError) throw new Error("Could not load the learner's personal-file records: " + resourceError.message);
  for (const row of resources ?? []) {
    const path = typeof row.storage_path === "string" ? row.storage_path : "";
    if (path.startsWith(prefix + "/")) paths.add(path);
  }

  return [...paths];
}

async function removePersonalStorageFiles(admin: ReturnType<typeof createClient>, paths: string[]): Promise<number> {
  const bucket = admin.storage.from("studyspace-resources");
  let removed = 0;
  for (let offset = 0; offset < paths.length; offset += 100) {
    const batch = paths.slice(offset, offset + 100);
    const { error } = await bucket.remove(batch);
    if (error) throw new Error("Could not remove the learner's private files: " + error.message);
    removed += batch.length;
  }
  return removed;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const origin = request.headers.get("Origin");
  if (!allowedOrigin || !origin || origin !== allowedOrigin) return json(403, { error: "This application origin is not allowed." });

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!accessToken) return json(401, { error: "Sign in is required." });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = getPublishableKey();
  const serviceKey = getSecretKey();
  if (!url || !anonKey || !serviceKey) return json(500, { error: "Function configuration is incomplete." });

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization! } },
    auth: { persistSession: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(accessToken);
  if (authError || !authData.user) return json(401, { error: "Sign in is required." });

  const { data: assurance, error: assuranceError } = await caller.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
  if (assuranceError || assurance.currentLevel !== "aal2") return json(403, { error: "Administrator multi-factor authentication is required." });

  const { data: profile, error: profileError } = await caller
    .from("profiles").select("role,account_status").eq("id", authData.user.id).single();
  if (profileError || profile?.role !== "admin" || profile?.account_status !== "active") {
    return json(403, { error: "Active administrator access is required." });
  }

  let body: {
    learnerId?: string;
    action?: string;
    profile?: Record<string, unknown>;
    confirmation?: string;
    paymentConfirmed?: boolean;
    paymentTransactionReference?: string;
    dateOfBirth?: string;
    administratorConfirmed?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const learnerId = String(body.learnerId ?? "");
  const action = String(body.action ?? "");
  const paymentTransactionReference = String(body.paymentTransactionReference ?? "").trim();
  if (!UUID_PATTERN.test(learnerId)) return json(400, { error: "A valid learner account ID is required." });
  if (learnerId === authData.user.id) return json(400, { error: "An administrator cannot manage or delete their own account as a learner." });
  if (!["disable", "enable", "reset_password", "update_profile", "verify_age", "delete"].includes(action)) {
    return json(400, { error: "Unsupported account action." });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: learner, error: learnerError } = await admin
    .from("profiles")
    .select("id,role,account_status,student_id,full_name,preferred_name,date_of_birth,subscription_tier,subscription_expires_at")
    .eq("id", learnerId)
    .single();
  if (learnerError || !learner || learner.role !== "learner") {
    return json(404, { error: "Learner account not found." });
  }

  if (action === "verify_age") {
    if (body.administratorConfirmed !== true) return json(400, { error: "Confirm that the date of birth was checked using the approved age-verification method." });
    if (learner.date_of_birth) return json(409, { error: "This learner already has a recorded date of birth. It cannot be changed through this workflow." });
    const dateOfBirth = String(body.dateOfBirth ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return json(400, { error: "Enter a valid date of birth." });
    const [year, month, day] = dateOfBirth.split("-").map(Number);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return json(400, { error: "Enter a valid calendar date." });
    const localParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Mbabane", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = (key: string) => Number(localParts.find(item => item.type === key)?.value || 0);
    let age = part("year") - year;
    if (part("month") < month || (part("month") === month && part("day") < day)) age--;
    if (age < 9) return json(400, { error: "StudySpace can only verify learner records for ages 9 and older." });
    const { data: updated, error: updateError } = await admin.from("profiles")
      .update({ date_of_birth: dateOfBirth, updated_at: new Date().toISOString() })
      .eq("id", learnerId).eq("role", "learner").is("date_of_birth", null)
      .select("id,student_id,date_of_birth,account_status").maybeSingle();
    if (updateError || !updated) return json(409, { error: "The age record could not be saved. It may already have been recorded; refresh and check the learner profile." });
    const { error: auditError } = await admin.from("audit_events").insert({
      actor_id: authData.user.id,
      event_type: "learner_age_verified_by_admin",
      target_type: "profile",
      target_id: learnerId,
      details: { verification_method: "approved_age_verification_method", age_band: age >= 18 ? "adult" : "under_18", date_of_birth_recorded_once: true },
    });
    if (auditError) {
      await admin.from("profiles").update({ date_of_birth: null, updated_at: new Date().toISOString() }).eq("id", learnerId).eq("date_of_birth", dateOfBirth);
      return json(500, { error: "The age verification audit could not be recorded, so the date-of-birth update was rolled back." });
    }
    return json(200, { success: true, learner: updated, message: "Date of birth recorded once after administrator confirmation of the approved age-verification method." });
  }

  if (action === "update_profile") {
    if (!body.profile || typeof body.profile !== "object" || Array.isArray(body.profile)) {
      return json(400, { error: "Learner profile details are required." });
    }
    const allowedFields: Record<string, number> = {
      full_name: 120,
      preferred_name: 80,
      country: 80,
      institution: 160,
      education_level: 80,
      grade: 80,
      curriculum: 120,
      academic_year: 30,
      course: 160,
      subscription_tier: 80,
      subscription_expires_at: 40,
    };
    const updates: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(body.profile)) {
      if (!(key in allowedFields)) return json(400, { error: "Unsupported learner profile field: " + key + "." });
      if (typeof value !== "string") return json(400, { error: "Learner profile fields must be text." });
      const cleaned = value.replace(/\s+/g, " ").trim();
      if (cleaned.length > allowedFields[key]) {
        return json(400, { error: key.replaceAll("_", " ") + " is too long." });
      }
      if (key === "subscription_expires_at") {
        if (!cleaned) { updates[key] = null; continue; }
        const expiry = new Date(cleaned);
        if (Number.isNaN(expiry.getTime())) return json(400, { error: "A valid subscription expiry date is required." });
        updates[key] = expiry.toISOString();
      } else {
        updates[key] = cleaned || (key === "subscription_tier" ? null : "");
      }
    }
    if (!Object.keys(updates).length) return json(400, { error: "No learner profile changes were provided." });
    const nextTier = updates.subscription_tier === undefined ? null : updates.subscription_tier;
    const nextExpiry = updates.subscription_expires_at === undefined ? null : updates.subscription_expires_at;
    if (nextTier && !["Weekly", "2 Weeks", "Monthly"].includes(nextTier)) {
      return json(400, { error: "Choose Weekly, 2 Weeks or Monthly. The 48-hour free trial is automatic and cannot be assigned as a paid tier." });
    }
    if (nextTier && !nextExpiry) return json(400, { error: "A paid tier must have an expiry date. Set both fields, or clear both for no expiry." });
    if (nextExpiry && !nextTier) return json(400, { error: "Choose a paid tier when setting an expiry date." });
    const tierChanged = updates.subscription_tier !== undefined
      && updates.subscription_tier !== (learner.subscription_tier ?? null);
    const expiryChanged = updates.subscription_expires_at !== undefined
      && updates.subscription_expires_at !== (learner.subscription_expires_at ?? null);
    if (nextTier && (tierChanged || expiryChanged)) {
      if (body.paymentConfirmed !== true) {
        return json(400, { error: "Confirm that the MTN MoMo payment has been received and verified against this learner's Student ID before activating or renewing a paid plan." });
      }
      if (paymentTransactionReference.length < 4 || paymentTransactionReference.length > 120) {
        return json(400, { error: "Enter the MTN MoMo transaction reference from the verified payment receipt." });
      }
      const { data: priorPayment, error: priorPaymentError } = await admin
        .from("audit_events")
        .select("id")
        .eq("event_type", "learner_subscription_activated")
        .filter("details->>payment_transaction_reference", "eq", paymentTransactionReference)
        .limit(1)
        .maybeSingle();
      if (priorPaymentError) {
        return json(503, { error: "Payment reference checks are temporarily unavailable. Do not activate this plan until the reference can be checked." });
      }
      if (priorPayment) {
        return json(409, { error: "This MTN MoMo transaction reference has already been used for a StudySpace subscription. Check the receipt or contact support." });
      }
    }
    const resultingFullName = updates.full_name ?? learner.full_name ?? "";
    if (!String(resultingFullName).trim()) return json(400, { error: "Full name cannot be empty." });
    updates.updated_at = new Date().toISOString();

    const { data: updated, error } = await admin.from("profiles")
      .update(updates)
      .eq("id", learnerId)
      .eq("role", "learner")
      .select("id,student_id,full_name,preferred_name,country,institution,course,education_level,grade,curriculum,academic_year,subscription_tier,subscription_expires_at,account_status,updated_at")
      .single();
    if (error || !updated) return json(500, { error: "Learner profile could not be saved." });

    await admin.from("audit_events").insert({
      actor_id: authData.user.id,
      event_type: "learner_profile_updated",
      target_type: "profile",
      target_id: learnerId,
    });
    if (nextTier && (tierChanged || expiryChanged)) {
      const { error: activationAuditError } = await admin.from("audit_events").insert({
        actor_id: authData.user.id,
        event_type: "learner_subscription_activated",
        target_type: "profile",
        target_id: learnerId,
        details: {
          tier: updated.subscription_tier,
          expires_at: updated.subscription_expires_at,
          payment_method: "MTN MoMo",
          payment_reference: learner.student_id,
          payment_transaction_reference: paymentTransactionReference,
          payment_amount_emalangeni: ({ "Weekly": 100, "2 Weeks": 200, "Monthly": 350 } as Record<string, number>)[String(updated.subscription_tier)] ?? null,
          payment_currency: "SZL",
          payment_verified_by: authData.user.id,
          payment_verified_at: new Date().toISOString(),
        },
      });
      if (activationAuditError) {
        const { error: rollbackError } = await admin.from("profiles").update({
          subscription_tier: learner.subscription_tier,
          subscription_expires_at: learner.subscription_expires_at,
          updated_at: new Date().toISOString(),
        }).eq("id", learnerId).eq("role", "learner");
        if (rollbackError) {
          return json(500, { error: "The payment activation audit failed and the subscription rollback also needs manual reconciliation. Do not confirm access until the learner record and audit log have been checked." });
        }
        return json(500, { error: "The payment activation audit could not be recorded, so the subscription change was rolled back. Retry after checking the audit service." });
      }
    }
    return json(200, { success: true, learner: updated, message: "Learner profile updated." });
  }

  if (action === "disable") {
    const { error } = await admin.auth.admin.updateUserById(learnerId, { ban_duration: "876000h" });
    if (error) return json(500, { error: "Supabase could not revoke this account's sessions." });
    const { error: updateError } = await admin.from("profiles")
      .update({ account_status: "disabled", updated_at: new Date().toISOString() }).eq("id", learnerId);
    if (updateError) return json(500, { error: "The account was blocked in Auth, but its profile status needs reconciliation." });
    await admin.from("audit_events").insert({
      actor_id: authData.user.id, event_type: "learner_account_disabled",
      target_type: "profile", target_id: learnerId,
    });
    return json(200, { success: true, message: "Learner sign-in has been blocked and existing sessions revoked." });
  }

  if (action === "enable") {
    if (learner.account_status !== "disabled") {
      return json(409, { error: learner.account_status === "pending_guardian_verification"
        ? "This learner is awaiting in-person guardian consent. Complete the Guardian verification workflow before activating the account."
        : "Only a previously disabled learner account can be re-enabled. New registrations must complete their required enrolment checks." });
    }
    const { error } = await admin.auth.admin.updateUserById(learnerId, { ban_duration: "none" });
    if (error) return json(500, { error: "Supabase could not re-enable this account." });
    const { error: updateError } = await admin.from("profiles")
      .update({ account_status: "active", updated_at: new Date().toISOString() }).eq("id", learnerId);
    if (updateError) return json(500, { error: "Auth was re-enabled, but the profile status needs reconciliation." });
    await admin.from("audit_events").insert({
      actor_id: authData.user.id, event_type: "learner_account_enabled",
      target_type: "profile", target_id: learnerId,
    });
    return json(200, { success: true, message: "Learner account re-enabled. A new sign-in is required." });
  }

  if (action === "reset_password") {
    if (learner.account_status !== "active") {
      return json(409, { error: "Enable this learner account before resetting its password." });
    }
    const temporaryPassword = Array.from(crypto.getRandomValues(new Uint8Array(24)), byte =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(learnerId);
    if (authUserError || !authUserData.user) return json(500, { error: "Supabase could not load the learner's authentication record." });
    const nextAppMetadata = {
      ...(authUserData.user.app_metadata ?? {}),
      must_change_password: true,
      password_reset_at: new Date().toISOString(),
    };
    const { error: passwordError } = await admin.auth.admin.updateUserById(learnerId, {
      password: temporaryPassword,
      app_metadata: nextAppMetadata,
    });
    if (passwordError) return json(500, { error: "Supabase could not rotate the learner password." });

    // Revoke existing refresh sessions. Sign in once with the new temporary
    // password to obtain the learner JWT required by Supabase's admin signOut API.
    const learnerAuth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const learnerEmail = String(learner.student_id ?? "").toLowerCase() + "@students.studyspace.invalid";
    const { data: temporarySession, error: temporarySignInError } = await learnerAuth.auth.signInWithPassword({
      email: learnerEmail,
      password: temporaryPassword,
    });
    if (temporarySignInError || !temporarySession.session?.access_token) {
      console.error("[manage-learner-account] Could not create a temporary learner session for session revocation:", temporarySignInError?.message ?? "No session returned.");
    } else {
      const { error: revokeError } = await admin.auth.admin.signOut(temporarySession.session.access_token);
      if (revokeError) console.error("[manage-learner-account] Existing learner refresh sessions could not be revoked:", revokeError.message);
    }

    await admin.from("audit_events").insert({
      actor_id: authData.user.id, event_type: "learner_password_reset_by_admin",
      target_type: "profile", target_id: learnerId,
    });
    return json(200, {
      success: true,
      temporaryPassword,
      message: "A new temporary password was generated. Deliver it privately; it is shown only once.",
    });
  }

  // Permanent deletion is deliberately stricter than disable: the UI must
  // send the learner's exact Student ID in a second confirmation step.
  const requiredConfirmation = "DELETE " + (learner.student_id || learner.id);
  if (body.confirmation !== requiredConfirmation) {
    return json(400, { error: "Deletion confirmation did not match. Re-enter the exact confirmation phrase shown in Monitor." });
  }

  const { error: startAuditError } = await admin.from("audit_events").insert({
    actor_id: authData.user.id,
    event_type: "learner_account_deletion_started",
    target_type: "profile",
    target_id: learnerId,
  });
  if (startAuditError) return json(500, { error: "The deletion could not be recorded, so the account was not changed." });

  // Suspend before file cleanup so the learner cannot keep syncing or
  // uploading while the irreversible deletion workflow is in progress.
  const { error: banError } = await admin.auth.admin.updateUserById(learnerId, { ban_duration: "876000h" });
  if (banError) return json(500, { error: "The learner could not be suspended before deletion." });
  const { error: statusError } = await admin.from("profiles")
    .update({ account_status: "disabled", updated_at: new Date().toISOString() }).eq("id", learnerId);
  if (statusError) {
    return json(500, { error: "The learner was blocked in Auth but profile status could not be updated. The account remains suspended." });
  }

  let storageFilesRemoved = 0;
  try {
    const storagePaths = await listPersonalStorageFiles(admin, learnerId);
    storageFilesRemoved = await removePersonalStorageFiles(admin, storagePaths);
  } catch (error) {
    return json(500, {
      error: (error instanceof Error ? error.message : "Learner files could not be removed.") +
        " The learner account remains suspended; no permanent account deletion was completed.",
    });
  }

  // Preserve the one-time nature of redeemed PINs while detaching the
  // nullable profile foreign key. The table constraint requires the redemption
  // timestamp and redeemer to be cleared together; revoked_at keeps the PIN
  // unavailable for reuse and visible in the administrator's PIN history.
  const { error: pinError } = await admin.from("enrolment_pins")
    .update({
      redeemed_by: null,
      redeemed_at: null,
      revoked_at: new Date().toISOString(),
    }).eq("redeemed_by", learnerId);
  if (pinError) {
    return json(500, { error: "The learner's redeemed enrolment records could not be detached and revoked. The learner remains suspended; no permanent account deletion was completed." });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(learnerId, false);
  if (deleteError) {
    await admin.from("audit_events").insert({
      actor_id: authData.user.id,
      event_type: "learner_account_deletion_failed",
      target_type: "profile",
      target_id: learnerId,
    });
    return json(500, {
      error: "The learner's private files were removed and the account is suspended, but Supabase could not complete account deletion. The learner remains disabled; retry after resolving the Auth deletion issue.",
    });
  }

  const { error: completedAuditError } = await admin.from("audit_events").insert({
    actor_id: authData.user.id,
    event_type: "learner_account_deleted",
    target_type: "profile",
    target_id: learnerId,
  });

  return json(200, {
    success: true,
    deleted: true,
    storageFilesRemoved,
    auditLogged: !completedAuditError,
    message: "Learner Auth account and cloud profile were permanently deleted. Associated learner records were removed by database cascade.",
  });
});
