export const GEMINI_MODEL = "gemini-2.5-flash";

export type ProviderResult = {
  text: string;
  provider: "Google Gemini API";
  model: string;
  fallbackUsed: boolean;
  providerNotice: string | null;
  groundingSources?: { title: string; uri: string }[];
};

export type ProviderStatus = {
  primary: "Google Gemini API (Free tier)";
  backup: "Disabled";
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

export function getProviderStatus(): ProviderStatus {
  return {
    primary: "Google Gemini API (Free tier)",
    backup: "Disabled",
    gemini: { configured: Boolean(geminiKey()), model: GEMINI_MODEL },
    gemma: { configured: false, model: "Disabled — no paid fallback" },
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
      throw new Error("Remove " + label + " before using administrator MIA. Submit anonymised lesson material only; never send identifiable learner or guardian information to an AI provider.");
    }
  }
  if (/\b(?:password|passcode|one[- ]time pin|otp)\s*[:=]/i.test(value)) {
    throw new Error("Remove credentials and security codes before using administrator MIA.");
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
          thinkingConfig: { thinkingLevel: "low" },
          ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Gemini timed out after 60 seconds.");
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

export async function generateWithFallback(prompt: string, options: GenerationOptions = {}): Promise<ProviderResult> {
  const config: Required<GenerationOptions> = {
    maxTokens: Math.max(16, Math.min(8000, Math.floor(options.maxTokens ?? 2800))),
    jsonMode: options.jsonMode === true,
    systemPrompt: String(options.systemPrompt ?? "").trim().slice(0, 12000),
    requiredJsonKeys: Array.isArray(options.requiredJsonKeys) ? options.requiredJsonKeys.filter(key => typeof key === "string").slice(0, 20) : [],
    googleSearch: options.googleSearch === true,
  };
  if (!geminiKey()) {
    throw new Error("GEMINI_API_KEY is not configured. Add the existing Google AI Studio Free tier key to Supabase Edge Function secrets.");
  }
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
    const reason = error instanceof Error ? error.message : "Gemini was unavailable.";
    throw new Error("Gemini Free tier is temporarily unavailable: " + reason.slice(0, 400) + ". No paid AI fallback is enabled; retry when the free quota resets.");
  }
}
