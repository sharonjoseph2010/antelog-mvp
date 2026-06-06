// JSON response helpers with CORS + sanitized error surface (finding #15).
//
// `fail` logs the real error server-side (Supabase function logs are private)
// but returns a generic message to the client, so DB error text — schema
// names, FK/policy names — never leaks to callers.

import { corsHeaders } from "./cors.ts";

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export function preflight(req: Request): Response {
  return new Response("ok", { headers: corsHeaders(req) });
}

export function fail(
  req: Request,
  label: string,
  err: unknown,
  status = 500,
  publicMessage = "Something went wrong. Please try again.",
): Response {
  console.error(`[${label}]`, err instanceof Error ? err.message : String(err));
  return json(req, { error: publicMessage }, status);
}
