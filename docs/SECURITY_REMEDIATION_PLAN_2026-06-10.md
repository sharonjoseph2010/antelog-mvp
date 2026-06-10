# Security Remediation — Execution Plan (2026-06-10)

**Owner:** akp · **Branch:** `security/review-2026-06-10-akp-20260610`
**Remediates:** every finding in
- `docs/SECURITY_REVIEW_2026-06-10.md` (Part 1 — F1–F13: RLS, edge functions, client, CSP, deps)
- `docs/SECURITY_REVIEW_2026-06-10_DATA_EXPOSURE.md` (Part 2 — D1–D8: anon RPC surface, PII)

**Deploy model:** Same as the 2026-06-06 round (`docs/DEPLOYMENT.md`). A git merge only
redeploys the **front-end**. SQL migrations, edge functions, and dashboard settings must be
applied by the Supabase owner (Sharon). **Front-end and back-end here are co-dependent** — several
fixes change RPC signatures or RLS that live SPA code depends on, so they **must go live together**.
Validate on a staging clone of prod first, then prod. Freeze Lovable UI edits during deploy.

---

## 0. Guiding principles

1. **Sequence by severity, but gate on coupling.** D1 (P0) and the no-caller revokes ship first
   because they have zero front-end coupling. Anything that changes an RPC signature or an
   RLS-readable column ships only with its updated callers in the same deploy.
2. **Default-deny the anon RPC surface** (D8) and re-grant the ~5 functions guest/anon flows
   actually need — this is the structural fix that also closes D2/D3/D7 against future regressions.
3. **Identity from `auth.uid()`, never a parameter** for any SECURITY DEFINER function (D1/D3).
4. **Validate server-side**, mirror client constraints (F6). Client validation stays advisory.
5. **Migrations are additive + idempotent** (`DROP POLICY IF EXISTS` / `CREATE OR REPLACE`),
   numbered `20260610*`, staging-verified before prod — matching `20260606120000_*`.
6. **Every structural fix gets a CI guard** so it can't silently regress (extends `security-guard.yml`).

---

## 1. Pre-work — usage audit (done; informs sequencing)

`grep` of `src/**/*.{ts,tsx}` for `.rpc(` and `.from(` established caller coupling:

| Surface | Frontend uses it? | Consequence |
|---|---|---|
| `find_profile_by_normalized_phone` (D1) | **No** | Revoke from `anon` immediately, zero impact |
| `debug_phone_match`, `debug_anonymous_match` (D7) | **No** | Drop / revoke immediately |
| `get_guest_page_preview` (D2) | **Yes** (`GuestResponse.tsx`) | Add `p_token` → update caller same deploy |
| `get_extended_network`, `find_network_experts`, `can_reveal_identity` (D3) | **Yes** | Drop `viewer_id`/`user_id` param → update callers same deploy |
| `share_links` direct SELECT (F1) | **Yes** (`GuestResponse.tsx`, `RequestRespond.tsx`) | Replace with token RPC before dropping anon SELECT |
| `notifications` INSERT cross-user (F3) | **Yes** (`FriendRequestButton`, `ForwardRequestModal`, …) | Self-scope policy **breaks** fan-out → route via validated RPC |
| `master_directory_votes` direct SELECT (D6) | **Yes** (`DirectoryListDetail`, `Lists`) | Provide aggregate count path before restricting |

> **Action item carried into Phase 2:** before the D8 blanket revoke lands, diff the full
> `.rpc()` call list against the re-grant allowlist and confirm no SPA call falls outside it.

---

## 2. Workstreams & artifacts

### Migrations (new, `supabase/migrations/`)

| File | Findings | Caller-coupled? |
|---|---|---|
| `20260610120000_sec_revoke_anon_pii.sql` | D1, D7 | No |
| `20260610120100_sec_share_links_rls.sql` | F1, F2 | Yes (GuestResponse) |
| `20260610120200_sec_notifications_insert.sql` | F3 | Yes (notify callers) |
| `20260610120300_sec_definer_search_path.sql` | F4, D5 | No |
| `20260610120400_sec_votes_read.sql` | D6 | Yes (Directory/Lists) |
| `20260610120500_sec_guest_preview_token.sql` | D2 | Yes (GuestResponse) |
| `20260610120600_sec_network_authuid.sql` | D3 | Yes (network pages) |
| `20260610120700_sec_anon_grant_lockdown.sql` | D8 | Yes (verify allowlist) |
| `20260610120800_sec_profiles_pii_columns.sql` | D4 | Yes (profile reads) |

### Edge functions (`supabase/functions/`)

| Change | Findings | Files |
|---|---|---|
| `CRON_SECRET` header check | F5 | `check-request-expiry/index.ts`, `config.toml` |
| Shared server-side validator | F6 | new `_shared/validation.ts` + every function |
| Gemini key → `x-goog-api-key` header | F7 | `ai-normalize-entries`, `ai-smart-suggestions`, `ai-update-user-expertise`, `ai-suggest-category` |
| Output-vs-input assertion | F8 | `ai-normalize-entries/index.ts` |
| Non-greedy JSON + shape validation | F9 | `ai-update-user-expertise/index.ts` |
| Limiter failure metric + fail-closed for the per-keystroke endpoint | F10 | `_shared/rateLimit.ts`, `ai-smart-suggestions` |

