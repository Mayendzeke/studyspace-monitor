export const GEMMA_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const SECONDARY_MODEL = "@cf/qwen/qwen3.8-27b";

export type ProviderMessage = { role: "system" | "user" | "assistant" | "model"; content: unknown };
export type ProviderResult = {
  text: string;
  provider: "Cloudflare Workers AI";
  model: string;
  fallbackUsed: boolean;
  providerNotice: string | null;
};
type GenerationOptions = { maxTokens?: number; jsonMode?: boolean; requiredJsonKeys?: string[] };

class ProviderRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ProviderRequestError"; }
}
function cloudflareCredentials() {
  return { accountId: Deno.env.get("CLOUDFLARE_ACCOUNT_ID")?.trim() ?? "", apiToken: Deno.env.get("CLOUDFLARE_API_TOKEN")?.trim() ?? "" };
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
function completionText(payload: any): string {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const raw = choice?.message?.content;
  return typeof raw === "string" ? raw.trim()
    : Array.isArray(raw) ? raw.map((part: any) => typeof part === "string" ? part : typeof part?.text === "string" ? part.text : "").join("\n").trim()
    : typeof choice?.text === "string" ? choice.text.trim() : "";
}
async function callModel(model: string, messages: ProviderMessage[], options: Required<GenerationOptions>): Promise<string> {
  const { accountId, apiToken } = cloudflareCredentials();
  if (!accountId || !apiToken) throw new Error("Cloudflare Workers AI credentials are not configured.");
  const apiMessages = messages.map(item => ({ role: item.role === "model" ? "assistant" : item.role, content: item.content }));
  let response: Response;
  try {
    response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/ai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiToken, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(35000),
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
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error(model + " timed out after 35 seconds.");
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
  const credentials = cloudflareCredentials();
  if (!credentials.accountId || !credentials.apiToken) throw new Error("Cloudflare Workers AI credentials are not configured. Ask the StudySpace administrator to check server-side credentials.");
  const failures: string[] = [];
  for (const [index, model] of [GEMMA_MODEL, SECONDARY_MODEL].entries()) {
    try {
      const text = await callModel(model, messages, config);
      return {
        text, provider: "Cloudflare Workers AI", model, fallbackUsed: index > 0,
        providerNotice: index > 0 ? "Gemma 4 was unavailable for this request. Qwen 3.8 completed it as the secondary Cloudflare AI model." : null,
      };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : model + " failed.");
      if (error instanceof ProviderRequestError && [401, 403].includes(error.status)) break;
    }
  }
  throw new Error("StudySpace's learner AI models are currently unavailable. " + failures.join(" | ").slice(0, 500));
}
