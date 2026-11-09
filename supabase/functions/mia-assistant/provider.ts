export const GEMINI_MODEL = "gemini-3.8-flash";
export const GEMMA_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const CLOUDFLARE_SECONDARY_MODEL = "@cf/qwen/qwen3.8-27b";

export type ProviderMessage = { role: "system" | "user" | "assistant" | "model"; content: unknown };
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
  secondaryModel: string;
};
type GenerationOptions = { maxTokens?: number; jsonMode?: boolean; systemPrompt?: string };
class ProviderSafetyError extends Error { constructor(message: string) { super(message); this.name = "ProviderSafetyError"; } }
class ProviderRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ProviderRequestError"; }
}
function geminiKey() { return Deno.env.get("GEMINI_API_KEY")?.trim() ?? ""; }
function geminiPaidServiceConfirmed() { return Deno.env.get("GEMINI_API_PAID_SERVICE_CONFIRMED")?.trim().toLowerCase() === "true"; }
function cloudflareCredentials() {
  return { accountId: Deno.env.get("CLOUDFLARE_ACCOUNT_ID")?.trim() ?? "", apiToken: Deno.env.get("CLOUDFLARE_API_TOKEN")?.trim() ?? "" };
}
export function getProviderStatus(): ProviderStatus {
  const cloudflare = cloudflareCredentials();
  return {
    primary: "Google Gemini API",
    backup: "Cloudflare Workers AI",
    gemini: { configured: Boolean(geminiKey() && geminiPaidServiceConfirmed()), model: GEMINI_MODEL },
    gemma: { configured: Boolean(cloudflare.accountId && cloudflare.apiToken), model: GEMMA_MODEL },
    secondaryModel: CLOUDFLARE_SECONDARY_MODEL,
  };
}
function cleanJsonText(text: string): string {
  return text.trim().replace(/<think>[\\s\\S]*?<\\/think>/gi, "").trim()
    .replace(/^\`\`\`(?:json)?\\s*/i, "").replace(/\\s*\`\`\`$/, "").trim();
}
function validateOutput(text: string, jsonMode: boolean, provider: string): string {
  const clean = text.trim();
  if (!clean) throw new Error(provider + " returned an empty response.");
  if (jsonMode) {
    const candidate = cleanJsonText(clean);
    try {
      const value = JSON.parse(candidate);
      if (!value || typeof value !== "object") throw new Error("Expected a JSON object.");
      return candidate;
    } catch {
      throw new Error(provider + " returned malformed structured output. Automatic backup will be attempted.");
    }
  }
  return clean;
}
function geminiParts(content: unknown): any[] {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: JSON.stringify(content ?? "") }];
  const parts: any[] = [];
  for (const part of content as any[]) {
    if (typeof part === "string") { parts.push({ text: part }); continue; }
    if (part?.type === "text" && typeof part.text === "string") { parts.push({ text: part.text }); continue; }
    const imageUrl = typeof part?.image_url?.url === "string" ? part.image_url.url : "";
    const dataMatch = imageUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
    if (dataMatch) parts.push({ inlineData: { mimeType: dataMatch[1], data: dataMatch[2] } });
    else if (imageUrl.startsWith("https://")) parts.push({ fileData: { mimeType: "image/jpeg", fileUri: imageUrl } });
  }
  return parts.length ? parts : [{ text: "" }];
}
function parseGeminiText(payload: any): string {
  const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : undefined;
  const finishReason = String(candidate?.finishReason ?? "").toUpperCase();
  const blockReason = String(payload?.promptFeedback?.blockReason ?? "").toUpperCase();
  if (finishReason === "SAFETY" || blockReason) {
    throw new ProviderSafetyError("Gemini declined this request under its safety rules. Review the educational request and try again.");
  }
  const parts = candidate?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((part: any) => typeof part?.text === "string" ? part.text : "").filter(Boolean).join("\\n").trim() : "";
  if (!text) throw new Error("Gemini returned no readable text.");
  return text;
}
async function callGemini(messages: ProviderMessage[], options: Required<GenerationOptions>): Promise<string> {
  if (!geminiKey()) throw new Error("GEMINI_API_KEY is not configured.");
  if (!geminiPaidServiceConfirmed()) throw new Error("Gemini is not enabled: confirm active paid Gemini API billing before setting GEMINI_API_PAID_SERVICE_CONFIRMED=true.");
  const systemMessages = messages.filter(item => item.role === "system").map(item => typeof item.content === "string" ? item.content : JSON.stringify(item.content));
  if (options.systemPrompt) systemMessages.unshift(options.systemPrompt);
  const contents = messages.filter(item => item.role !== "system").map(item => ({
    role: item.role === "assistant" || item.role === "model" ? "model" : "user",
    parts: geminiParts(item.content),
  }));
  if (!contents.length) contents.push({ role: "user", parts: [{ text: "Return a concise educational response." }] });
  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey() },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        ...(systemMessages.length ? { systemInstruction: { parts: systemMessages.map(text => ({ text })) } } : {}),
        contents,
        generationConfig: {
          maxOutputTokens: options.maxTokens,
          thinkingConfig: { thinkingLevel: "low" },
          ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error("Gemini timed out after 30 seconds.");
    throw new Error("Gemini could not be reached.");
  }
  const raw = await response.text();
  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { /* Normalised below. */ }
  if (!response.ok) {
    const message = String(payload?.error?.message ?? "").replace(/\\s+/g, " ").slice(0, 220);
    throw new ProviderRequestError("Gemini API returned HTTP " + response.status + (message ? ": " + message : "."), response.status);
  }
  return validateOutput(parseGeminiText(payload), options.jsonMode, "Gemini");
}
function cloudflareText(payload: any): string {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const raw = choice?.message?.content;
  return typeof raw === "string" ? raw.trim()
    : Array.isArray(raw) ? raw.map((part: any) => typeof part === "string" ? part : typeof part?.text === "string" ? part.text : "").join("\\n").trim()
    : typeof choice?.text === "string" ? choice.text.trim() : "";
}
async function callCloudflareModel(model: string, messages: ProviderMessage[], options: Required<GenerationOptions>): Promise<string> {
  const { accountId, apiToken } = cloudflareCredentials();
  if (!accountId || !apiToken) throw new Error("Cloudflare Workers AI credentials are not configured.");
  const apiMessages = [
    ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
    ...messages.map(item => ({ role: item.role === "model" ? "assistant" : item.role, content: item.content })),
  ];
  let response: Response;
  try {
    response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/ai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiToken, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(50000),
      body: JSON.stringify({
        model, messages: apiMessages,
        max_completion_tokens: options.maxTokens,
        temperature: 0.25, stream: false, store: false,
        ...(model === GEMMA_MODEL ? { chat_template_kwargs: { enable_thinking: false, clear_thinking: true } } : { reasoning_effort: "low" }),
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error(model + " timed out after 50 seconds.");
    throw new Error(model + " could not be reached.");
  }
  const raw = await response.text();
  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { /* Normalised below. */ }
  if (!response.ok) {
    const details = Array.isArray(payload?.errors) ? payload.errors.map((item: any) => String(item?.message ?? "")).filter(Boolean).join("; ").slice(0, 200) : String(payload?.error?.message ?? "").slice(0, 200);
    throw new ProviderRequestError(model + " returned HTTP " + response.status + (details ? ": " + details : "."), response.status);
  }
  return validateOutput(cloudflareText(payload), options.jsonMode, model);
}
export async function generateWithFallback(messages: ProviderMessage[], options: GenerationOptions = {}): Promise<ProviderResult> {
  const config: Required<GenerationOptions> = {
    maxTokens: Math.max(64, Math.min(4000, Math.floor(options.maxTokens ?? 1800))),
    jsonMode: options.jsonMode === true,
    systemPrompt: String(options.systemPrompt ?? "").trim().slice(0, 12000),
  };
  const status = getProviderStatus();
  const failures: string[] = [];
  if (status.gemini.configured) {
    try {
      const text = await callGemini(messages, config);
      return { text, provider: "Google Gemini API", model: GEMINI_MODEL, fallbackUsed: false, providerNotice: null };
    } catch (error) {
      if (error instanceof ProviderSafetyError) throw error;
      failures.push(error instanceof Error ? error.message : "Gemini failed.");
    }
  } else {
    failures.push(geminiKey()
      ? "Gemini is disabled until active paid API billing is confirmed."
      : "GEMINI_API_KEY is not configured.");
  }
  const cloudflare = cloudflareCredentials();
  if (!cloudflare.accountId || !cloudflare.apiToken) {
    throw new Error(failures.join(" ") + " Gemma backup is not configured. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to Supabase Edge Function secrets.");
  }
  for (const model of [GEMMA_MODEL, CLOUDFLARE_SECONDARY_MODEL]) {
    try {
      const text = await callCloudflareModel(model, messages, config);
      const primaryFailure = failures[0] || "Gemini was unavailable.";
      const notice = model === GEMMA_MODEL
        ? "Gemini was unavailable (" + primaryFailure + "). Gemma 4 handled this request as the automatic backup."
        : "Gemini and Gemma 4 were unavailable. Qwen 3.8 completed the request as the secondary Cloudflare AI fallback.";
      return { text, provider: "Cloudflare Workers AI", model, fallbackUsed: true, providerNotice: notice };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : model + " failed.");
      if (error instanceof ProviderRequestError && [401, 403].includes(error.status)) break;
    }
  }
  throw new Error("All configured MIΛ AI models failed. " + failures.join(" | ").slice(0, 650));
}
