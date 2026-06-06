# 16 — Strip production `console.log` of identifiers

> Patch: [`SECURITY_REMEDIATION.md` §16](../SECURITY_REMEDIATION.md#16-production-consolelog-of-identifiers)

## Why this matters

`src/App.tsx` and other auth-handling files contain `console.log` statements that include user IDs and session state:

```ts
console.log('INIT: Session check complete:', { hasSession: !!session, userId: session?.user?.id, ... });
console.log("[Auth] Starting post-auth navigation for user:", userId);
```

User IDs alone aren't catastrophic, but:

1. **Screen-sharing exposes them.** A user demoing the app to a colleague (or being supported by your team) shows the DevTools console — which now contains their identifier. Combined with the app's social graph, that's enough to look someone up.
2. **Error tracking services ingest console logs.** Sentry, Datadog Browser, LogRocket, and others capture `console.log` by default. Your error tracker becomes a PII database.
3. **Browser extensions read console logs.** Privacy-violating extensions can scrape this data.
4. **Bug reports include screenshots of the console.** Same as the first point, but with a permanent record.

The principle: **production code should not log user identifiers.** Dev-time debug logs are fine; they shouldn't ship.

## What might break

- **Debugging in production gets harder.** When a user reports "the app didn't redirect me after login," the dev can't `console.log` their way through it. Compensate with structured server-side logs and a way to opt-in to verbose client logs (see below).
- **Existing error tracking dashboards** that grep for "INIT:" or "[Auth]" stop finding matches. Update saved searches.

## Gotchas

- **`console.error` should stay.** Errors *should* be visible in production for telemetry. The fix targets `console.log` and `console.warn` of identifiers, not all logging.
- **`import.meta.env.DEV` vs `process.env.NODE_ENV`.** Vite uses `import.meta.env`. The `process.env` form works only under bundler shimming and is brittle. Use the Vite-native form.
- **Tree-shaking dev-only logs.** With the proposed `log()` helper, in production `import.meta.env.DEV === false`, the bundler can dead-code-eliminate the function calls. But only if the helper is *exported as a constant* and used as `log(...)` directly. Wrapping it in another function defeats tree-shaking.
- **Telemetry logs are different from debug logs.** Don't `log('user clicked X')` if you actually want analytics — analytics belongs in a structured event system (e.g., PostHog, Segment), not console.log.
- **Codemods over manual edits.** `sed -i 's/console\.log/log/g'` works but is mechanical. Review each change to ensure (a) the import is added, (b) the call site is actually a debug log not telemetry, (c) errors weren't accidentally caught.

## Common pitfalls

### Pitfall: The codemod also rewrites `console.log` inside string literals.

```ts
const msg = "Use console.log to debug";  // gets rewritten to "Use log to debug"
```

Sed doesn't know about JS syntax. Use a tool that understands the AST (jscodeshift, ts-morph) or do it manually. The risk is low here — the project doesn't have obvious string-literal occurrences — but it's the classic codemod trap.

### Pitfall: Forgetting to add the import after the rewrite.

```ts
log('foo');  // ReferenceError if `log` is not imported
```

Either:

```ts
// option A: global declaration
declare global { function log(...args: unknown[]): void; }
// option B: import in each file
import { log } from '@/lib/logger';
```

Option B is cleaner; the codemod should add the import to any file it touches.

### Pitfall: Conflating logging hygiene with telemetry.

After this change, if a developer needs to know "did the user finish onboarding?" in production, the answer is *not* "add a console.log temporarily." It's "instrument with an analytics event." Make this distinction clear in code review.

### Pitfall: `log` no-op in prod hides timing issues.

If you `log('about to call X')` and that call mysteriously fails in prod, removing the log doesn't help you diagnose. Production debugging needs structured logs (Sentry breadcrumbs, OpenTelemetry, etc.), not console.log.

### Pitfall: Server-side `console.log` in edge functions.

Edge functions' `console.log` goes to Supabase Functions logs, which are non-public. Those logs *can* include identifiers — but should still avoid raw PII (emails, phone numbers, JWTs). The `log/log/warn` helper is browser-only; edge functions need a different logger pattern (see [#15](./15-edge-error-messages.md) for the structured logging recommendation).

### Pitfall: Stripping all logs and losing the diagnostic value.

Some `console.log` calls *should* survive as `console.error` or as Sentry breadcrumbs. Don't blanket-delete; categorise:

- **Pure debug** (`console.log('INIT:', state)`) → `log()`, dev-only.
- **Anomaly warnings** (`console.warn('unexpected null')`) → `Sentry.addBreadcrumb(...)` or keep as warn.
- **Errors** (`console.error('failed to load')`) → keep as `console.error`, ideally `Sentry.captureException`.

### Pitfall: Opt-in verbose mode by URL param.

A useful pattern:

```ts
const verbose = new URLSearchParams(window.location.search).has('debug');
export const log = (...args: unknown[]) => { if (verbose || isDev) console.log(...args); };
```

Now support can ask a user to visit `?debug=1` and the logs appear, without baking them into prod for everyone. Be careful: the URL param shouldn't expose anything more sensitive than what was in dev logs.

### Pitfall: Logging tokens by accident.

`console.log('session', session)` logs the entire session object, including JWT and refresh token. Even in dev that's a screenshot risk. Log shape, not contents:

```ts
log('session loaded', { hasSession: !!session, userId: session?.user?.id?.slice(0, 8) });
```

### Pitfall: Removing logs from a working area and breaking developer flow.

If the team relies on certain logs while developing, ripping them out causes friction. Discuss the change before merging; offer the `?debug=1` opt-in as a substitute.

## Product behavior changes

- Production console is empty under normal operation.
- Errors (`console.error`) still appear and feed Sentry / equivalent.
- Verbose mode available via URL param for support sessions.

## Verification checklist

- [ ] `npm run build && npx serve dist` — open DevTools, navigate the app. Console shows no logs except errors.
- [ ] `npm run dev` — console shows logs as before.
- [ ] `grep -rn 'console.log' src/` shows zero matches (or only in `src/lib/logger.ts` or test files).
- [ ] Sentry (or other) no longer ingests user IDs from `console.log` capture.
- [ ] Visiting `?debug=1` (if implemented) enables verbose mode.
