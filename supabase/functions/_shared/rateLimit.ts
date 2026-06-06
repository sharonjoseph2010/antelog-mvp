// Per-caller rate limiting (finding #10).
//
// Backed by the `check_rate_limit` SECURITY DEFINER RPC (sliding window over
// the `rate_limit_log` table — see the security migration). Call it as the
// first step after authorizing the caller.
//
// Fails OPEN: if the limiter infrastructure errors, requests are allowed rather
// than taking the whole feature down. The trade-off is acceptable because the
// limiter is a cost/abuse guard, not an authn/authz boundary.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds?: number;
}

export async function enforceRateLimit(
  admin: SupabaseClient,
  key: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await admin.rpc("check_rate_limit", {
      _key: key,
      _action: action,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rateLimit] check_rate_limit failed, allowing:", error.message);
      return { ok: true };
    }
    return data === true ? { ok: true } : { ok: false, retryAfterSeconds: windowSeconds };
  } catch (e) {
    console.error("[rateLimit] exception, allowing:", e instanceof Error ? e.message : String(e));
    return { ok: true };
  }
}