### Front-end (`src/`)

| Change | Findings | Files |
|---|---|---|
| Guest page: token RPC instead of `share_links` SELECT | F1, F2, D2 | `pages/GuestResponse.tsx`, `pages/RequestRespond.tsx` |
| Network pages: drop `viewer_id` args | D3 | callers of `get_extended_network`/`find_network_experts`/`can_reveal_identity` |
| Cross-user notifications via `create_notification` RPC | F3 | `FriendRequestButton`, `ForwardRequestModal`, `FriendSuggestions`, … |
| Vote counts via aggregate RPC/view | D6 | `DirectoryListDetail.tsx`, `Lists.tsx` |
| Profile reads via `get_safe_profile_view` | D4 | profile/network components reading `phone_number` etc. |
| `console.error(obj)` → `logger` + `error?.message` | F11 | `GuestResponse`, `ContactsImport`, others; `src/lib/logger.ts` |
| Content-Security-Policy | F12 | `index.html` (+ hosting headers if available) |

### CI / dependencies

| Change | Findings | Files |
|---|---|---|
| `npm audit fix` + scheduled `npm audit --audit-level=high` job | F13 (closes A4) | `package.json`, `.github/workflows/dependency-audit.yml` |
| Grep guard: `SECURITY DEFINER` without `SET search_path` | F4, D5 (closes A3) | `.github/workflows/security-guard.yml` |
| Grep guard: new `GRANT ... TO anon` requires review label / annotation | D8 | `security-guard.yml` |

---

## 3. Phased execution

### Phase 0 — Emergency, no front-end coupling (ship today)
Goal: stop the live PII bleed before anything else. All pure `REVOKE`/`DROP`, SPA does not call any of these.

- **D1** — `REVOKE ALL ON FUNCTION public.find_profile_by_normalized_phone(text, uuid) FROM anon, authenticated;`
  The contact-match flow already runs server-side under the service role (`rematch-contacts`), so revoking does not regress matching.
- **D7** — `REVOKE ALL ON FUNCTION public.debug_phone_match(...) FROM anon, authenticated;` and same for `debug_anonymous_match`; prefer `DROP FUNCTION` if confirmed unused server-side too.
- Migration: `20260610120000_sec_revoke_anon_pii.sql`.
- **Acceptance:** anon `supabase.rpc('find_profile_by_normalized_phone', …)` returns `permission denied`; contact matching via the app still works on staging.

### Phase 1 — RLS quick wins (bundle; one deploy)
- **F4 + D5** — `ALTER FUNCTION … SET search_path = public` for `update_directory_item_vote_count`, `get_extended_network`, `find_network_experts`, `get_safe_profile_view`, and any other definer fn the audit grep flags. Migration `20260610120300`.
- **F1 + F2** — drop both anon policies on `share_links`; add `increment_share_link_open(p_token)` and a token-only `resolve_share_link(p_token)` RPC returning non-sensitive fields. Migration `20260610120100`. **Update `GuestResponse.tsx`/`RequestRespond.tsx`** to use the RPCs instead of `from('share_links').select('*')` in the **same deploy**.
- **CI:** land the `security-guard.yml` definer/search_path grep here so F4/D5 can't regress.
- **Acceptance:** anon `from('share_links').select('*')` → empty/denied; guest page still loads via token; open-counter still increments; Supabase linter `function_search_path_mutable` clean for the altered functions.

### Phase 2 — Anon surface lockdown + function hardening (the structural fix)
- **D8** — `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;` + revoke the two `ALTER DEFAULT PRIVILEGES … TO anon`. Re-`GRANT EXECUTE` only the allowlist: `generate_share_token`, `share_link_matches`, `get_request_for_guest`, `increment_share_link_open`, and the fixed `get_guest_page_preview`. Migration `20260610120700`. **Run the caller-vs-allowlist diff first** (Phase-1 audit item).
- **D2** — `get_guest_page_preview` gains `p_token` and validates `(request_id, token)` against `share_links`; re-grant to anon only after the param is added. Migration `20260610120500` + `GuestResponse.tsx` caller update.
- **D3** — rewrite `get_extended_network`, `find_network_experts`, `can_reveal_identity` (and `get_third_plus_network`, `get_connection_path`, `get_degree_of_separation`) to derive the viewer from `auth.uid()` and drop the caller-supplied id; `REVOKE … FROM anon` (keep `authenticated`). Migration `20260610120600` + front-end caller updates (remove the now-unused viewer arg). Keep `get_display_identity`'s anonymity decision driven by `auth.uid()`, not a parameter.
- **Acceptance:** anon cannot call any network/preview RPC; an authenticated user can only query **their own** vantage point; passing someone else's id is impossible (no such param); guest preview requires a valid token.

