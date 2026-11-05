// Read the assurance claim from the exact access token that Supabase Auth
// has just validated with getUser(token). Edge Functions must not rely on a
// locally persisted session to determine the caller's MFA assurance level.
export function getTokenAssuranceLevel(accessToken: string): string | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { aal?: unknown };
    return typeof claims.aal === "string" ? claims.aal : null;
  } catch {
    return null;
  }
}
