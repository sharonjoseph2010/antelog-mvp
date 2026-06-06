# Security Remediation — Changes Applied

**Branch:** `security-remediation/akp-20260606` · **Base:** `main`
**Date:** 2026-06-06 · **Author:** akp (Claude-assisted)
**Companion docs:** [`SECURITY_REVIEW.md`](./SECURITY_REVIEW.md) · [`SECURITY_REMEDIATION.md`](./SECURITY_REMEDIATION.md) · [`remediation/`](./remediation)

This document records exactly what changed to address the findings in the
security review. It is the implementation counterpart to the review.

> ## ⚠️ Read before merging / deploying
> - **Front-end changes are build-verified** (`tsc` + `vite build` clean, no new lint errors).
> - **Edge-function and database changes are authored but NOT runnable in CI here** (no Deno, no DB access). They **MUST** be applied to a **staging** Supabase project via the CLI and smoke-tested before production.
> - The RLS change (#1) is the highest blast radius in the project. Treat the [staging checklist](#staging-validation-checklist) as a merge gate.

---

## 1. Summary by finding

| # | Severity | Finding | Status | Where |
|---|----------|---------|--------|-------|
| 1 | P0 | RLS disabled on 23 tables | ✅ Re-enabled + policies | `migrations/20260606120000_security_enable_rls.sql` |
| 2 | P0 | `.env` committed | ✅ Untracked + ignored | `.gitignore`, `.env.example` |
| 3 | P0 | `ai-update-user-expertise` trusts body `userId` | ✅ Identity from JWT | `functions/ai-update-user-expertise` |
| 4 | P0 | `rematch-contacts` operates on all contacts | ✅ Scoped to caller | `functions/rematch-contacts` |
| 5 | P0 | `ai-normalize-entries` no ownership check | ✅ Admin-only | `functions/ai-normalize-entries` |
| 6 | P1 | `guest_contributions` over-granted to anon | ✅ Explicit policies | RLS migration |
| 7 | P1 | `recommendation_votes` world-readable | ✅ Restricted | RLS migration |
| 8 | P1 | Hard-coded admin email | ✅ Role RPC + seed | `App.tsx`, admin-seed migration |
| 9 | P1 | `ListEdit` no owner check | ✅ Owner-scoped | `ListEdit.tsx` |
| 10 | P1 | No rate limiting | ✅ Per-caller limiter | `_shared/rateLimit.ts`, rate-limit migration |
| 11 | P2 | Wildcard CORS | ✅ Origin allowlist | `_shared/cors.ts` |
| 12 | P2 | Prompt injection | ✅ Input guard | `_shared/promptSafety.ts` |
| 13 | P2 | JWT in `localStorage` | ⚠️ Accepted (see notes) | — |
| 14 | P2 | `InternalRoute` spoofable | ✅ Server-state gate | `RouteGuards.tsx` |
| 15 | P2 | Raw `error.message` leaked | ✅ Sanitized responses | `_shared/http.ts` |
| 16 | P3 | `console.log` of identifiers | ✅ Dev-only logger | `src/lib/logger.ts` |
| 17 | P3 | `GuestResponse` no validation | ✅ Zod schema | `GuestResponse.tsx` |
| A1 | — | Shared edge helpers | ✅ Added | `functions/_shared/` |
| A2 | — | CI guard vs RLS-disable | ✅ Workflow | `.github/workflows/security-guard.yml` |
| A3 | — | SECURITY DEFINER audit | ⛔ Outstanding | follow-up |
| A4 | — | Dependency scan | ✅ Run (see notes) | — |

Decisions taken where strict restoration would break the app:
- **D1 — profiles SELECT:** self + direct friends + admin.
- **D2 — anonymous_handles:** cross-user reads via `get_display_identity` (rewire pending).
- **D3 — guest request read:** SECURITY DEFINER RPC keyed on share token.
- **D4 — notifications INSERT:** SECURITY DEFINER RPC; client INSERT denied.

---

## 2. Front-end changes (build-verified)

### `src/App.tsx` — admin gate (#8) + logging (#16)
- Removed `isAdmin = user?.email === "sharonjoseph2010@gmail.com"`.
- `isAdmin` now derives from `get_current_user_role()` with an `isAdminLoading`
  flag (default false) passed into `<AdminRoute>`.
- All `console.log`/`console.warn` routed through the new dev-only logger.

### `src/components/routes/RouteGuards.tsx` — #8, #14
- `AdminRoute` accepts `isAdminLoading` and shows a loading state instead of
  bouncing a real admin mid-check.
- `InternalRoute` now resolves the user's real profile state server-side and
  allows `/profile-setup` / `/verify` only when the profile is incomplete or
  unverified — replacing the spoofable `location.state.internal` check.

### `src/pages/ListEdit.tsx` — IDOR (#9)
- Resolves the session before querying; redirects to `/login` if absent.
- Load query scoped with `.eq("owner_id", uid)`; both UPDATE paths scoped with
  `.eq("owner_id", userId)`. `list_items` inherit ownership via the parent.

### `src/pages/GuestResponse.tsx` — validation (#17) + guest read (D3)
- Added a Zod schema: name (1–100, trimmed), contact (email|phone union,
  optional), recommendation ≤2000 / reason ≤1000 / link `http(s)://`.
- Reads the request via `get_request_for_guest(p_request_id, p_token)` RPC
  instead of a direct (now RLS-protected) `requests`/`profiles` read.

### Notification inserts rewired to `create_notification` RPC (D4)
`NotificationCenter.tsx`, `FriendRequestButton.tsx`, `Network.tsx` — direct
`notifications` INSERTs replaced with `supabase.rpc("create_notification", …)`.

### `src/lib/logger.ts` (new) — #16
- `log` / `warn` emit only in dev or with `?debug=1`; no-ops in production.
- `console.log` across `src/` swept to `log()` (0 remaining). `console.error`
  preserved. Files swept: `ContactDebugPanel`, `ForwardRequestModal`, `Header`,
  `clustering`, `ContactsImportHub`, `ProfileSetup`, `RequestRespond`,
  `RequestsNew`, plus `App.tsx`.

---

## 3. Edge functions (deploy-time verified)

### `supabase/functions/_shared/` (new — A1)
| File | Purpose |
|------|---------|
| `cors.ts` | Origin allowlist via `ALLOWED_ORIGINS` env (#11) |
| `http.ts` | `json`/`preflight`/`fail` — sanitized error surface (#15) |
| `auth.ts` | `getUser` (JWT identity), `adminClient`, `isAdmin` |
| `promptSafety.ts` | `wrapUserInput` + `INJECTION_GUARD` (#12) |
| `rateLimit.ts` | `enforceRateLimit` over `check_rate_limit` RPC (#10) |

### Per-function changes
- **ai-update-user-expertise (#3):** identity from `getUser()`, body `userId`
  ignored; rate-limited; prompt guarded; sanitized errors.
- **rematch-contacts (#4):** authorized; contacts scoped to `user_id = caller`;
  verbose phone/PII logging removed; rate-limited.
- **ai-normalize-entries (#5):** admin-only (`isAdmin`); prompt guarded;
  rate-limited.
- **ai-smart-suggestions:** prompt guarded; `ilike` search term sanitized
  against PostgREST filter injection; rate-limited; verbose logging removed.
- **ai-suggest-category:** prompt guarded; fixed double `req.json()` in the
  fallback path; rate-limited.
- **merge-recommendations:** moved to shared CORS/error helpers; rate-limited.
  (Auth + creator-ownership check already correct — used as the template.)
- **check-request-expiry:** shared helpers; sanitized errors. Remains a
  no-auth cron (`verify_jwt = false`).

> **Deploy note:** set `ALLOWED_ORIGINS` (comma-separated prod origins) on the
> Supabase project. Without it only `localhost` dev origins are allowed.

---

## 4. Database migrations (STAGING-FIRST)

### `20260606120000_security_enable_rls.sql` — #1, #6, #7, D3, D4
- `ENABLE ROW LEVEL SECURITY` + explicit (drop-then-create, idempotent)
  policies for all 23 tables. Service-role + SECURITY DEFINER paths bypass RLS,
  so server-side writes keep working.
- `recommendation_votes` (#7): world-readable SELECT removed.
- `guest_contributions` (#6): creator/admin SELECT; anon INSERT gated by
  `share_link_matches()` SECURITY DEFINER check.
- `get_request_for_guest()` (D3) and `create_notification()` (D4) RPCs.

### `20260606120100_security_rate_limit.sql` — #10
- `rate_limit_log` table + `check_rate_limit()` SECURITY DEFINER RPC
  (sliding window), granted to `service_role` only.

### `20260606120200_security_admin_seed.sql` — #8
- Seeds the existing admin into `user_roles` so the role-based gate keeps
  access on deploy. Idempotent.

---

## 5. Repo hygiene

- **`.env` untracked** (`git rm --cached`), `.gitignore` now ignores `.env*`
  (keeps `.env.example`), and `.env.example` added with placeholders (#2).
  → **Rotate the anon key in the Supabase dashboard** (out of repo).
- **`.github/workflows/security-guard.yml`** (A2): CI fails any migration
  containing `DISABLE ROW LEVEL SECURITY`.

---

## 6. Staging validation checklist

Apply the 3 migrations to a **staging** project and deploy the edge functions,
then verify:

- [ ] Login / signup / onboarding (`/profile-setup`, `/verify`).
- [ ] Friends: send/accept request → recipient gets a notification (now via
      `create_notification`).
- [ ] Requests: create, browse, respond, forward.
- [ ] **Guest flow**: open `/r/:requestId/:token` while logged out — request
      loads via `get_request_for_guest`; submission writes a contribution.
- [ ] Lists: create/edit/delete (owner only); non-owner edit URL is blocked.
- [ ] Directory search + voting.
- [ ] Admin: seeded admin sees `/admin`; non-admin is redirected; a non-admin
      `UPDATE user_roles … role='admin'` is denied.
- [ ] Edge functions: a body-`userId` other than the caller is ignored (#3);
      rematch only touches the caller's contacts (#4); normalize is 403 for
      non-admins (#5); requests from a disallowed origin are blocked (#11).

### Known behavior changes to confirm acceptable
- **profiles:** direct reads of **non-friend** profiles (search, suggestions)
  now return nothing — those call sites must move to `get_safe_profile_view`
  (**follow-up, not in this PR**).
- **requests:** no global public "all open requests" feed — audience-scoped.
- **anonymous_handles:** `Requests.tsx` still reads it directly →
  rewire to `get_display_identity` (**follow-up**).
- **share_links:** RLS left untouched (out of the 23-table scope; guest flow
  depends on it). Confirm the guest `linkData` read still works on staging.

---

## 7. Still outstanding (not in this PR)
- **A3** — audit every SECURITY DEFINER function for owner checks.
- **#13** — JWT in `localStorage` accepted; mitigated by XSS hygiene (no sinks
  found). No httpOnly-cookie fallback without an auth-architecture change.
- Follow-up client rewires noted above (non-friend profile reads; anon handles).
- Supabase dashboard: anon key rotation, Auth captcha + lockout.
- **A4** — `npm audit`: 17 advisories (9 high incl. rollup path-traversal, 8
  moderate) in dev tooling; `npm audit fix` in a separate chore PR. `npm ci`
  currently fails (committed lockfile out of sync with `package.json`).
