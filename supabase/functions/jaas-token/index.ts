import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set(["https://mayendzeke.github.io"]);
const APP_ID_PATTERN = /^vpaas-magic-cookie-[a-f0-9]{32}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOM_PATTERN = /^Studyspace-[a-f0-9]{32}$/i;
const TOKEN_TTL_SECONDS = 15 * 60;

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

const baseHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "Vary": "Origin",
};

function headersFor(origin: string | null): Record<string, string> {
  return origin && ALLOWED_ORIGINS.has(origin)
    ? { ...baseHeaders, "Access-Control-Allow-Origin": origin }
    : baseHeaders;
}

function json(status: number, body: Record<string, unknown>, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: headersFor(origin) });
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function derLength(length: number): Uint8Array {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function derElement(tag: number, value: Uint8Array): Uint8Array {
  return concatBytes(new Uint8Array([tag]), derLength(value.length), value);
}

function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const rsaEncryptionAlgorithm = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
    0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  const privateKeyOctets = derElement(0x04, pkcs1);
  return derElement(0x30, concatBytes(version, rsaEncryptionAlgorithm, privateKeyOctets));
}

function decodePem(pemValue: string): { label: string; der: Uint8Array } {
  const pem = pemValue.replace(/\\n/g, "\n").trim();
  const match = pem.match(/^-----BEGIN ([A-Z0-9 ]+)-----([\s\S]+?)-----END \1-----$/);
  if (!match) throw new Error("The JaaS private key is not a valid PEM file.");
  const label = match[1];
  const encoded = match[2].replace(/\s/g, "");
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { label, der: bytes };
}

async function importJaasPrivateKey(pem: string): Promise<CryptoKey> {
  const decoded = decodePem(pem);
  let pkcs8: Uint8Array;
  if (decoded.label === "PRIVATE KEY") {
    pkcs8 = decoded.der;
  } else if (decoded.label === "RSA PRIVATE KEY") {
    pkcs8 = pkcs1ToPkcs8(decoded.der);
  } else {
    throw new Error("The JaaS private key must be an unencrypted PKCS#8 or RSA PEM key.");
  }
  const buffer = pkcs8.buffer.slice(pkcs8.byteOffset, pkcs8.byteOffset + pkcs8.byteLength) as ArrayBuffer;
  return await crypto.subtle.importKey(
    "pkcs8",
    buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function signJaasJwt(
  privateKey: CryptoKey,
  appId: string,
  apiKeyId: string,
  roomSlug: string,
  userId: string,
  displayName: string,
  moderator: boolean,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: appId + "/" + apiKeyId,
  };
  const payload = {
    aud: "jitsi",
    iss: "chat",
    sub: appId,
    // JaaS scopes the JWT room claim to the room slug; `sub` binds the tenant/AppID.
    room: roomSlug,
    iat: now,
    nbf: now - 5,
    exp: now + TOKEN_TTL_SECONDS,
    context: {
      user: {
        id: userId,
        name: displayName,
        moderator: moderator ? "true" : "false",
      },
      features: {
        recording: "false",
        livestreaming: "false",
        transcription: "false",
        "sip-inbound-call": "false",
        "sip-outbound-call": "false",
        "outbound-call": "false",
        "inbound-call": "false",
        "file-upload": "false",
        "list-visitors": "false",
      },
      room: { regex: false },
    },
  };

  const encoder = new TextEncoder();
  const encodedHeader = base64Url(encoder.encode(JSON.stringify(header)));
  const encodedPayload = base64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = encodedHeader + "." + encodedPayload;
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    encoder.encode(signingInput),
  ));
  return signingInput + "." + base64Url(signature);
}

