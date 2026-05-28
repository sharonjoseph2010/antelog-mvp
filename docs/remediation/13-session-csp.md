# 13 — Session storage + Content-Security-Policy

> Patch: [`SECURITY_REMEDIATION.md` §13](../SECURITY_REMEDIATION.md#13-session-storage--accept-localstorage-harden-xss)

## Why this matters

Supabase stores the session JWT in `localStorage` by default (`src/integrations/supabase/client.ts:13`). The realistic threat model:

- **Any successful XSS in the SPA reads the JWT in one line:** `localStorage.getItem('sb-<project>-auth-token')`. The attacker then has a valid session against your API, until the token expires (typically 1 hour) and they refresh it (refresh tokens are also in localStorage).
- **httpOnly cookies would prevent JavaScript from reading the token**, eliminating the XSS-to-credential pivot. But Supabase's standard SDK does not support httpOnly cookies for browser SPAs without a custom backend.

The pragmatic remediation, given the SDK constraint, is to **drive the XSS risk to zero** rather than try to switch storage backends. The two big levers:

1. **Content-Security-Policy (CSP):** an HTTP header that the browser enforces, restricting what scripts can run and where. A strong CSP makes XSS substantially harder to exploit — even if an attacker can inject a `<script>` tag, the browser refuses to execute it.
2. **Static code prevention:** ESLint rules + code review patterns that block the introduction of new XSS sinks (`dangerouslySetInnerHTML`, etc.).

CSP is one of the highest leverage security controls available, and it costs almost nothing once configured.

## What might break

- **Third-party widgets.** Analytics (Google Analytics, Mixpanel), error reporting (Sentry), heatmaps (Hotjar), embedded chat (Intercom) all inject scripts. Each one needs its domain explicitly allowed in `script-src`.
- **Inline styles.** Many React libraries (including Radix, shadcn) generate inline styles. `style-src 'unsafe-inline'` is in the proposed CSP for this reason. Removing it requires moving all dynamic styles to nonces or hashes.
- **Inline scripts.** The proposed CSP excludes `'unsafe-inline'` for `script-src`. If anything ships an inline `<script>` (e.g., a tracking pixel pasted into `index.html`), it stops working. Check `index.html` and any HTML-template injections.
- **Eval / new Function.** Some libraries use `eval` for code generation (older `chart.js`, some `markdown` renderers). `unsafe-eval` is excluded; check that nothing in the dep tree needs it. Run the app with browser DevTools open and watch for CSP violation reports.
- **Browser extensions.** Some users have extensions that inject scripts. With a strict CSP, those extensions may break parts of the app for those users. Generally unavoidable and acceptable.
- **Hot module reload in dev.** Vite's HMR uses inline scripts. Either ship a relaxed CSP in dev (no inline restrictions) or accept that HMR breaks under strict CSP. The pragmatic answer: differ CSP per environment.

## Gotchas

- **CSP is set at the host layer, not in `index.html`.** Vercel, Netlify, Cloudflare Pages, and Lovable's hosting each have a different mechanism (`vercel.json`, `_headers`, etc.). The CSP in `<meta>` works but is weaker — it doesn't cover initial network responses.
- **`connect-src` must include every domain your app talks to.** Supabase project URL, Supabase realtime websocket (`wss://`), Gemini API (if called from browser — it isn't here, fortunately), analytics endpoints, error tracking. Missing one breaks the feature with no visible UI change, only a console error.
- **`frame-ancestors 'none'`** prevents your app from being embedded in iframes. If you want a "share to embed" feature, this needs adjustment. Defaulting to `'none'` is safer; clickjacking attacks rely on iframe embedding.
- **CSP report-only mode is your friend.** Deploy `Content-Security-Policy-Report-Only` first, observe violations for a week, then switch to enforcing. Skipping this step almost always causes a user-visible outage.
- **`'unsafe-inline'` in `style-src` is a compromise.** It's there because Radix/shadcn use inline styles. The XSS risk from inline *styles* is much lower than inline *scripts* — CSS injection can exfiltrate via attribute selectors but is not direct code execution. Accept the trade-off; revisit if you want best-in-class.
- **`script-src 'self'` blocks `eval` and inline.** If you `JSON.parse(user_input)` thinking it's "eval-like," that's not eval — `JSON.parse` is fine under CSP.
- **`object-src 'none'` blocks Flash and old plugins.** Don't need it; harmless.
- **`base-uri 'self'`** prevents `<base href="evil.com">` attacks that change relative-URL resolution.

## Common pitfalls

### Pitfall: Deploying CSP without reporting first.

Going straight to enforcement breaks the app for users with weird browsers / extensions / blocked CDNs and you have no telemetry. Always: report-only → observe → tighten → enforce.

### Pitfall: Allowing `*.supabase.co` instead of the specific project URL.

`*.supabase.co` includes every Supabase project, including ones owned by attackers. Use `https://bzeomaxcafiqwxlskwvz.supabase.co` exactly.

### Pitfall: `connect-src` missing the websocket protocol.

Supabase Realtime uses `wss://`. If your CSP says `connect-src https://...supabase.co`, websockets get blocked. Include both schemes.

### Pitfall: Nonces drift.

The "right" solution to inline styles is nonces (`<style nonce="...">`) but generating a unique nonce per request requires SSR or edge function involvement. Vite SPAs serve a static `index.html`; nonces would require build-time templating. Stick with `'unsafe-inline'` for `style-src`; revisit when migrating to a framework with SSR.

### Pitfall: Forgetting CSP on error pages.

Hosted 404s, maintenance pages, and similar often skip CSP. An attacker who can lure a victim to a 404 page on your domain has more options than on a CSP-protected page. Make sure every page served from your domain has the header.

### Pitfall: `frame-ancestors` ignored by old browsers.

`X-Frame-Options: DENY` is the legacy equivalent. Set both for belt-and-suspenders.

### Pitfall: `report-uri` ignored by modern browsers.

`report-uri` is deprecated in favour of `report-to`. Setting both is forward-compatible; setting only the old one means no reports from newer browsers.

### Pitfall: `dangerouslySetInnerHTML` in `chart.tsx` triggering the lint rule.

The patch suggests `'react/no-danger': 'error'` globally with an inline disable in `chart.tsx`. Document *why* the inline disable exists in a comment so a future maintainer doesn't reflexively delete it.

### Pitfall: Bringing in a library that requires `unsafe-eval`.

A dependency upgrade can quietly start needing eval (some chart libs, some date libs). The first sign is "feature X stopped working in prod" with no code change. Audit `npm ls` for known eval-using libraries and pin major versions; treat CSP changes as part of dependency review.

### Pitfall: Mobile webview ignoring CSP.

Most modern webviews respect CSP. iOS WKWebView and Android WebView do; older ones may not. Don't rely on CSP as the only XSS defense; React's auto-escaping is the first line, CSP is the second.

## Product behavior changes

- Initially: more console errors during the report-only phase. After tuning: no observable user-facing change.
- Long-term: a class of XSS attacks goes from "works" to "blocked by browser." Auth tokens in localStorage become much less interesting to attackers.
- Future feature decisions (embeds, inline scripts, etc.) now have a CSP dimension to consider.

## Verification checklist

- [ ] CSP report-only deployed; one week of reports collected with no significant violations.
- [ ] Enforcing CSP shipped.
- [ ] `Content-Security-Policy` header present on every HTML response (not just `/`).
- [ ] Supabase Realtime websocket works (test a notification subscription).
- [ ] All third-party widgets work.
- [ ] ESLint rule `react/no-danger: 'error'` enabled, with a documented allowlist for `chart.tsx`.
- [ ] XSS test: paste `<img src=x onerror=alert(1)>` into any user-input field and verify nothing executes.
