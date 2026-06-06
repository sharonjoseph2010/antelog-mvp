# Security Review — antelog-mvp

**Date:** 2026-05-28
**Reviewer:** akp (Claude-assisted)
**Branch reviewed:** `main` @ `a280e1c`
**Scope:** Input validation, Authentication, Rate limiting, Row-Level Security (RLS), Insecure Direct Object References (IDOR)

> This review is a desk audit of source under version control. It does **not** include a live penetration test, dependency CVE scan, or Supabase project-level configuration audit (Auth providers, captcha, network rules). Those should follow.

---

## Severity Summary

| # | Finding | Severity | Area |
|---|---------|----------|------|
| 1 | RLS is globally **disabled** across all core tables | **P0 — Critical** | RLS |
| 2 | `.env` is checked into git and not in `.gitignore` | **P0 — Critical** | Secrets / Config |
| 3 | `ai-update-user-expertise` edge function accepts `userId` from body, no JWT-ownership check | **P0 — Critical** | AuthZ / IDOR |
| 4 | `rematch-contacts` edge function operates on entire `contacts` table for any authenticated caller | **P0 — Critical** | AuthZ / IDOR |
| 5 | `ai-normalize-entries` mutates `master_directory_entries` with no ownership check | **P0 — Critical** | AuthZ / IDOR |
| 6 | `guest_contributions` granted full INSERT/UPDATE/DELETE to `anon` and `authenticated` with no policies | **P1 — High** | RLS / IDOR |
| 7 | `recommendation_votes` SELECT policy is `USING (true)` (public read) | **P1 — High** | RLS |
| 8 | Admin gate is a hard-coded e-mail string on the client | **P1 — High** | AuthN / AuthZ |
| 9 | `ListEdit` page has no client-side owner check; depends entirely on (currently-disabled) RLS | **P1 — High** | IDOR |
| 10 | No rate limiting on any edge function, login, signup, or AI endpoints | **P1 — High** | Rate Limiting |
| 11 | Wildcard CORS (`Access-Control-Allow-Origin: *`) on every edge function | **P2 — Medium** | AuthN / CORS |
| 12 | User-supplied content concatenated into LLM prompts without escaping (prompt injection) | **P2 — Medium** | Input Validation |
| 13 | Session stored in `localStorage` — XSS would exfiltrate JWT | **P2 — Medium** | AuthN / Session |
| 14 | `InternalRoute` guard checks only `location.state.internal === true` (spoofable) | **P2 — Medium** | AuthZ |
| 15 | Edge functions return raw `error.message` to clients (internal leakage) | **P2 — Medium** | Information Disclosure |
| 16 | Debug `console.log` of user IDs / session state left in production paths | **P3 — Low** | Information Disclosure |
| 17 | `GuestResponse` form lacks client-side input validation (length, format) | **P3 — Low** | Input Validation |

---

## 1. Input Validation

### What's good
- **Zod + react-hook-form** is the dominant pattern. Verified strong schemas in:
  - `src/pages/Signup.tsx` — email format, password ≥ 8 chars, `+91XXXXXXXXXX` regex on phone, name min length.
  - `src/pages/Login.tsx` — email + password presence.
  - `src/pages/ProfileSetupEnhanced.tsx` — handle regex (`^[a-zA-Z0-9_]{3,30}$`), name and phone constraints.
  - `src/pages/RequestsNew.tsx`, `RequestEdit.tsx` — title 10-500 chars, category enum, audience enum.
  - `src/pages/ListEdit.tsx` — per-item validation including a URL prefix check.
- React JSX rendering (no `dangerouslySetInnerHTML` in user-content paths) means form input is auto-escaped at render time. **No XSS surface found in audited pages.** (`chart.tsx` uses `dangerouslySetInnerHTML` but only for server-controlled chart config.)

### Gaps
- **`src/pages/GuestResponse.tsx`** is the only user-facing form without Zod. It accepts a public-token-bearing visitor's name, contact, and free-text recommendation, with only an `if (trim() === '')` check (line 215+). Anyone with a share link can submit arbitrarily long or malformed payloads. Add a Zod schema mirroring the in-app response form.
- **Edge functions accept JSON via `req.json()` and trust the TypeScript interface.** None of the seven functions run runtime validation (Zod, valibot, etc.) on the parsed body. Specifically `merge-recommendations` validates required fields by hand (line 66) but doesn't validate types or string lengths; the rest validate even less. Recommend a single shared Zod validator helper.
- **Prompt injection in LLM functions.** `ai-normalize-entries`, `ai-smart-suggestions`, `ai-update-user-expertise`, and `ai-suggest-category` all interpolate user-supplied text directly into the Gemini prompt body. A malicious user can craft text that overrides system instructions (e.g., to make the model emit attacker-controlled JSON, exfiltrate other inputs in batched calls, or pivot consolidation decisions). Mitigations: wrap user content in `<USER_INPUT>` tags, strip control sequences, cap length, and treat model output as untrusted (which is mostly already the case for parsing).