function getRoomSlug(meetingUrl: string | null): string | null {
  if (!meetingUrl) return null;
  try {
    const url = new URL(meetingUrl);
    if (
      url.protocol !== "https:" ||
      !["8x8.vc", "meet.jit.si"].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash
    ) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) return null;
    const slug = segments[0];
    return ROOM_PATTERN.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

function safeDisplayName(preferredName: unknown, fullName: unknown, fallback: string): string {
  const candidate = typeof preferredName === "string" && preferredName.trim()
    ? preferredName
    : typeof fullName === "string" && fullName.trim()
      ? fullName
      : fallback;
  return candidate.normalize("NFKC").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || fallback;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return json(403, { error: "This application origin is not allowed." }, origin);
    }
    return new Response(null, { status: 204, headers: headersFor(origin) });
  }

  if (request.method !== "POST") return json(405, { error: "Method not allowed." }, origin);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return json(403, { error: "This application origin is not allowed." }, origin);
  }

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!accessToken) return json(401, { error: "Sign in is required." }, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = getPublishableKey();
  const serviceKey = getSecretKey();
  const appId = Deno.env.get("JAAS_APP_ID")?.trim() ?? "";
  const apiKeyId = Deno.env.get("JAAS_API_KEY_ID")?.trim() ?? "";
  const privateKeyPem = Deno.env.get("JAAS_PRIVATE_KEY") ?? "";

  if (!supabaseUrl || !publishableKey || !serviceKey) {
    return json(503, { error: "The Studyspace authentication service is not configured." }, origin);
  }
  if (!APP_ID_PATTERN.test(appId) || !/^[A-Za-z0-9_-]{3,128}$/.test(apiKeyId) || !privateKeyPem.trim()) {
    return json(503, { error: "The JaaS credentials are incomplete. Check the three JaaS Edge Function secrets." }, origin);
  }

  const caller = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization! } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(accessToken);
  if (authError || !authData.user) return json(401, { error: "Your Studyspace sign-in is invalid or has expired." }, origin);

  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id,role,account_status,subscription_tier,subscription_expires_at,trial_started_at,trial_expires_at,terms_accepted_at,terms_version,preferred_name,full_name")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.account_status !== "active") {
    return json(403, { error: "An active Studyspace account is required." }, origin);
  }

  const isAdministrator = profile.role === "admin";
  const isLearner = profile.role === "learner";
  if (isLearner) {
    const now = Date.now();
    const paidExpiry = profile.subscription_expires_at ? Date.parse(profile.subscription_expires_at) : NaN;
    const trialStart = profile.trial_started_at ? Date.parse(profile.trial_started_at) : NaN;
    const trialExpiry = profile.trial_expires_at ? Date.parse(profile.trial_expires_at) : NaN;
    const hasPaidAccess = Boolean(profile.subscription_tier && Number.isFinite(paidExpiry) && paidExpiry > now);
    const hasTrialAccess = Boolean(!profile.subscription_tier && Number.isFinite(trialStart)
      && Number.isFinite(trialExpiry) && trialStart <= now && trialExpiry > now);
    const hasAcceptedTerms = Boolean(profile.terms_accepted_at && profile.terms_version === "2026-11-09-v8");
    if (!hasAcceptedTerms) {
      return json(403, { error: "Please accept the current StudySpace Terms and Conditions before joining a class." }, origin);
    }
    if (!hasPaidAccess && !hasTrialAccess) {
      return json(403, { error: "Your StudySpace access is paused. Choose a paid plan to continue." }, origin);
    }
  }
  if (!isAdministrator && !isLearner) return json(403, { error: "This account cannot join Studyspace classrooms." }, origin);

  if (isAdministrator) {
    const { data: assurance, error: assuranceError } = await caller.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
    if (assuranceError || assurance.currentLevel !== "aal2") {
      return json(403, { error: "Administrator multi-factor authentication is required." }, origin);
    }
  }

  let body: { action?: string; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid request body." }, origin);
  }

  let signingKey: CryptoKey;
  try {
    signingKey = await importJaasPrivateKey(privateKeyPem);
  } catch {
    return json(503, { error: "The JaaS private key could not be loaded. Confirm that JAAS_PRIVATE_KEY contains the complete unencrypted PEM key." }, origin);
  }

  if (body.action === "healthcheck") {
    if (!isAdministrator) return json(403, { error: "Administrator access is required for the JaaS connection test." }, origin);
    try {
      await signJaasJwt(signingKey, appId, apiKeyId, "Studyspace-configuration-check", authData.user.id,
        safeDisplayName(profile.preferred_name, profile.full_name, "Studyspace Administrator"), true);
    } catch {
      return json(503, { error: "JaaS signing could not be completed. Verify that the API key matches the uploaded public key." }, origin);
    }
    return json(200, { success: true, signed: true, provider: "jaas", tokenLifetimeSeconds: TOKEN_TTL_SECONDS }, origin);
  }

  if (body.action !== undefined) return json(400, { error: "Unsupported action." }, origin);
  if (typeof body.sessionId !== "string" || !UUID_PATTERN.test(body.sessionId)) {
    return json(400, { error: "A valid class session ID is required." }, origin);
  }

  const { data: session, error: sessionError } = await adminClient
    .from("class_sessions")
    .select("id,created_by,status,meeting_url")
    .eq("id", body.sessionId)
    .maybeSingle();

  if (sessionError || !session) return json(404, { error: "The requested class session was not found." }, origin);
  if (session.status !== "live") return json(409, { error: "This class is not currently live." }, origin);

  let moderator = false;
  if (isAdministrator) {
    if (session.created_by !== authData.user.id) {
      return json(403, { error: "Only the administrator who created this class can join as its teacher." }, origin);
    }
    moderator = true;
  } else {
    const { data: membership, error: membershipError } = await adminClient
      .from("class_session_members")
      .select("session_id")
      .eq("session_id", session.id)
      .eq("learner_id", authData.user.id)
      .maybeSingle();
    if (membershipError || !membership) {
      return json(403, { error: "This class has not been assigned to your learner account." }, origin);
    }
  }

  const roomSlug = getRoomSlug(session.meeting_url);
  if (!roomSlug) return json(409, { error: "The class meeting room is missing or invalid. Ask the teacher to republish the session." }, origin);

  const displayName = safeDisplayName(
    profile.preferred_name,
    profile.full_name,
    moderator ? "Studyspace Teacher" : "Studyspace Learner",
  );

  let token: string;
  try {
    token = await signJaasJwt(signingKey, appId, apiKeyId, roomSlug, authData.user.id, displayName, moderator);
  } catch {
    return json(503, { error: "JaaS could not sign the meeting token. Verify the API key and private key belong to the same JaaS key pair." }, origin);
  }

  return json(200, {
    success: true,
    provider: "jaas",
    domain: "8x8.vc",
    appId,
    roomName: appId + "/" + roomSlug,
    token,
    expiresAt: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    moderator,
  }, origin);
});
