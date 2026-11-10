const APP_ORIGIN = "https://mayendzeke.github.io";
const headers = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};

Deno.serve(request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers });
  }
  if (request.headers.get("Origin") !== APP_ORIGIN) {
    return new Response(JSON.stringify({ error: "This StudySpace origin is not allowed." }), { status: 403, headers });
  }
  return new Response(JSON.stringify({
    error: "Pre-registration enrolment PINs are retired. New learners register directly in StudySpace Student; renewal PINs are issued only after an existing learner's 48-hour trial or paid access expires."
  }), { status: 410, headers });
});
