# 11 — CORS — origin allowlist

> Patch: [`SECURITY_REMEDIATION.md` §11](../SECURITY_REMEDIATION.md#11-cors--restrict-to-known-origins)

## Why this matters

Every edge function returns `Access-Control-Allow-Origin: *`. CORS is widely misunderstood, so spell out what changes and what doesn't:

- **CORS is a browser-enforced policy, not a server-side ACL.** A wildcard `*` means *any web page* can send a `fetch` request to your function and read the response. It does **not** authorize the request — JWT verification still happens. So `*` doesn't directly grant data access; it grants the *ability for a malicious page to use a victim's stolen credentials*.
- **With wildcard CORS, a phishing page at `evil.example.com` can call your edge function with a stolen JWT** (extracted from a victim's localStorage via XSS, or from a leaked debug log) and read the response in JavaScript. With an origin allowlist, the browser refuses to expose the response to the attacker's page even if the request itself succeeded.
- **CORS does not protect against non-browser callers.** `curl`, server-side requests, and mobile apps ignore CORS entirely. Tightening CORS is purely about browser-side defenses.

The wildcard is appropriate for genuinely public APIs (e.g., a static health endpoint). For auth-bearing endpoints, it's a footgun.

## What might break

- **Local dev.** `http://localhost:5173` (Vite's default port) must be in the allowlist, or local dev breaks with CORS errors.
- **Preview deployments.** If Lovable or Vercel spins up branch previews at random URLs (`pr-123-myapp.vercel.app`), each must either be in the allowlist or use a wildcard pattern. Hard-coding all subdomains isn't reasonable.
- **Mobile webviews.** Webviews using `https://your-app.com` as origin work fine; webviews loading via `file://` or custom schemes do not have a standard `Origin` header. Test on the actual mobile entrypoints if any.
- **Server-to-server calls.** No `Origin` header, no problem — the function must not require one. The current pattern reflects whatever `Origin` was sent; for missing `Origin`, return without an `ACAO` header (which is fine for server-side callers).
- **Embedded contexts (iframes).** If your app is ever embedded in another site (e.g., a partner integration), that site's origin must be in the allowlist. Audit any planned embeds before locking down.

## Gotchas

- **`Access-Control-Allow-Credentials: true` + `*` is forbidden by the spec.** Browsers reject this combo. You currently don't send credentials (cookies) cross-origin, but if you ever do, the wildcard must go.
- **Origin reflection has a bug surface.** "Reflect the Origin if it's in the allowlist" is the standard pattern. The pitfall is reflecting *whatever the client sends* with no validation, which is equivalent to `*` but harder to debug.
- **`Vary: Origin` is mandatory** when the response depends on origin, otherwise CDN/proxy caches will serve the wrong origin's response to other callers.
- **Preflight (`OPTIONS`) matters as much as the real call.** Both must return the same `Access-Control-Allow-Origin`. Forgetting to update the OPTIONS handler is the #1 cause of "it works in curl but not in the browser."
- **Headers list.** `Access-Control-Allow-Headers` must include every custom header the client sends, including `apikey`, `authorization`, `x-client-info`, `content-type`. Supabase clients send all of these.
- **Methods.** Most functions only accept POST; reflecting that in `Access-Control-Allow-Methods` prevents weird method-confusion attacks at the CORS layer.

## Common pitfalls

### Pitfall: Allowing `null` as an origin.

When a page is loaded from `file://` or a sandboxed iframe, browsers send `Origin: null`. Some servers reflect this. `null` is the most-shared origin on the internet — every sandboxed iframe of every site sends it. Never include `null` in the allowlist.

### Pitfall: Wildcards in the allowlist parsed as regex.

```ts
allowed.some(pattern => origin.match(pattern))  // dangerous
```

If `pattern` is user-configurable via env var and someone writes `^https://.*$`, you've re-introduced `*`. Stick to exact matches; if you need subdomain wildcards, use a strict format like `https://*.your-app.com` and parse it explicitly:

```ts
function originMatches(origin: string, allowed: string): boolean {
  if (allowed === origin) return true;
  if (allowed.startsWith('https://*.')) {
    const suffix = allowed.slice('https://*.'.length);
    const got = origin.replace(/^https:\/\//, '');
    return got === suffix || got.endsWith('.' + suffix);
  }
  return false;
}
```

### Pitfall: Trusting the `Referer` header instead of `Origin`.

`Referer` is the full URL of the referring page; `Origin` is just the scheme + host. CORS uses `Origin`. Some developers conflate them. The `Referer` header is also more often stripped by privacy settings, so it's not reliable.

### Pitfall: Forgetting to update the allowlist when domains change.

When you rename the prod domain or switch hosting providers, the allowlist breaks. Keep it in env vars, not source, so it's a deploy-time config change.

### Pitfall: Different functions, different allowlists.

If five functions each maintain their own CORS code, they will drift. Centralise in `_shared/cors.ts` (see [A1](./A1-shared-helpers.md)) and import everywhere.

### Pitfall: Localhost on a non-default port.

Vite's port can be overridden. If a teammate runs on `:3000` instead of `:5173`, they hit CORS errors. Either standardise the dev port (recommended) or allow `http://localhost:*` in dev only.

### Pitfall: Mobile push notification deep-links.

If the app handles deep links from native notifications, those don't have an Origin. They work because they don't go through CORS. But if your code asserts the presence of `Origin`, it'll break. Treat missing Origin as "no Origin", not "untrusted".

### Pitfall: CDN caching responses with the wrong CORS header.

Without `Vary: Origin`, a Cloudflare or browser cache fetches a response for origin A and serves it to origin B. The browser then refuses to expose it (because the `ACAO` matches A, not B), so the user sees a CORS error for a request that should have worked. Always set `Vary: Origin` when ACAO is conditional.

## Product behavior changes

- A page hosted on a non-allowlisted origin can no longer call your edge functions from JavaScript (the browser blocks the response).
- Server-to-server and mobile native callers are unaffected.
- Browser dev tools show CORS errors for any misconfigured origin, which is *desired* — easier to detect drift.

## Verification checklist

- [ ] `ALLOWED_ORIGINS` env var is set per environment.
- [ ] From `http://localhost:5173`, `fetch('https://<project>.supabase.co/functions/v1/ai-smart-suggestions', ...)` works.
- [ ] From `http://localhost:9999` (not in allowlist), the same call fails with CORS error in the browser console.
- [ ] OPTIONS preflight returns the same `ACAO` as the POST response.
- [ ] `Vary: Origin` is present on all CORS responses.
- [ ] Server-side callers (no Origin) continue to receive responses.