---

## 2. Authentication

### What's good
- Auth is delegated to **Supabase Auth**, which handles signup, login, OTP/email verify, and refresh-token rotation. No bespoke crypto in the codebase.
- `supabase/config.toml` opts most edge functions into `verify_jwt = true`. The one explicit `false` (`check-request-expiry`) is appropriate — it's a system cron job operating on global state. `merge-recommendations` is not listed, which means it inherits the platform default of `true`; the function additionally re-validates with `auth.getUser()` and checks `creator_id` ownership before any service-key mutation (lines 41-92). **This is the model the other functions should follow.**
- `Admin.tsx` calls the `get_current_user_role()` RPC (line 105-106) and short-circuits the UI if the role is not admin.

### Issues

#### 2.1 Admin gate uses a hard-coded e-mail on the client (P1)
`src/App.tsx:310` (gist):
```ts
const isAdmin = user?.email === "sharonjoseph2010@gmail.com";
```
This drives `<AdminRoute>` (App.tsx:539). The protection of *destructive* admin actions still depends on the server-side `get_current_user_role()` RPC and (currently disabled) RLS, but: (a) the route is reachable by anyone who can spoof an e-mail in their session payload during a misconfiguration; (b) hard-coding an identity in source is brittle and leaks to anyone with repo access. Move the check to a `roles` table / RPC and remove the e-mail from source.

#### 2.2 Session stored in `localStorage` (P2)
`src/integrations/supabase/client.ts:13` sets `storage: localStorage`. This is the Supabase default for browser SPAs. The risk is that **any successful XSS exfiltrates the JWT in one line of JS**. Since no XSS sinks were found, this is acceptable today, but it is *the* reason XSS hygiene cannot slip — there's no httpOnly cookie to fall back on.

#### 2.3 `InternalRoute` is state-spoofable (P2)
`src/components/routes/RouteGuards.tsx:117-128` gates `/profile-setup` and `/verify` on `location?.state?.internal === true`. React Router state is fully writable from any redirect, including via `window.history`. The downstream effect is mild (just allows access to two onboarding routes), but the guard should either be removed or replaced with a server-validated profile-completion check.

