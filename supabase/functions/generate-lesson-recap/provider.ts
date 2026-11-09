export const GEMINI_MODEL = "gemini-3.8-flash";
export const GEMMA_MODEL = "@cf/google/gemma-4-26b-a4b-it";

export type ProviderResult = {
  text: string;
  provider: "Google Gemini API" | "Cloudflare Workers AI";
  model: string;
  fallbackUsed: boolean;
  providerNotice: string | null;
};

export type ProviderStatus = {
  primary: "Google Gemini API";
  backup: "Cloudflare Workers AI";
  gemini: { configured: boolean; model: string };
  gemma: { configured: boolean; model: string };
};

type GenerationOptions = { maxTokens?: number; jsonMode?: boolean; systemPrompt?: string; requiredJsonKeys?: string[] };

class ProviderSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderSafetyError";
  }
}

function geminiKey(): string {
  return Deno.env.get("GEMINI_API_KEY")?.trim() ?? "";
}

function geminiPaidServiceConfirmed(): boolean {
  return Deno.env.get("GEMINI_API_PAID_SERVICE_CONFIRMED")?.trim().toLowerCase() === "true";
}

function cloudflareCredentials(): { accountId: string; apiToken: string } {
  return {
    accountId: Deno.env.get("CLOUDFLARE_ACCOUNT_ID")?.trim() ?? "",
    apiToken: Deno.env.get("CLOUDFLARE_API_TOKEN")?.trim() ?? "",
  };
}

export function getProviderStatus(): ProviderStatus {
  const cloudflare = cloudflareCredentials();
  return {
    primary: "Google Gemini API",
    backup: "Cloudflare Workers AI",
    gemini: { configured: Boolean(geminiKey() && geminiPaidServiceConfirmed()), model: GEMINI_MODEL },
    gemma: { configured: Boolean(cloudflare.accountId && cloudflare.apiToken), model: GEMMA_MODEL },
  };
}

export function assertNoPersonalIdentifiers(value: string): void {
  const checks: [RegExp, string][] = [
    [/\bSTU-[A-Z0-9]{8}\b/i, "Student IDs"],
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, "email addresses"],
    [/(?:\+?268[\s-]?)?(?:7\d{7}|6\d{7})\b/, "Eswatini phone numbers"],
    [/\b(?:full name|student name|learner name|guardian name)\s*[:=]/i, "named learner or guardian details"],
    [/\b\d{4}-\d{2}-\d{2}\b/, "dates of birth or other personal dates"],
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(value)) {
      throw new Error("Remove " + label + " before using administrator MIΛ. Submit anonymised lesson material only; never send identifiable learner or guardian information to an AI provider.");
    }
  }
  if (/\b(?:password|passcode|one[- ]time pin|otp)\s*[:=]/i.test(value)) {
    throw new Error("Remove credentials and security codes before using administrator MIΛ.");
  }
}

function validateStructuredOutput(text: string, enabled: boolean, provider: string, requiredKeys: string[] = []): string {
  const clean = text.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "").trim();
  if (!clean) throw new Error(provider + " returned an empty response.");
  if (enabled) {
    try {
      const parsed = JSON.parse(clean);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected a JSON object.");
      const missing = requiredKeys.filter(key => !Object.prototype.hasOwnProperty.call(parsed, key));
      if (missing.length) throw new Error("Missing required fields: " + missing.join(", "));
      return clean;
    } catch {
      throw new Error(provider + " returned malformed structured output. The automatic backup will be tried.");
    }
  }
  return clean;
}
function parseGeminiText(payload: any): string {
  const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : undefined;
  const finishReason = String(candidate?.finishReason ?? "").toUpperCase();
  const blockReason = String(payload?.promptFeedback?.blockReason ?? "").toUpperCase();
  if (finishReason === "SAFETY" || blockReason) {
    throw new ProviderSafetyError("Gemini declined this administrator AI request under its safety rules. Review the request and try again with appropriate, anonymised teaching material.");
  }
  const parts = candidate?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((part: any) => typeof part?.text === "string" ? part.text : "").filter(Boolean).join("\n").trim()
    : "";
  if (!text) throw new Error("Gemini returned no readable text.");
  return text;
}

