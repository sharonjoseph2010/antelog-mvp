// Origin-restricted CORS (security finding #11).
//
// The previous `Access-Control-Allow-Origin: *` let any origin — including a
// phishing page — invoke the functions with a victim's token. We instead echo
// the request origin only when it is on an allowlist. The allowlist is
// dev-localhost by default and extended in production via the `ALLOWED_ORIGINS`
// env var (comma-separated), so deploy targets don't require a code change.
//
// JWT-protected functions still require a valid token regardless of CORS; this
// is defense-in-depth against token-replay from untrusted origins.

const DEFAULT_ALLOWED = [
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
];

function allowlist(): string[] {
  const fromEnv = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED, ...fromEnv];
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = allowlist();
  // For a disallowed origin we still send a header, but a non-matching one, so
  // the browser blocks the response. Same-origin / non-browser callers (cron)
  // send no Origin and are unaffected.
  const allowOrigin = allowed.includes(origin) ? origin : (allowed[0] ?? "null");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
