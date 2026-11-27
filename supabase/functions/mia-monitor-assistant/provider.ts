export const GEMINI_MODEL = "gemini-2.5-flash";
export const GEMMA_MODEL = "@cf/google/gemma-4-26b-a4b-it";

export type ProviderResult = {
  text: string;
  provider: "Google Gemini API" | "Cloudflare Workers AI";
  model: string;
  fallbackUsed: boolean;
  providerNotice: string | null;
  groundingSources?: { title: string; uri: string }[];
};

export type ProviderStatus = {
  primary: "Google Gemini API (Free tier)";
  backup: "Cloudflare Workers AI · Gemma 4";
  gemini: { configured: boolean; model: string };
  gemma: { configured: boolean; model: string };
};

type GenerationOptions = { maxTokens?: number; jsonMode?: boolean; systemPrompt?: string; requiredJsonKeys?: string[]; googleSearch?: boolean };

class ProviderSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderSafetyError";
  }
}

function geminiKey(): string {
  return Deno.env.get("GEMINI_API_KEY")?.trim() ?? "";
}
function cloudflareCredentials() {
  return {
    accountId: Deno.env.get("CLOUDFLARE_ACCOUNT_ID")?.trim() ?? "",
    apiToken: Deno.env.get("CLOUDFLARE_API_TOKEN")?.trim() ?? "",
  };
}

export function getProviderStatus(): ProviderStatus {
  const cloudflare = cloudflareCredentials();
  return {
    primary: "Google Gemini API (Free tier)",
    backup: "Cloudflare Workers AI · Gemma 4",
    gemini: { configured: Boolean(geminiKey()), model: GEMINI_MODEL },
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
      throw new Error(provider + " returned malformed structured output.");
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
  if (finishReason === "MAX_TOKENS") throw new Error("Gemini reached its output-token limit before completing the response.");
  return text;
}

async function callGemini(prompt: string, options: Required<GenerationOptions>): Promise<{ text: string; groundingSources: { title: string; uri: string }[] }> {
  const key = geminiKey();
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");
  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        ...(options.systemPrompt ? { systemInstruction: { parts: [{ text: options.systemPrompt }] } } : {}),
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        ...(options.googleSearch ? { tools: [{ googleSearch: {} }] } : {}),
        generationConfig: {
          maxOutputTokens: options.maxTokens,
          ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error("Gemini timed out after 60 seconds.");
    throw new Error("Gemini could not be reached.");
  }
  const responseText = await response.text();
  let payload: any = {};
  try { payload = JSON.parse(responseText); } catch { /* Keep the failure description generic. */ }
  if (!response.ok) {
    const providerMessage = String(payload?.error?.message ?? "").replace(/\s+/g, " ").slice(0, 220);
    throw new Error("Gemini API returned HTTP " + response.status + (providerMessage ? ": " + providerMessage : "."));
  }
  const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : undefined;
  const groundingChunks = Array.isArray(candidate?.groundingMetadata?.groundingChunks) ? candidate.groundingMetadata.groundingChunks : [];
  const groundingSources = groundingChunks.flatMap((chunk: any) => {
    const web = chunk?.web;
    if (!web || typeof web.uri !== "string" || !/^https:\/\//i.test(web.uri)) return [];
    return [{ title: String(web.title || web.uri).slice(0, 240), uri: web.uri.slice(0, 2000) }];
  }).filter((source: { title: string; uri: string }, index: number, all: { title: string; uri: string }[]) =>
    all.findIndex(item => item.uri === source.uri) === index).slice(0, 12);
  return {
    text: validateStructuredOutput(parseGeminiText(payload), options.jsonMode, "Gemini", options.requiredJsonKeys),
    groundingSources,
  };
}

function completionText(payload: any): string {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const raw = choice?.message?.content;
  return typeof raw === "string" ? raw.trim()
    : Array.isArray(raw) ? raw.map((part: any) => typeof part === "string" ? part : typeof part?.text === "string" ? part.text : "").join("\n").trim()
    : typeof choice?.text === "string" ? choice.text.trim() : "";
}

async function callGemma(prompt: string, options: Required<GenerationOptions>): Promise<string> {
  const { accountId, apiToken } = cloudflareCredentials();
  if (!accountId || !apiToken) throw new Error("Cloudflare Workers AI backup is not configured. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to Supabase Edge Function secrets.");
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
        max_completion_tokens: Math.min(options.maxTokens, 6000),
        temperature: 0.25,
        stream: false,
        store: false,
        chat_template_kwargs: { enable_thinking: false, clear_thinking: true },
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error("Gemma 4 backup timed out after 45 seconds.");
    throw new Error("Cloudflare Workers AI could not be reached.");
  }
  const raw = await response.text();
  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { /* Normalise the response below. */ }
  if (!response.ok) {
    const details = String(payload?.error?.message ?? (Array.isArray(payload?.errors) ? payload.errors.map((item: any) => item?.message ?? "").filter(Boolean).join("; ") : "")).replace(/\s+/g, " ").slice(0, 220);
    throw new Error("Gemma 4 backup returned HTTP " + response.status + (details ? ": " + details : "."));
  }
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  if (["length", "max_tokens"].includes(String(choice?.finish_reason ?? "").toLowerCase())) {
    throw new Error("Gemma 4 backup reached its output-token limit before completing the response.");
  }
  const text = completionText(payload);
  return validateStructuredOutput(text, options.jsonMode, "Gemma 4", options.requiredJsonKeys);
}

export async function generateWithFallback(prompt: string, options: GenerationOptions = {}): Promise<ProviderResult> {
  const config: Required<GenerationOptions> = {
    maxTokens: Math.max(16, Math.min(8000, Math.floor(options.maxTokens ?? 2800))),
    jsonMode: options.jsonMode === true,
    systemPrompt: String(options.systemPrompt ?? "").trim().slice(0, 12000),
    requiredJsonKeys: Array.isArray(options.requiredJsonKeys) ? options.requiredJsonKeys.filter(key => typeof key === "string").slice(0, 20) : [],
    googleSearch: options.googleSearch === true,
  };

  let primaryFailure = "";
  if (geminiKey()) {
    try {
      const generated = await callGemini(prompt, config);
      return {
        text: generated.text,
        provider: "Google Gemini API",
        model: GEMINI_MODEL,
        fallbackUsed: false,
        providerNotice: null,
        groundingSources: generated.groundingSources,
      };
    } catch (error) {
      if (error instanceof ProviderSafetyError) throw error;
      primaryFailure = error instanceof Error ? error.message : "Gemini was unavailable.";
    }
  } else {
    primaryFailure = "GEMINI_API_KEY is not configured.";
  }

  // Search-grounded material preparation must never silently switch to a model
  // without Google Search grounding, because that could result in unverified citations.
  if (config.googleSearch) {
    throw new Error("Gemini is unavailable: " + primaryFailure.slice(0, 300) + ". This request requires live Google Search grounding, which the Gemma backup does not provide. Nothing was queued; retry when Gemini is available.");
  }

  try {
    const text = await callGemma(prompt, config);
    return {
      text,
      provider: "Cloudflare Workers AI",
      model: GEMMA_MODEL,
      fallbackUsed: true,
      providerNotice: "Gemini was unavailable for this request. Cloudflare Workers AI · Gemma 4 completed it as the automatic backup.",
    };
  } catch (error) {
    const backupFailure = error instanceof Error ? error.message : "Gemma 4 was unavailable.";
    throw new Error("Gemini primary failed: " + primaryFailure.slice(0, 240) + ". Gemma 4 backup failed: " + backupFailure.slice(0, 240));
  }
}