async function callGemini(prompt: string, options: Required<GenerationOptions>): Promise<string> {
  const key = geminiKey();
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");
  if (!geminiPaidServiceConfirmed()) throw new Error("Gemini primary is disabled until GEMINI_API_PAID_SERVICE_CONFIRMED=true is set after confirming active billing for a paid Gemini API project.");
  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        ...(options.systemPrompt ? { systemInstruction: { parts: [{ text: options.systemPrompt }] } } : {}),
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: options.maxTokens,
          thinkingConfig: { thinkingLevel: "low" },
          ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Gemini timed out after 25 seconds.");
    }
    throw new Error("Gemini could not be reached.");
  }
  const responseText = await response.text();
  let payload: any = {};
  try { payload = JSON.parse(responseText); } catch { /* Keep the failure description generic. */ }
  if (!response.ok) {
    const providerMessage = String(payload?.error?.message ?? "").replace(/\s+/g, " ").slice(0, 220);
    throw new Error("Gemini API returned HTTP " + response.status + (providerMessage ? ": " + providerMessage : "."));
  }
  return validateStructuredOutput(parseGeminiText(payload), options.jsonMode, "Gemini", options.requiredJsonKeys);
}

async function callGemma(prompt: string, options: Required<GenerationOptions>): Promise<string> {
  const { accountId, apiToken } = cloudflareCredentials();
  if (!accountId || !apiToken) throw new Error("Cloudflare Workers AI credentials are not configured.");
  let response: Response;
  try {
    response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/ai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiToken, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: GEMMA_MODEL,
        messages: [
          ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
          { role: "user", content: prompt },
        ],
        max_completion_tokens: options.maxTokens,
        stream: false,
        store: false,
        chat_template_kwargs: { enable_thinking: false, clear_thinking: true },
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Gemma backup timed out after 45 seconds.");
    }
    throw new Error("Gemma backup could not be reached.");
  }
  const responseText = await response.text();
  let payload: any = {};
  try { payload = JSON.parse(responseText); } catch { /* Keep the failure description generic. */ }
  if (!response.ok) {
    const details = Array.isArray(payload?.errors)
      ? payload.errors.map((item: any) => String(item?.message ?? "")).filter(Boolean).join("; ").slice(0, 220)
      : "";
    throw new Error("Gemma backup returned HTTP " + response.status + (details ? ": " + details : "."));
  }
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const raw = choice?.message?.content;
  const text = typeof raw === "string" ? raw.trim()
    : Array.isArray(raw) ? raw.map((part: any) => typeof part === "string" ? part : typeof part?.text === "string" ? part.text : "").join("\n").trim()
    : typeof choice?.text === "string" ? choice.text.trim() : "";
  return validateStructuredOutput(text, options.jsonMode, "Gemma backup", options.requiredJsonKeys);
}

export async function generateWithFallback(prompt: string, options: GenerationOptions = {}): Promise<ProviderResult> {
  const config: Required<GenerationOptions> = {
    maxTokens: Math.max(16, Math.min(8000, Math.floor(options.maxTokens ?? 2800))),
    jsonMode: options.jsonMode === true,
    systemPrompt: String(options.systemPrompt ?? "").trim().slice(0, 12000),
    requiredJsonKeys: Array.isArray(options.requiredJsonKeys) ? options.requiredJsonKeys.filter(key => typeof key === "string").slice(0, 20) : [],
  };
  const status = getProviderStatus();
  let primaryFailure = "";
  if (status.gemini.configured) {
    try {
      const text = await callGemini(prompt, config);
      return { text, provider: "Google Gemini API", model: GEMINI_MODEL, fallbackUsed: false, providerNotice: null };
    } catch (error) {
      if (error instanceof ProviderSafetyError) throw error;
      primaryFailure = error instanceof Error ? error.message : "Gemini was unavailable.";
    }
  } else {
    primaryFailure = geminiKey()
      ? "Gemini is disabled until active paid API billing is confirmed by setting GEMINI_API_PAID_SERVICE_CONFIRMED=true."
      : "GEMINI_API_KEY is not configured.";
  }

  if (!status.gemma.configured) {
    throw new Error(primaryFailure + " Gemma backup is also not configured. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to Supabase Edge Function secrets.");
  }
  try {
    const text = await callGemma(prompt, config);
    return {
      text,
      provider: "Cloudflare Workers AI",
      model: GEMMA_MODEL,
      fallbackUsed: true,
      providerNotice: "Gemini was unavailable (" + primaryFailure + "). Gemma 4 handled this request as the automatic backup.",
    };
  } catch (error) {
    const backupFailure = error instanceof Error ? error.message : "Gemma backup failed.";
    throw new Error("Both AI providers are currently unavailable. Gemini: " + primaryFailure + " Gemma: " + backupFailure);
  }
}
