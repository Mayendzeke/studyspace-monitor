const configuredOrigin = Deno.env.get("APP_ORIGIN") ?? "";
const allowedOrigin = (() => {
  try { return new URL(configuredOrigin).origin; }
  catch { return ""; }
})();
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin || "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve((request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const origin = request.headers.get("Origin");
  if (!allowedOrigin || origin !== allowedOrigin) {
    return json(403, { error: "This Study Space origin is not allowed." });
  }
  return json(503, {
    error: "MIA is temporarily paused while Study Space verifies an AI provider and data-processing arrangement suitable for its school-age learning service. Prompts, attachments and lesson material are not sent to an AI provider through this service.",
  });
});
