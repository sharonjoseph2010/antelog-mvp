# 03 — `ai-update-user-expertise` — derive identity from JWT

> Patch: [`SECURITY_REMEDIATION.md` §3](../SECURITY_REMEDIATION.md#3-ai-update-user-expertise--derive-identity-from-jwt)

## Why this matters

The current function reads `{ userId }` from the request body and uses it directly with the service-role key to read the target user's lists and write to `user_expertise`. The JWT in the `Authorization` header is verified by Supabase (because `verify_jwt = true` in config), so the caller *is* authenticated — but the function never checks that the JWT's user matches the body's `userId`.

This is the textbook IDOR. The caller proves who *they* are; the function then trusts the caller about who *the target* is. Attack:

```ts
await supabase.functions.invoke('ai-update-user-expertise', {
  body: { userId: '<some-other-user-id>' }
});
```

Result: I rewrite your expertise profile with whatever Gemini infers from *your* public lists, attributed to you, but at a time of my choosing. Worse, with RLS off (see [#01](./01-reenable-rls.md)), I can also enumerate user IDs trivially.

The fix is to ignore the body parameter entirely and use `auth.getUser()` against the caller's JWT.

## What might break

- **Anywhere on the frontend that passes `userId` in the body.** A grep across `src/` for `ai-update-user-expertise` will surface those call sites — they now need to either omit `userId` (preferred) or accept that the parameter is ignored.
- **Cron/admin flows that update expertise for *other* users.** If there's a code path where, say, an admin re-runs expertise inference for a specific user during a deduplication pass, that path needs a separate function (e.g., `admin-update-user-expertise`) gated on `user_roles.role = 'admin'`.
- **Service-to-service callers.** None observed in this codebase, but if a backend job ever calls this function, it can't authenticate as a user via JWT. Either pass through the user's JWT it's acting on behalf of, or split the admin path.

## Gotchas

- **`auth.getUser()` requires the JWT to be on a *user-scoped* client, not the service-role client.** A common bug: people create a single client with the service role key and call `auth.getUser()` on it. That returns the service role's user (effectively no user), not the caller. You need a second client built with the anon key and the caller's `Authorization` header.
- **Two clients per function are normal.** One JWT-scoped client to identify the caller; one service-role client to do work that needs to bypass RLS. Don't share them.
- **`auth.getUser()` is an HTTP roundtrip.** Every function call now does an extra request to Supabase Auth. Cache the result *within the function invocation* (a single call early on); don't call it repeatedly.
- **Missing `Authorization` header.** Even though Supabase config enforces `verify_jwt = true`, defensive code should still check for the header and return 401 explicitly. `verify_jwt` will reject unsigned requests at the edge, but the explicit check makes the function safe if config drifts.
- **Service role usage logging.** Once you fix this, the service-role client is only used for the *write*, not for identifying the caller. Make sure the write itself targets `user_expertise` for the JWT user, not for some other-derived ID.
- **Gemini call timing.** The function calls Gemini with the user's list titles/descriptions. With the fix, only the caller's own data flows to Gemini. That's good. But the surface for [prompt injection](./12-prompt-injection.md) is still there — the caller can craft a list title designed to manipulate the model's output, then trigger the function. Mitigation is in #12, not here.

## Common pitfalls

### Pitfall: Keeping `userId` in the body "for compatibility" but ignoring it server-side.

If you accept the parameter and silently override it with `auth.getUser()`, a confused caller might assume the param is honored. Better to:

1. If `body.userId` is present and differs from `user.id`, return `400 Bad Request` with `"userId param is no longer supported; identity is derived from JWT"`.
2. Or remove the param from the TypeScript interface entirely and let the type checker catch all call sites.

### Pitfall: Leaving the function as service-role-only and forgetting that means it can still mutate any row.

Fixing identity derivation does *not* automatically scope the writes. You still need to ensure every `.from('user_expertise').upsert(...)` carries `user_id: user.id`. Audit each query in the function body, not just the entry point.

### Pitfall: Race with the front-end calling pattern.

If the frontend was calling `invoke('ai-update-user-expertise', { body: { userId: currentUser.id } })`, swapping in the JWT-derived identity is a no-op for that call. But the *change in contract* means a stale browser session (someone on the old SPA before the deploy) will keep sending the param. Server-side ignoring is fine; just don't 400 on the legacy param until all clients are upgraded. Compromise: warn-and-ignore for a release, then 400.

### Pitfall: Tests using a baked-in test user ID in the body.

Any integration test that injects `{ userId: 'test-user-uuid' }` and doesn't set an Authorization header will start failing. Update the test harness to mint a real JWT for the test user (Supabase's `supabase.auth.admin.generateLink` or test-only `signInWithPassword`) and let the function derive identity normally.

### Pitfall: Forgetting the same flaw in sibling functions.

The same anti-pattern exists in `rematch-contacts` and `ai-normalize-entries` ([#04](./04-rematch-contacts.md), [#05](./05-ai-normalize-entries.md)). Fix all three in one PR to avoid playing whack-a-mole.

### Pitfall: Edge function deployments are per-function.

After the patch, you must `supabase functions deploy ai-update-user-expertise`. Forgetting this leaves prod running the vulnerable version.

## Product behavior changes

- The "refresh my expertise tags" UX (if it exists) continues to work for the logged-in user.
- Any admin tool that updated expertise for arbitrary users no longer works through this function. If that flow exists, it needs an admin-gated variant.
- Telemetry on this function changes: previously logs might have shown one user invoking it for another; now the body is the empty payload (or absent) and the JWT subject is the canonical user.

## Verification checklist

- [ ] Invoking the function with user A's JWT and `{ "userId": "<B>" }` in the body either updates A's expertise (preferred) or returns 400.
- [ ] Invoking with no Authorization header returns 401.
- [ ] Database row for `user_expertise` is created/updated only for the JWT's `auth.uid()`.
- [ ] Edge function logs no longer show a divergence between JWT subject and DB write target.
- [ ] `grep -rn "ai-update-user-expertise" src/` — all call sites no longer send `userId`, or are updated to expect it being ignored.
