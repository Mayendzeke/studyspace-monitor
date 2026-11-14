export const GEMMA_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const SECONDARY_MODEL = "@cf/qwen/qwen3.8-27b";

export type ProviderMessage = { role: "system" | "user" | "assistant"; content: string };
export type ProviderResult = { text: string; provider: "Cloudflare Workers AI"; model: string; fallbackUsed: boolean };

class ProviderRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ProviderRequestError"; }
}
function credentials() {
  return {
    accountId: Deno.env.get("CLOUDFLARE_ACCOUNT_ID")?.trim() ?? "",
    apiToken: Deno.env.get("CLOUDFLARE_API_TOKEN")?.trim() ?? "",
  };
}
function completionText(payload: any): string {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const raw = choice?.message?.content;
  return typeof raw === "string" ? raw.trim()
    : Array.isArray(raw) ? raw.map((part: any) => typeof part === "string" ? part : typeof part?.text === "string" ? part.text : "").join("\n").trim()
    : typeof choice?.text === "string" ? choice.text.trim() : "";
}
function cleanJson(text: string): string {
  return text.trim().replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "").trim();
}
async function callModel(model: string, messages: ProviderMessage[], maxTokens: number): Promise<string> {
  const { accountId, apiToken } = credentials();
  if (!accountId || !apiToken) throw new Error("Cloudflare Workers AI credentials are not configured.");
  let response: Response;
  try {
    response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiToken, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(35000),
      body: JSON.stringify({
        model, messages, max_completion_tokens: maxTokens, temperature: 0.1,
        stream: false, store: false, response_format: { type: "json_object" },
        ...(model === GEMMA_MODEL ? { chat_template_kwargs: { enable_thinking: false, clear_thinking: true } } : { reasoning_effort: "low" }),
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
  const text = completionText(payload);
  if (!text) throw new Error(model + " returned an empty marking response.");
  const candidate = cleanJson(text);
  const parsed = JSON.parse(candidate);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.marks)) {
    throw new Error(model + " returned an invalid marking result.");
  }
  return JSON.stringify(parsed);
}
export async function markWithCloudflare(messages: ProviderMessage[]): Promise<ProviderResult> {
  const { accountId, apiToken } = credentials();
  if (!accountId || !apiToken) throw new Error("Cloudflare Workers AI credentials are not configured.");
  const failures: string[] = [];
  for (const [index, model] of [GEMMA_MODEL, SECONDARY_MODEL].entries()) {
    try {
      return { text: await callModel(model, messages, 2400), provider: "Cloudflare Workers AI", model, fallbackUsed: index > 0 };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : model + " failed.");
      if (error instanceof ProviderRequestError && [401, 403].includes(error.status)) break;
    }
  }
  throw new Error("MIΛ marking is temporarily unavailable. " + failures.join(" | ").slice(0, 450));
}