### Phase 3 — Edge-function hardening
- **F6** — `_shared/validation.ts` (Zod/valibot) with per-function schemas mirroring client caps (name ≤100, contact ≤120, recommendation ≤2000, reason ≤1000, link `^https?://`, body size cap). Call at the top of every function after auth. Also enforce on the guest contribution write path.
- **F5** — `check-request-expiry`: require `x-cron-secret === Deno.env.get('CRON_SECRET')` → 401 otherwise; set the secret in the scheduled-job config. (`verify_jwt=false` stays.)
- **F7** — move Gemini key to `x-goog-api-key` header in the 4 `ai-*` functions; clean the URL.
- **F8** — in `ai-normalize-entries`, assert each `group.variations[i]` exists in submitted `entries` and bound/charset-check `group.canonical` (≤500); skip non-matching groups.
- **F9** — in `ai-update-user-expertise`, prefer model JSON mode/`responseSchema`; else non-greedy match + `Array.isArray` / length / element-type validation before write.
- **F10** — emit a metric/log on `check_rate_limit` errors (guard outage is visible); make `ai-smart-suggestions` fail-**closed** (it's per-keystroke).
- **Acceptance:** oversized/malformed bodies rejected pre-DB-write; `check-request-expiry` without the secret → 401; no API key in any logged URL; limiter-failure log line present.

### Phase 4 — PII column model + votes privacy
- **D4** — move `phone_number` (and likely `location`) out of directly-selectable `profiles`: either a `profile_private` table (self/admin RLS) or `REVOKE SELECT ON profiles FROM authenticated, anon` + `GRANT SELECT (id, full_name, handle, is_verified, …)` column privileges, exposing sensitive columns only through `get_safe_profile_view`. Migration `20260610120800` + caller updates to route PII reads through the RPC. **Heaviest change — stage and smoke-test profile/contact screens thoroughly.**
- **D6** — restrict `directory_votes`/`master_directory_votes` SELECT to `voter_id = auth.uid()`; serve public counts via an aggregating view/RPC that never returns voter id. Migration `20260610120400` + `DirectoryListDetail.tsx`/`Lists.tsx` to consume counts via the aggregate.
- **Acceptance:** a friend can no longer `select('phone_number')` off `profiles`; anon/other users cannot read individual `voter_id` rows; vote counts still render.

### Phase 5 — Client hardening + supply chain (low coupling, can parallelize)
- **F11** — route logging through `logger`; log `error?.message`/codes, not whole objects; redact known PII fields in prod; fix `logger.ts` import-time flag caching.
- **F12** — ship CSP: `script-src 'self'`, `connect-src` Supabase URL, `frame-ancestors 'none'`, `object-src 'none'` (closes the unfinished half of `remediation/13-session-csp.md`). Re-evaluate `httpOnly` cookie storage as a follow-up (documented residual risk, not blocking).
- **F13** — `npm audit fix`; add `.github/workflows/dependency-audit.yml` running `npm audit --audit-level=high` on PR + schedule (closes A4). Re-run `npm run build` to confirm no breakage.

---

## 4. Verification & rollout

Follow `docs/DEPLOYMENT.md`:
1. **Staging clone of prod** (`pg_dump --schema-only --schema=public` → restore), apply the new `20260610*` migrations in order, deploy the 7 functions, set `CRON_SECRET` + the cron secret header.
2. **Smoke matrix:** guest page (token valid/invalid), friend-request notification fan-out, network/extended-network pages, directory vote display, profile view (in-network vs not), each AI endpoint (valid + oversized body), `check-request-expiry` (with/without secret), anon negative tests (D1/D2/D3/D7 all denied).
3. **Linter:** Supabase advisor → `function_search_path_mutable` clean; no world-readable PII tables.
4. Repeat on **prod**; front-end merge and back-end apply happen in the **same window**.

## 5. Rollback

- Each migration is paired with a documented inverse (re-`GRANT`, re-`CREATE POLICY`) kept in `docs/SECURITY_REMEDIATION_CHANGES.md`. RLS-enable is never rolled back (CI-guarded). If a phase regresses the app, roll back **that phase's front-end + migration together**; Phases 0/1/3/5 are independently revertible. Phase 2 (signature changes) and Phase 4 (profiles) are the highest-risk and get their own staging sign-off before prod.

## 6. Tracking checklist

- [ ] Phase 0 — D1, D7 revokes (`20260610120000`)
- [ ] Phase 1 — F4/D5 search_path (`…0300`); F1/F2 share_links + GuestResponse (`…0100`); CI definer guard
- [ ] Phase 2 — D8 lockdown (`…0700`); D2 preview token (`…0500`); D3 network auth.uid() (`…0600`) + callers
- [ ] Phase 3 — F5 cron secret; F6 validator; F7 key header; F8/F9 AI output; F10 limiter alert
- [ ] Phase 4 — D4 profile PII (`…0800`); D6 votes (`…0400`) + callers
- [ ] Phase 5 — F11 logging; F12 CSP; F13 npm audit + CI dep-scan
- [ ] Staging smoke matrix green → prod deploy → post-deploy anon negative tests

> Defer-with-rationale: none. F10 fail-open is retained **by design** (cost guard, not authn) but now alerts. The `sharonjoseph2010@gmail.com` admin seed is informational (env-driven seeding is a hygiene follow-up, not in scope here).
