// Read the assurance claim from the exact access token that Supabase Auth
// has just validated with getUser(token). Do not rely on a local session in
// Edge Functions: their server-side clients intentionally do not persist one.
export function getTokenAssuranceLevel(accessToken: string): string | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded)) as { aal?: unknown };
    return typeof claims.aal === "string" ? claims.aal : null;
  } catch {
    return null;
  }
}
