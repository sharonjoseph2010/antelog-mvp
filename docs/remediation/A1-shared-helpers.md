# A1 — Shared edge-function helpers

> Patch: [`SECURITY_REMEDIATION.md` §A1](../SECURITY_REMEDIATION.md#a1-shared-edge-function-helpers)

## Why this matters

Every edge function in this codebase repeats the same boilerplate: CORS headers, JWT identification, error handling. When boilerplate is copy-pasted, divergence is inevitable. Today's symptoms:

- One function uses `corsHeaders` with one set of allowed headers; another uses a slightly different list.
- Three functions read `userId` from the body; the fourth reads it from JWT.
- Two functions return `error.message`; one returns `error` (the whole error object — even worse).
- Rate limiting (when added) needs to land in seven places.

The single most leveraged refactor in this whole remediation is to extract these into `supabase/functions/_shared/`. Once done, fixing a class of bug (e.g., "log a correlation ID on every error") becomes a one-file change instead of seven.

This isn't a security fix per se — it's the *enabling* refactor that makes the other fixes maintainable.

## What's in the shared directory

| File | Responsibility |
|------|----------------|
| `_shared/cors.ts` | Origin-allowlisted CORS headers (see [#11](./11-cors.md)) |
| `_shared/auth.ts` | `identifyCaller(req)`, `requireAdmin(req)`, helpers that return `{ user, userClient }` or a 401/403 Response |
| `_shared/rate_limit.ts` | `enforceRateLimit(supabase, bucket, limit, windowSec)` returning 429 or null (see [#10](./10-rate-limiting.md)) |
| `_shared/validate.ts` | `parseBody<T>(req, schema)` that uses Zod and returns 400 on failure |
| `_shared/response.ts` | `errorResponse(status, message)`, `okResponse(body)` — standardised envelope |
| `_shared/logger.ts` | `log(correlationId, ...args)`, `logError(correlationId, err)` — structured logs |

Every function's `index.ts` then looks like:

```ts
import { corsFor } from '../_shared/cors.ts';
import { identifyCaller } from '../_shared/auth.ts';
import { enforceRateLimit } from '../_shared/rate_limit.ts';
import { parseBody } from '../_shared/validate.ts';
import { errorResponse, okResponse } from '../_shared/response.ts';

const bodySchema = z.object({ /* ... */ });

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const auth = await identifyCaller(req);
  if (auth.errorResponse) return auth.errorResponse;

  const limited = await enforceRateLimit(serviceClient, `fn-x:${auth.user.id}`, 20, 60);
  if (limited) return limited;

  const body = await parseBody(req, bodySchema);
  if ('errorResponse' in body) return body.errorResponse;

  // ...actual work...

  return okResponse({ ok: true });
});
```

The body of each function shrinks dramatically; the boilerplate is in one place.

## What might break

- **The first function migrated will reveal contract bugs in the helpers.** Plan to migrate one function end-to-end before doing the rest. Use `merge-recommendations` (which already has the right shape) as the template.
- **Tests for each function may have mocked the boilerplate.** They now need to mock the shared helpers instead. Or, better, integration-test against a real Supabase instance and let the helpers be exercised.
- **Deno's import resolution.** Edge functions use Deno; imports use URL or relative paths. `../_shared/cors.ts` works; ensure the path is correct from each function's directory.
- **Bundling.** Each function deploys as its own bundle. Shared helpers are included in each bundle (not deduplicated across functions); that's fine.

## Gotchas

- **Don't import from `npm:` packages in `_shared`.** Edge functions support `npm:` imports but they cost cold-start time. Use Deno-native or `https://esm.sh/...` URLs for consistency.
- **Don't put secrets in `_shared`.** Each function gets its own env via `supabase secrets set`. The helpers should read from `Deno.env.get(...)` and let each function configure its own keys.
- **Versioning.** When `_shared/auth.ts` changes, *all* functions are affected. Test each function's invocation after a helper change. CI should run an integration smoke against every deployed function.
- **Circular imports.** `auth.ts` may need `response.ts` for its 401 envelope; `response.ts` may need `cors.ts` for headers. Keep the dependency graph one-directional: `cors → response → validate → auth → rate_limit`, roughly.
- **Type safety across functions.** If `parseBody<T>` returns `T`, each function defines its own `T`. Good. Don't try to share schemas across functions unless they really are the same shape.

## Common pitfalls

### Pitfall: Over-abstracting too early.

Don't introduce a "middleware framework" with `before`/`after` hooks. Plain function composition is clearer for seven functions. Reach for abstraction when the cost of *not* having it is concrete (which is now), not speculative.

### Pitfall: Helpers that throw instead of returning Response.

Throwing inside an edge function is fine if you have a top-level catch, but it makes control flow harder to follow. Prefer the "return errorResponse or continue" pattern — it's verbose but explicit.

### Pitfall: Shared mutable state in `_shared`.

```ts
// _shared/something.ts
let cache = {};
export function get(k) { return cache[k]; }
```

Edge functions can share instances across requests if hot. Mutable module-level state turns into a cache that leaks across users. Avoid; if you need caching, use Postgres-backed.

### Pitfall: Forgetting to update `supabase/config.toml` after splitting auth pattern.

If `_shared/auth.ts` calls `auth.getUser()` itself, then `verify_jwt = true` in config is redundant. Either remove it (and let the helper enforce) or keep it (and trust the platform). Pick one approach and document it.

### Pitfall: Coupling `_shared` to Supabase specifically.

If you later move off Supabase, `_shared` shouldn't be a rewrite. Keep helpers thin and Supabase-agnostic where possible. E.g., the rate limiter takes a `client` parameter; it doesn't import Supabase directly.

### Pitfall: Tests not aware of `_shared`.

If you write tests with a local mock client, they'll need to inject the mock into helpers too. Design helpers to accept the client as a parameter, not import it from a hardcoded path.

### Pitfall: Deployment order.

When you migrate function X to use `_shared/...`, you must deploy *together* with the helper files. Supabase CLI deploys each function as its own bundle. If `_shared` is referenced via relative imports, the bundle includes them. Verify with `supabase functions deploy --debug` once.

### Pitfall: Backward compatibility shims.

While migrating, you'll be tempted to leave the old boilerplate alongside the new helper for "compatibility." Don't. Migrate one function, deploy it, verify in staging, then migrate the next. Half-migrated functions are the worst of both worlds.

## Product behavior changes

- None directly. This is internal refactoring.
- Indirectly: bugs fixed once in helpers benefit all functions; new functions added later are cheaper to write.

## Verification checklist

- [ ] All seven existing edge functions migrated to use `_shared/*` helpers.
- [ ] Each function's `index.ts` is meaningfully shorter than before.
- [ ] Adding a new edge function takes <50 lines for boilerplate.
- [ ] A change to `_shared/cors.ts` requires only that file (and a redeploy of all functions).
- [ ] CI smoke-tests every function after a helper change.
- [ ] No mutable module-level state in `_shared/*`.
