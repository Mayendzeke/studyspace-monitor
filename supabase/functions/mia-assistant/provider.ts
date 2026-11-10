export const GEMINI_MODEL = "gemini-3.8-flash";
export const GEMMA_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const SECONDARY_MODEL = "@cf/qwen/qwen3.8-27b";

export type ProviderMessage = { role: "system" | "user" | "assistant" | "model"; content: unknown };
export type ProviderResult = {
  text: string;
  provider: "Google Gemini API" | "Cloudflare Workers AI";
  model: string;
  fallbackUsed: boolean;
  providerNotice: string | null;
};
type GenerationOptions = { maxTokens?: number; jsonMode?: boolean; requiredJsonKeys?: string[] };

class ProviderRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ProviderRequestError"; }
}
class ProviderSafetyError extends Error {
  constructor(message: string) { super(message); this.name = "ProviderSafetyError"; }
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
function cleanJsonText(text: string): string {
  return text.trim().replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "").trim();
}
function validateOutput(text: string, jsonMode: boolean, provider: string, requiredKeys: string[] = []): string {
  const clean = text.trim();
  if (!clean) throw new Error(provider + " returned an empty response.");
  if (jsonMode) {
    const candidate = cleanJsonText(clean);
    try {
      const value = JSON.parse(candidate);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object.");
      const missing = requiredKeys.filter(key => !Object.prototype.hasOwnProperty.call(value, key));
      if (missing.length) throw new Error("Missing required fields: " + missing.join(", "));
      return candidate;
    } catch {
      throw new Error(provider + " returned malformed or incomplete structured output. Automatic backup will be attempted.");
    }
  }
  return clean;
}
function geminiParts(content: unknown): any[] {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) throw new Error("The learner message contains an unsupported Gemini content type.");
  return content.flatMap((part: any) => {
    if (part?.type === "text" && typeof part.text === "string") return [{ text: part.text }];
    if (part?.type === "image_url") {
      const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
      const match = typeof url === "string" ? url.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i) : null;
      if (!match) throw new Error("The attached image could not be prepared for Gemini. Use a JPG, PNG or WebP image.");
      return [{ inline_data: { mime_type: match[1], data: match[2] } }];
    }
    if (typeof part?.text === "string") return [{ text: part.text }];
    return [];
  });
}
function parseGeminiText(payload: any): string {
  const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : undefined;
  const finishReason = String(candidate?.finishReason ?? "").toUpperCase();
  const blockReason = String(payload?.promptFeedback?.blockReason ?? "").toUpperCase();
  if (finishReason === "SAFETY" || blockReason) {
    throw new ProviderSafetyError("Gemini declined this educational request under its safety rules. Review the question and try again with appropriate learning material.");
  }
  const parts = candidate?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((part: any) => typeof part?.text === "string" ? part.text : "").filter(Boolean).join("\n").trim()
    : "";
  if (!text) throw new Error("Gemini returned no readable text.");
  return text;
}
async function callGemini(messages: ProviderMessage[], options: Required<GenerationOptions>): Promise<string> {
  const key = geminiKey();
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");
  const systemPrompt = messages.filter(item => item.role === "system")
    .map(item => typeof item.content === "string" ? item.content : "").filter(Boolean).join("\n\n");
  const contents = messages.filter(item => item.role !== "system").map(item => ({
    role: item.role === "assistant" || item.role === "model" ? "model" : "user",
    parts: geminiParts(item.content),
  }));
  if (!contents.length || contents.some(item => !item.parts.length)) throw new Error("Gemini received an empty learner message.");
  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
        contents,
        generationConfig: {
          maxOutputTokens: options.maxTokens,
          thinkingConfig: { thinkingLevel: "low" },
          ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error("Gemini timed out after 60 seconds.");
    throw new Error("Gemini could not be reached.");
  }
  const raw = await response.text();
  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { /* Normalised below. */ }
  if (!response.ok) {
    const details = String(payload?.error?.message ?? "").replace(/\s+/g, " ").slice(0, 220);
    throw new ProviderRequestError("Gemini API returned HTTP " + response.status + (details ? ": " + details : "."), response.status);
  }
  return validateOutput(parseGeminiText(payload), options.jsonMode, "Gemini", options.requiredJsonKeys);
}
function completionText(payload: any): string {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const raw = choice?.message?.content;
  return typeof raw === "string" ? raw.trim()
    : Array.isArray(raw) ? raw.map((part: any) => typeof part === "string" ? part : typeof part?.text === "string" ? part.text : "").join("\n").trim()
    : typeof choice?.text === "string" ? choice.text.trim() : "";
}
async function callCloudflareModel(model: string, messages: ProviderMessage[], options: Required<GenerationOptions>): Promise<string> {
  const { accountId, apiToken } = cloudflareCredentials();
  if (!accountId || !apiToken) throw new Error("Cloudflare Workers AI credentials are not configured.");
  const apiMessages = messages.map(item => ({ role: item.role === "model" ? "assistant" : item.role, content: item.content }));
  let response: Response;
  try {
    response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/ai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiToken, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model,
        messages: apiMessages,
        max_completion_tokens: options.maxTokens,
        temperature: 0.25,
        stream: false,
        store: false,
        ...(model === GEMMA_MODEL ? { chat_template_kwargs: { enable_thinking: false, clear_thinking: true } } : { reasoning_effort: "low" }),
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error(model + " timed out after 45 seconds.");
    throw new Error(model + " could not be reached.");
  }
  const raw = await response.text();
  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { /* Normalised below. */ }
  if (!response.ok) {
    const details = Array.isArray(payload?.errors)
      ? payload.errors.map((item: any) => String(item?.message ?? "")).filter(Boolean).join("; ").slice(0, 180)
      : String(payload?.error?.message ?? "").slice(0, 180);
    throw new ProviderRequestError(model + " returned HTTP " + response.status + (details ? ": " + details : "."), response.status);
  }
  return validateOutput(completionText(payload), options.jsonMode, model, options.requiredJsonKeys);
}
export async function generateWithFallback(messages: ProviderMessage[], options: GenerationOptions = {}): Promise<ProviderResult> {
  const config: Required<GenerationOptions> = {
    maxTokens: Math.max(64, Math.min(3000, Math.floor(options.maxTokens ?? 1800))),
    jsonMode: options.jsonMode === true,
    requiredJsonKeys: Array.isArray(options.requiredJsonKeys) ? options.requiredJsonKeys.filter(key => typeof key === "string").slice(0, 20) : [],
  };
  let primaryFailure = "";
  if (geminiKey()) {
    try {
      const text = await callGemini(messages, config);
      return { text, provider: "Google Gemini API", model: GEMINI_MODEL, fallbackUsed: false, providerNotice: null };
    } catch (error) {
      if (error instanceof ProviderSafetyError) throw error;
      primaryFailure = error instanceof Error ? error.message : "Gemini was unavailable.";
    }
  } else {
    primaryFailure = "GEMINI_API_KEY is not configured.";
  }

  const credentials = cloudflareCredentials();
  if (!credentials.accountId || !credentials.apiToken) {
    throw new Error(primaryFailure + " Cloudflare backup credentials are not configured.");
  }
  console.warn("[MIΛ learner AI fallback] Gemini unavailable; trying Cloudflare backup:", primaryFailure.slice(0, 260));
  const failures: string[] = [];
  for (const [index, model] of [GEMMA_MODEL, SECONDARY_MODEL].entries()) {
    try {
      const text = await callCloudflareModel(model, messages, config);
      return {
        text, provider: "Cloudflare Workers AI", model, fallbackUsed: true,
        providerNotice: index === 0
          ? "Gemini was unavailable (" + primaryFailure + "). Gemma 4 handled this request as the automatic backup."
          : "Gemini and Gemma 4 were unavailable. Qwen 3.8 completed the request as the secondary backup.",
      };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : model + " failed.");
      if (error instanceof ProviderRequestError && [401, 403].includes(error.status)) break;
    }
  }
  throw new Error("StudySpace's learner AI models are currently unavailable. Gemini: " + primaryFailure + " " + failures.join(" | ").slice(0, 400));
}