#### 2.4 `.env` committed (P0)
`git ls-files` shows `.env` is tracked, containing the Supabase URL and anon key. `.gitignore` does not list `.env*`. The anon key itself is designed to be public (it's bundled into the SPA build at `src/integrations/supabase/client.ts:6-7` too), so this is not directly a credential leak — but the convention is dangerous: the moment someone adds `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, etc. to `.env` it gets pushed. Add `.env`, `.env.*`, `!.env.example` to `.gitignore`, `git rm --cached .env`, and rotate the anon key as a precaution.

---

## 3. Rate Limiting Middleware

**There is none.** No middleware in any of the seven edge functions, no client-side cooldown on login/signup/AI calls, no Supabase Auth captcha configured visibly. Concrete risks:

- **Auth brute force** — Login.tsx allows unbounded retries; depends entirely on whatever Supabase Auth defaults are configured in the dashboard (not visible here). Enable captcha + lockout on the Supabase project.
- **LLM cost amplification** — `ai-smart-suggestions` calls Gemini on every keystroke-driven request. A single authenticated user can run the project's API bill to the ceiling. Add per-user rate limits (e.g., a `rate_limit_log` table keyed on `user_id` + minute bucket, checked at function entry).
- **Mass mutation** — `rematch-contacts` and `ai-normalize-entries` are heavyweight functions that should be opt-in and cooldown-gated.

Recommendation: introduce a small shared middleware in `supabase/functions/_shared/rate_limit.ts` (sliding window backed by a Postgres table or Upstash) and require every function to call it as the first step after auth.

---

## 4. Row-Level Security (RLS)

### Critical — RLS is globally disabled (P0)

Migration `supabase/migrations/20251126112541_6b2328d4-f358-465e-bc28-7a3fdea60610.sql` runs:

```sql
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE friendships DISABLE ROW LEVEL SECURITY;
... (23 tables in total)
```

The migration is self-labelled "⚠️ CRITICAL SECURITY WARNING ⚠️ … MUST be re-enabled before production." No subsequent migration re-enables it for those tables. The only post-disable `ENABLE ROW LEVEL SECURITY` is for `request_anonymous_impressions` in migration `20260506095404`.

**Concrete impact:** Any authenticated user, using only the anon key shipped in the SPA, can `SELECT`, `INSERT`, `UPDATE`, or `DELETE` any row from any of the following tables via `supabase.from('X')`:

`profiles, friendships, friend_requests, friend_suggestions, contact_imports, anonymous_handles, requests, request_responses, request_forwards, request_votes, notifications, lists, list_items, groups, group_members, directory_entries, directory_votes, master_directory_entries, search_analytics, user_expertise, user_roles, colleges, contact_access_logs.`

This includes PII (phone numbers, e-mails, full names in `contact_imports`), the full social graph (`friendships`, `friend_requests`), and the role table (`user_roles` — a user can grant themselves admin).

**This is the single most important issue in this review.** Every other finding in this document is secondary until RLS is restored.

### Additional RLS findings

- **`recommendation_votes`** has `RLS ENABLE` but its SELECT policy is `USING (true)` — i.e. world-readable.
- **`guest_contributions`** has `RLS ENABLE` with **no policies defined**, and migration `20260304084514` then grants `SELECT, INSERT, UPDATE, DELETE` to `authenticated` and `SELECT` to `anon`. With no policies, RLS denies by default — but the explicit `GRANT` is on the table itself; if a future migration adds even a permissive policy, anon users get full table access. Define explicit policies now.
- **`share_links`** has RLS enabled with the comment "no policies for now". This means it is currently inaccessible to clients except via SECURITY DEFINER RPCs — fine if intentional, but worth documenting.
- **SECURITY DEFINER functions** exist in at least 10 migrations (`20251119201711`, `20251120045327`, `20251204082753`, `20250921191854`, `20250917185651`, `20251210101220`, several `2025-08` trigger functions). Each one runs with the table owner's privileges and is therefore an RLS bypass. They have not been individually audited in this review — recommend a follow-up review focused on each function's body for ownership checks.
- `generate_share_token()` and `can_reveal_identity()` are granted EXECUTE to `anon`. Confirm these are pure functions and don't leak data on probe.

### Recommended remediation order
1. Re-enable RLS on all 23 tables. Use the pre-disable policies as the starting point.
2. Add explicit policies to `share_links`, `guest_contributions`, and `recommendation_votes`.
3. Audit every SECURITY DEFINER function for owner checks against `auth.uid()`.
4. Add a CI check that fails the build if any new migration includes `DISABLE ROW LEVEL SECURITY`.

---

## 5. Insecure Direct Object References (IDOR)

With RLS disabled, **every query that filters by `.eq('id', id)` is an IDOR by default**. The findings below assume RLS will be re-enabled; they remain as the layered defenses (server-side + client-side) the app should have either way.

### Edge functions

| Function | IDOR risk | Detail |
|----------|-----------|--------|
| `ai-update-user-expertise` | **Critical** | Reads `userId` from request body (line 25) and immediately writes to `user_expertise` for that ID using the service-role key. Any caller with a valid JWT can rewrite anyone else's expertise profile. **Fix:** ignore the body `userId`; use `auth.getUser()`. |
| `rematch-contacts` | **Critical** | Iterates *all* `contacts` and re-links them globally (lines 29-144). No caller-scoping. Any user can trigger system-wide contact recomputation, with potential to attach contacts to attacker-controlled profiles. **Fix:** scope to `owner_id = auth.uid()` and/or restrict to admin. |
| `ai-normalize-entries` | **Critical** | Mutates `master_directory_entries` based on user-supplied `display_content`. No ownership check. **Fix:** verify the caller created the entries being consolidated, or restrict to admin. |
| `ai-smart-suggestions` | High | Returns directory matches for any user-supplied query; no ownership check on the returned rows. Acceptable only if `master_directory_entries` is meant to be globally readable. **Confirm intent.** |
| `merge-recommendations` | **None — model implementation** | Validates `auth.getUser()`, then explicitly checks `creator_id` equals the caller before mutating (lines 41-92). Use this as the template. |
| `ai-suggest-category` | None | Stateless LLM call, no DB access. |
| `check-request-expiry` | None | Cron, intentional service-role op. |

### Front-end pages

| Page | IDOR risk | Detail |
|------|-----------|--------|
| `RequestEdit.tsx` | None | Explicitly verifies `data.creator_id !== user.id` and redirects (line 73). Good. |
| `ListEdit.tsx` | High | Fetches by `id` only (line 98); no creator check. Relies on RLS, which is currently disabled. Add an explicit `.eq('creator_id', user.id)` filter. |
| `GroupDetail.tsx`, `RequestDetail.tsx` | Inherited | Rely on RLS for filtering. Add explicit predicates as defense in depth. |
| `PublicProfile.tsx` | None | Uses `get_safe_profile_view` RPC which encapsulates visibility logic server-side. Good. |
| `GuestResponse.tsx` | Medium | Access gated by a (presumably high-entropy) share token; token validation, expiry, and capacity checks are in place (lines 150-289). Confirm tokens are generated with a CSPRNG and are unguessable; rotate or expire on misuse. |
| `Admin.tsx` / `AdminDeduplication.tsx` | Layered | Client gate (e-mail) + server RPC (`get_current_user_role`) + dangerous RPCs (`refresh_master_directory`). Replace e-mail gate; verify the RPCs themselves re-check role. |

### Cross-cutting recommendation
Treat client filters as **non-security-bearing**. Every query that returns rows the user shouldn't see must rely on an RLS policy or a SECURITY DEFINER RPC that performs the check. Today, with RLS off, the app's data confidentiality rests on nothing.

---

## Cross-Cutting Issues

### CORS (P2)
All seven edge functions emit:
```ts
"Access-Control-Allow-Origin": "*"
```
For functions that require JWT this is mostly safe (the JWT must still be presented), but it means any origin — including phishing pages — can call the API with a stolen token. Restrict to the app's known origins.

### Error message leakage (P2)
Most edge functions catch errors and return `JSON.stringify({ error: error.message })` with status 500. Database errors leak schema details, foreign-key names, and policy names this way. Log internally; return a generic message externally.

### Console logging in production (P3)
`src/App.tsx` logs session state and `user.id` to `console.log` on auth events. Not catastrophic, but it does mean anyone screen-sharing or sharing a bug report will reveal session identifiers. Gate behind `import.meta.env.DEV`.

### Secrets in source / env
- `src/integrations/supabase/client.ts` hard-codes the Supabase URL and anon key. The anon key is *meant* to be public (it's the public identifier for the project + JWT verification key for unauth requests), so this is fine **iff** RLS is enforced. With RLS off, the anon key is effectively a master credential to your data.
- `.env` is committed (see 2.4).
- Edge functions read `GEMINI_API_KEY` from env — correct pattern. No keys in source.

---

## Recommended Remediation Plan

**Block-1 — Stop the bleed (do before any production exposure):**
1. Re-enable RLS on all 23 tables; restore the pre-`20251126112541` policies.
2. Remove `.env` from git (`git rm --cached .env`), add to `.gitignore`, rotate keys.
3. Patch `ai-update-user-expertise`, `rematch-contacts`, `ai-normalize-entries` to derive identity from `auth.getUser()`, not the request body.
4. Replace the hard-coded admin e-mail with a `user_roles` lookup.
5. Add explicit RLS policies to `share_links`, `guest_contributions`, `recommendation_votes`.

**Block-2 — Defense in depth (next sprint):**
6. Introduce a Zod validator and a rate-limit middleware in `supabase/functions/_shared/`; apply to every function.
7. Add owner predicates (`.eq('creator_id', user.id)`) on every fetch-by-ID page; treat RLS as the second layer, not the only one.
8. Tighten CORS to the app's allowed origins.
9. Audit every SECURITY DEFINER function for owner checks.
10. Wrap LLM prompts with delimiters and length limits to harden against prompt injection.

**Block-3 — Hygiene:**
11. Remove `console.log` of identifiers from production paths.
12. Add a CI check that fails on `DISABLE ROW LEVEL SECURITY` in any new migration.
13. Run `npm audit` / Snyk on dependencies; this review did not cover supply chain.
14. Configure Supabase Auth captcha + lockout in the project dashboard.

---

## Out of Scope

- Live penetration testing.
- Supabase project dashboard config (Auth providers, captcha, e-mail templates, network restrictions).
- Dependency CVE / supply-chain scan.
- Mobile/native clients (none found).
- Performance / DDoS mitigation at the network edge.
