// Supabase now injects named API keys as JSON maps. Keep legacy fallbacks
// during the transition so existing deployments continue to work.
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

export function getPublishableKey(): string {
  return getNamedKey("SUPABASE_PUBLISHABLE_KEYS")
    ?? Deno.env.get("SUPABASE_ANON_KEY")
    ?? "";
}

export function getSecretKey(): string {
  return getNamedKey("SUPABASE_SECRET_KEYS")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? "";
}
