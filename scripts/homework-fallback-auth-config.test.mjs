import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = readFileSync("supabase/config.toml", "utf8");
const fallback = readFileSync("supabase/functions/process-homework-fallbacks/index.ts", "utf8");

test("scheduled homework fallback keeps its explicit private-token authentication mode", () => {
  assert.match(
    config,
    /\[functions\.process-homework-fallbacks\]\s*\n\s*verify_jwt\s*=\s*false/,
    "The deployed cron-token function must be declared with verify_jwt=false in source control.",
  );
  assert.match(config, /\[functions\.generate-homework\]\s*\n\s*verify_jwt\s*=\s*true/);
  assert.match(config, /\[functions\.reply-homework-help\]\s*\n\s*verify_jwt\s*=\s*true/);
  assert.match(fallback, /request\.headers\.get\(["']x-studyspace-cron-token["']\)/);
  assert.match(fallback, /verify_studyspace_homework_cron_token/);
});
