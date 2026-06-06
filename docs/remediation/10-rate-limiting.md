# 10 — Rate limiting middleware

> Patch: [`SECURITY_REMEDIATION.md` §10](../SECURITY_REMEDIATION.md#10-rate-limiting-middleware)

## Why this matters

Zero rate limiting exists today. Three concrete failure modes:

1. **LLM cost amplification.** `ai-smart-suggestions` calls Gemini on every keystroke-driven request. A logged-in user can pin a `while (true) supabase.functions.invoke(...)` loop and run up the bill until the API key hits its quota — at which point the feature breaks for everyone.
2. **Auth brute force.** Login/signup take unlimited attempts. Without server-side rate limiting (Supabase Auth's defaults, which aren't configured in this codebase), credential stuffing is trivial.
3. **Mass mutation triggers.** `rematch-contacts`, `ai-normalize-entries`, `merge-recommendations` are heavyweight. Even after the per-user / admin scoping fixes (Block 1), nothing stops a legit user from invoking them in a tight loop and pinning workers.

Rate limiting is not optional once an app accepts JWTs from anywhere on the internet. The question is only *how* to implement it.

## Architecture choice

| Approach | Pros | Cons |
|----------|------|------|
| Postgres-backed sliding window (proposed) | Same DB you already have; no new infra; trivially auditable | Limited throughput; long buckets cause table growth |
| Upstash / Redis | Fast; designed for this | New external dep; another secret to manage |
| Cloudflare Workers / Fastly | Per-IP at the edge; very fast | Doesn't see auth context; cost; setup |
| In-memory per-function | Free | Per-instance; doesn't survive cold starts; no cross-function coordination |

The Postgres approach is the right starting point: simple, observable, works today. Move to Upstash if you hit throughput limits (the limiter table starts being a hot row in `pg_locks`).

## What might break

- **Anything that legitimately bursts.** A user who imports 5,000 contacts triggers a chain of edge function calls in seconds. The default limits in the remediation doc are conservative; tune per-endpoint.
- **CI / load tests.** Any test harness that calls AI endpoints in a loop will hit 429s. Tests need a way to disable or relax the limiter (e.g., a header that the limiter recognises only in non-prod, gated by an env var).
- **First-time users.** New users may hit "low" limits during onboarding (profile setup triggers expertise inference, etc.). Either raise the first-day limit or implement a "warm-up" allowance.
- **Cron jobs that share an account.** If `pg_cron` calls a function as the service role, the limiter keyed on `user_id` won't apply — that's fine. But if it calls as a real user (e.g., a system user), that user will hit limits quickly. Bypass the limiter for service-role calls.

## Gotchas

- **Clock skew.** The proposed limiter uses `now()` server-side, which is fine. Don't use client-supplied timestamps for window calculations — trivially bypassable.
- **The cleanup `DELETE` inside `check_rate_limit` runs every call.** For high-traffic buckets that's wasteful. Add a separate cron that prunes old rows hourly, and let the function only `INSERT` + count.
- **Table bloat.** `rate_limit_log` will grow. Without index maintenance, the bucket-and-time query slows down. Add the index from the patch and `VACUUM` regularly. Consider partitioning by day for very high traffic.
- **Lock contention on the rate-limit insert.** Under heavy load, every request takes a row-level lock on the same bucket. For >1k QPS on a single bucket, Postgres becomes the bottleneck. Move to Redis at that scale.
- **`429 Too Many Requests` + `Retry-After`.** Always include the header. Clients that respect it back off; clients that ignore it keep hammering, which is informative for telemetry.
- **Distinguishing legitimate burst from attack.** A legitimate user batch-importing might burst once per day; an attacker bursts continuously. Long-window limits (e.g., 1000 per day) catch attackers but not legit users. Short windows (20 per minute) catch UI-driven spam. Use both layers.
- **Rate-limiting login is harder than it looks.** You can't key by `user_id` because the user isn't logged in yet. Key by `email + IP` for login attempts:

  ```
  bucket = `login:${sha256(email.toLowerCase())}:${ip}`
  ```

  Salt the email hash with a server secret to avoid making the limiter table a pseudo-credential-list.
- **IP-based limits behind a proxy.** Supabase Edge Functions see the proxied IP via `req.headers.get('x-forwarded-for')`. Trust *only the first* IP in the list (the client) and ignore the rest, which a malicious client controls.

## Common pitfalls

### Pitfall: Limiter inside a `try` that catches everything.

```ts
try {
  await enforceRateLimit(...);
  return doWork();
} catch (e) {
  return new Response('Internal error', { status: 500 });
}
```

If the limiter itself errors (DB down), this swallows the 429 and the function proceeds. Either fail-open (proceed without limiting) or fail-closed (return 503). Pick deliberately; don't default by accident. For DB-backed limiters, **fail-open** is often right because the DB outage will already break the function downstream; but for security-critical endpoints (auth), fail-closed.

### Pitfall: Per-user limit only — no global cap.

A targeted attack via 1,000 fresh sign-ups hits 1,000 × per-user limit = effectively unlimited. Layer in a *global* limit on expensive endpoints (e.g., total Gemini calls per minute across all users). Postgres-backed limiter handles this naturally with bucket = `'global:ai-smart-suggestions'`.

### Pitfall: Limiting on JWT subject when JWTs are reusable.

If a user can mint JWTs faster than the limiter window, they bypass. Supabase doesn't easily support per-user JWT minting at high rate, so this is theoretical here, but worth knowing: the limiter assumes the JWT subject is stable per real user.

### Pitfall: 429 retries without backoff.

The supabase-js client doesn't retry 429s by default. Application code that does retry (`if (error.status === 429) retry()`) without exponential backoff turns the limiter into a busy-wait. Always honour `Retry-After`.

### Pitfall: Logging full request bodies on 429.

For abuse investigation you want some log, but logging the full body amplifies storage costs during an attack. Log bucket key, IP, JWT subject, and a request hash. Keep it short.

### Pitfall: Limiter as a single point of failure.

If `check_rate_limit` is a `SECURITY DEFINER` function and it breaks, every edge function breaks. Test the limiter independently. Add a fast-path that bypasses the limiter if a feature flag is off (`if (Deno.env.get('DISABLE_RATE_LIMITS')) return;`) so you can disable it during incidents.

### Pitfall: Inconsistent limits across functions for the same operation.

If two edge functions both call Gemini and only one is limited, attackers will pivot to the unlimited one. Audit every external-API caller and apply limits uniformly.

### Pitfall: Forgetting captcha on auth.

A rate-limited login endpoint still allows N attempts per window. Captcha forces *human* effort per attempt. Use both: captcha gates the form; the limiter caps total attempts per window per IP/email.

## Product behavior changes

- A user spamming the AI-suggest input will see suggestions slow down or stop briefly.
- Repeated login failures get a brief lockout.
- Triggering `rematch-contacts` more than once per hour returns 429 with a friendly retry-after.

## Verification checklist

- [ ] 21st call to `ai-smart-suggestions` within 60s returns 429 with `Retry-After: 60`.
- [ ] Login failing 5 times in a minute (or chosen threshold) returns 429.
- [ ] Global limit caps total Gemini calls across all users to a budget-safe number.
- [ ] `rate_limit_log` table has the index and is being pruned (no unbounded growth after a week).
- [ ] CI/test harness can opt out of limits via a flag.
- [ ] Limiter outage does not silently let calls through (or, if intentional, is logged loudly).
