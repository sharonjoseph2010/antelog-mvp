# Security Review — antelog-mvp (2026-06-10)

**Reviewer:** akp (Claude-assisted)
**Branch:** `main` @ `0f8fb83`
**Scope:** RLS / authorization, Supabase edge functions, client-side code, secrets, dependency CVEs.
**Method:** Source audit reconciled against **`supabase/schema_baseline.sql`** (the dump of the *live prod* schema, per the remediation note in `20260606120000_security_enable_rls.sql`). Migration history alone is misleading because RLS was globally disabled and later re-enabled, and several policies were changed out-of-band — so prod truth = baseline + the `20260606*` security migrations.

> **This is a re-review.** A prior pass (`docs/SECURITY_REVIEW.md`, 2026-05-28) found 17 + A1–A4 issues, most of which have since been **remediated** (see §4). This document focuses on what is **still open**, **incompletely remediated**, or **newly observed**, and corrects one stale claim in the earlier review.

---

## 1. Severity Summary

| # | Finding | Severity | Area | Status |
|---|---------|----------|------|--------|
| F1 | `share_links` is **world-readable by `anon`** (`USING (true)`) — leaks every share token | **P1 — High** | RLS | **Open** (prior review was wrong here) |
| F2 | `share_links` counters **world-updatable by `anon`** (`USING (true) WITH CHECK (true)`) | **P2 — Med** | RLS | Open |
| F3 | `notifications` INSERT is `WITH CHECK (true)` — any user can write notifications to any user | **P2 — Med** | RLS / phishing | Open |
| F4 | `update_directory_item_vote_count()` is `SECURITY DEFINER` with **no `SET search_path`** | **P2 — Med** | SQL privesc | Open |
| F5 | `check-request-expiry` (`verify_jwt=false`, service role) has **no invocation secret / rate limit** | **P2 — Med** | AuthZ / abuse | Open |
| F6 | Edge functions do **no runtime body validation**; guest writes are token-gated but unbounded | **P2 — Med** | Input validation / DoS | Open |
| F7 | Gemini API key passed in **URL query string** (4 functions) | **P3 — Low** | Secrets / logs | Open |
| F8 | `ai-normalize-entries` writes LLM output to the global directory without matching it to input | **P3 — Low** | Data integrity | Open (admin-gated) |
| F9 | `ai-update-user-expertise` uses a **greedy** regex to extract JSON from model output | **P3 — Low** | Robustness | Open |
| F10 | Rate limiter **fails open** — a DB hiccup disables all cost/abuse protection | **P3 — Low** | Abuse / cost | By design; document |
| F11 | Raw `console.error(error)` across pages + cached debug flag — potential PII in logs | **P3 — Low** | Info disclosure | Open |
| F12 | **No Content-Security-Policy**; session in `localStorage` means any XSS exfiltrates the JWT | **P3 — Low** | Session / XSS | Open |
| F13 | **11 dependency CVEs** (postcss XSS, ws mem-disclosure, yaml DoS, …) — all build-chain | **P3 — Low** | Supply chain | Open |

No **P0** issues remain open. The earlier P0s (RLS globally off, committed `.env`, IDOR in edge functions) are fixed — see §4.

---

## 2. Open Findings (detail)

### F1 — `share_links` is world-readable by `anon` (P1)

**Location:** `supabase/schema_baseline.sql:5555`
```sql
CREATE POLICY "Anyone can read share links" ON public.share_links FOR SELECT TO anon USING (true);
```
(Equivalent to migration `20260226064421_*.sql:3`, `"Anyone can view share links by token" … USING (true)`.)

**WHY it matters.** The `share_links` row *is* the secret capability for guest access — it holds the `token`, plus `request_id`, `generated_by_user_id`, `generated_by_name`, and the response counters. With `USING (true)` granted to `anon`, an unauthenticated client using the **public anon key shipped in the SPA** can run `supabase.from('share_links').select('*')` and **dump every token in the system**. Each `(request_id, token)` pair then feeds the `get_request_for_guest(p_request_id, p_token)` RPC (`20260606120000_*.sql`), which returns the title, location, status, and creator name of *any* shared request. The token-as-secret model — the whole point of enabling RLS on `requests` — is fully defeated. Harvested tokens also let an attacker POST to `guest_contributions` for any request (its INSERT policy only checks that `share_link_id`/`request_id` match a real link).

> ⚠️ **Correction to the prior review.** `docs/SECURITY_REVIEW.md` (line 119) states share_links has *"RLS enabled with the comment 'no policies for now' … currently inaccessible to clients except via SECURITY DEFINER RPCs."* That is **not** the live state: prod has the `anon USING (true)` SELECT policy above. Re-verify against `schema_baseline.sql`, not the comment.

**How to fix.** Remove anon direct table access; force all guest reads through the token-validated RPC.
```sql
DROP POLICY IF EXISTS "Anyone can read share links"        ON public.share_links;
DROP POLICY IF EXISTS "Anyone can view share links by token" ON public.share_links;
-- Authenticated owners keep "Users can view their own share links".
-- Guests never need to read the table directly: get_request_for_guest()
-- already validates (request_id, token) as SECURITY DEFINER.
```
If a guest page genuinely needs to resolve a link, add a SECURITY DEFINER RPC that takes the token and returns only non-sensitive fields for the matching row — never `SELECT *` to `anon`.

---

### F2 — `share_links` counters are world-updatable by `anon` (P2)

**Location:** `supabase/schema_baseline.sql:5562`
```sql
CREATE POLICY "Anyone can update share link counters" ON public.share_links FOR UPDATE TO anon USING (true);
```

**WHY it matters.** `USING (true)` with no column restriction and no `WITH CHECK` lets any anonymous caller `UPDATE` **any** `share_links` row, any column — not just `times_opened`/`current_responses`. An attacker can set `current_responses >= max_responses` to lock legitimate guests out of a link (DoS), inflate `max_responses`, or corrupt analytics across all links. Postgres column-level RLS can't be expressed in `USING`, so "counters only" is not actually enforced here.

**How to fix.** Move counter increments into a SECURITY DEFINER RPC that takes the token, validates it, and bumps only the counter columns:
```sql
DROP POLICY IF EXISTS "Anyone can update share link counters" ON public.share_links;

CREATE OR REPLACE FUNCTION public.increment_share_link_open(p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.share_links
     SET times_opened = times_opened + 1
   WHERE token = p_token;
$$;
GRANT EXECUTE ON FUNCTION public.increment_share_link_open(text) TO anon, authenticated;
```

---

### F3 — `notifications` INSERT allows writing to any user (P2)

**Location:** migration `20251126112150_*.sql:6` (RLS now enforced via `20260606120000`)
```sql
CREATE POLICY "Authenticated users can create notifications"
ON notifications FOR INSERT TO authenticated WITH CHECK (true);
-- comment in the migration: "This allows any authenticated user to create notifications for any user"
```

**WHY it matters.** `WITH CHECK (true)` means any logged-in user can insert a notification row with an arbitrary `user_id`, `title`, `message`, and `related_user_id`. This is an **in-app phishing / spoofing** primitive: an attacker can drop *"⚠️ Verify your account — tap here"* into any or every user's inbox, impersonate the system, or mass-spam. (SELECT/UPDATE/DELETE on the table are correctly self-scoped to `user_id = auth.uid()`; only INSERT is wide open.)

**How to fix.** Constrain client inserts to self; route system-generated cross-user notifications through the service role / a SECURITY DEFINER function (which bypasses RLS anyway — that is how `check-request-expiry` already writes them).
```sql
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;
CREATE POLICY "Users create notifications for themselves"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
```

---

### F4 — `update_directory_item_vote_count()` lacks `SET search_path` (P2)

**Location:** `supabase/migrations/20260301162331_90afde38-*.sql:146`
```sql
$$ LANGUAGE plpgsql SECURITY DEFINER;   -- no SET search_path
```

**WHY it matters.** A `SECURITY DEFINER` function runs as its (privileged) owner. Without a pinned `search_path`, unqualified object names inside the body resolve against the **caller's** `search_path`. A user able to create objects in a schema that sorts earlier can shadow a referenced table/function and have the definer-owned function execute attacker SQL with elevated rights. It is also flagged by Supabase's own database linter (`function_search_path_mutable`).

**Note / verification:** the two *other* functions the initial scan flagged — `create_mutual_friend_suggestions()` and `audit_contact_access()` — are **already fixed**: their *latest* definitions (`20250814165215_*.sql:135` and `20250825062851_*.sql:11`) both set `SET search_path = public`. Only this one remains.

**How to fix.**
```sql
ALTER FUNCTION public.update_directory_item_vote_count() SET search_path = public;
-- or re-create with: ... $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```
Add a CI grep (extend `.github/workflows/security-guard.yml`) that fails on `SECURITY DEFINER` without an accompanying `SET search_path` — this matches the A3 remediation intent.

---

### F5 — `check-request-expiry` is internet-callable with the service role (P2)

**Location:** `supabase/config.toml` (`verify_jwt = false`) + `supabase/functions/check-request-expiry/index.ts`

**WHY it matters.** With `verify_jwt = false` and `adminClient()` (service-role, RLS-bypassing), **any anonymous HTTP caller** can invoke the function. Impact is bounded — the output is templated and idempotent (`expiry_notified = true` short-circuits re-runs, and it only touches *already-expired* requests) — so this is not a data-injection hole. But it is an unauthenticated trigger for notification fan-out and an un-rate-limited table scan (minor cost/DoS). The prior review judged this "appropriate"; that is true *only* if a network/secret boundary protects it. Add defense-in-depth:

**How to fix.** Require a shared secret that only the scheduler knows:
```ts
const expected = Deno.env.get("CRON_SECRET");
if (!expected || req.headers.get("x-cron-secret") !== expected) {
  return json(req, { error: "Unauthorized" }, 401);
}
```
Set `x-cron-secret` in the Supabase scheduled-job config. (Supabase `pg_cron`/`pg_net` jobs can send custom headers.)

---

### F6 — Edge functions trust the request body shape; guest writes are unbounded (P2)

**Location:** all functions use `await req.json()` and trust the TS interface; e.g. `ai-*`, `merge-recommendations`, and the guest INSERT path.

**WHY it matters.** RLS now gates *who* can write `guest_contributions` (valid share link), but **not the size or content**. A holder of any (now easily harvested — see F1) token can submit arbitrarily large `text`/`reason` payloads, exhausting storage and bloating reads. The client added a Zod schema (`GuestResponse.tsx`), but client validation is advisory — a raw POST bypasses it. No edge function runs server-side schema validation.

**How to fix.** Add one shared Zod (or valibot) validator in `_shared/` and call it at the top of every function after auth; mirror the client constraints (name ≤100, contact ≤120, recommendation text ≤2000, reason ≤1000, link `^https?://`). Reject oversized bodies before any DB write.

---

### F7 — Gemini API key in URL query string (P3)

**Location:** `ai-normalize-entries/index.ts:41`, `ai-smart-suggestions/index.ts:55`, `ai-update-user-expertise/index.ts:59`, `ai-suggest-category/index.ts:32` — `...:generateContent?key=${geminiKey}`.

**WHY it matters.** The key is read correctly from `Deno.env` and the call is server→Google over TLS (not exposed to browsers), so this is low risk. However, secrets in URLs are disproportionately likely to end up in logs, error traces, and proxy records. Google's API supports a header form; prefer it.

**How to fix.** Move the key to a header and keep the URL clean:
```ts
fetch(`https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
  body: JSON.stringify(payload),
});
```

---

### F8 — `ai-normalize-entries` writes model output to the global directory (P3)

**Location:** `ai-normalize-entries/index.ts` (parses `result.groups`, writes `group.canonical`, filters by `group.variations`).

**WHY it matters.** The function is correctly **admin-gated** (`isAdmin` check, `index.ts:16-21`), which caps exposure — but it still writes LLM-produced strings into the shared `master_directory` and trusts that `group.variations` correspond to the submitted entries. Prompt-injected content in the directory could steer the model to mislabel/merge entries. `_shared/promptSafety.ts` already wraps and guards input (good), but output is taken on faith.

**How to fix.** Before applying a group, assert every `group.variations[i]` exists in the submitted `entries`, and bound/charset-validate `group.canonical` (e.g. ≤500 chars). Skip groups that don't match rather than writing them.

---

### F9 — Greedy JSON extraction from model output (P3)

**Location:** `ai-update-user-expertise/index.ts:80` — `responseText.match(/\{[\s\S]*\}/)`.

**WHY it matters.** The greedy `[\s\S]*` spans from the first `{` to the **last** `}`. If the model emits more than one object (easy to induce), the captured slice is wrong and either throws or parses unintended data into the user's expertise tags. Robustness/data-integrity, not a direct breach.

**How to fix.** Prefer the model's JSON mode / `responseSchema` if available; otherwise use a non-greedy match and validate the parsed shape (`Array.isArray(tags)`, length caps, element types) before use.

---

### F10 — Rate limiter fails open (P3 — documented trade-off)

**Location:** `supabase/functions/_shared/rateLimit.ts` (returns `{ ok: true }` when `check_rate_limit` errors).

**WHY it matters.** Deliberate, and reasonable (the limiter is a cost guard, not an authn boundary). The residual risk: during a DB incident, **all** abuse/cost protection on the AI endpoints silently disappears — exactly when an attacker might be applying load.

**How to fix.** Keep fail-open, but emit a metric/alert on limiter failures so an outage of the guard is visible. Consider fail-*closed* specifically for the most expensive endpoints (`ai-smart-suggestions`, which can be called per-keystroke).

---

### F11 — PII risk in client logging (P3)

**Location:** many pages, e.g. `GuestResponse.tsx` (`console.error("Error submitting:", error)`), `ContactsImport.tsx`; plus `src/lib/logger.ts` caches its enabled flag at import time.

**WHY it matters.** Logging whole `error` objects can serialize API payloads / DB error detail (column names, ids, occasionally PII) into the browser console and any attached error-tracking sink. The custom `logger` is bypassed by these raw `console.error` calls.

**How to fix.** Log `error?.message` (or a code), not the object. Route all logging through `logger` and have it redact known PII fields in production.

---

### F12 — No Content-Security-Policy; JWT in `localStorage` (P3)

**Location:** `index.html` (no CSP `<meta>` / header); `src/integrations/supabase/client.ts:13` (`storage: localStorage`).

**WHY it matters.** `localStorage` session storage is the Supabase SPA default and is acceptable **only** while XSS hygiene holds — there is no `httpOnly` cookie fallback, so any single XSS exfiltrates the JWT in one line. No CSP means no second line of defense. No XSS sink was found in this review (`chart.tsx`'s `dangerouslySetInnerHTML` is fed static config, not user input), but the blast radius of a future XSS is total.

**How to fix.** Ship a CSP (via hosting headers or a `<meta http-equiv>`): restrict `script-src` to `'self'`, allow `connect-src` for the Supabase URL, set `frame-ancestors 'none'`, `object-src 'none'`. This is the unfinished half of the `13-session-csp.md` remediation.

---

### F13 — Dependency CVEs (P3)

**Source:** `npm audit` → **11 vulnerabilities (4 moderate, 7 high)**, all in the build/dev tool-chain:
- `postcss <8.5.10` — XSS via unescaped `</style>` (GHSA-qx2v-qp2m-jg93)
- `ws 8.0.0–8.20.0` — uninitialized memory disclosure (GHSA-58qx-3vcg-4xpx)
- `yaml 2.0.0–2.8.2` — stack overflow / DoS (GHSA-48c2-rrv3-qjmp)
- plus transitive `esbuild`/`vite`/`picomatch` advisories.

**WHY it matters.** These are dev/build dependencies, not shipped runtime code, so production exposure is low — but `postcss`/`vite` run over project source during build, and a compromised build chain is a supply-chain risk. The earlier review explicitly deferred a CVE scan (A4); this closes that gap.

**How to fix.** `npm audit fix` (most are non-breaking). Add a scheduled `npm audit --audit-level=high` CI job (the A4 remediation) so new advisories fail the build.

---

## 3. Verified Non-Issues / Intentional

- **`rate_limit_log`, `guest_recommendation_merges`** — RLS enabled, **no policies** = deny-all to clients. This is **correct**: they are written only by SECURITY DEFINER RPCs / the service role. Not a vulnerability.
- **Anon publishable key hard-coded in `client.ts:6`** — decoded JWT is `"role":"anon"`. Designed to be public; safe **now that RLS is enforced**. Keep it out of a service-role swap.
- **`requests` / `guest_contributions`** — the old `USING (true)` policies from `20260226064421` are **gone in prod** (replaced by creator/admin-scoped and token-gated policies in `schema_baseline.sql`). Verified against baseline; not current findings.
- **Admin model** — `user_roles` has RLS on; `has_role()` is SECURITY DEFINER with pinned `search_path`; there is no self-INSERT policy, so a normal user **cannot** escalate. The admin seed (`20260606120200_*.sql:16`) hard-codes `sharonjoseph2010@gmail.com` — informational only (low risk; consider env-driven seeding for hygiene).

## 4. Previously-Reported Issues Now Remediated (✅)

| Prior # | Issue | Evidence of fix |
|---------|-------|-----------------|
| #1 | RLS globally disabled | `20260606120000_security_enable_rls.sql` re-enables RLS on all core tables; `.github/workflows/security-guard.yml` blocks re-disabling (A2) |
| #2 | `.env` committed | `.env` no longer tracked (`git ls-files` → only `.env.example`); `.gitignore` ignores `.env*` |
| #3/#4/#5 | IDOR — functions trusted body `userId` / acted table-wide | `_shared/auth.ts:getUser()` derives identity from JWT; `ai-normalize-entries` is admin-gated; `rematch-contacts`/`merge-recommendations` scope to `caller.id` and verify ownership |
| #7 | `recommendation_votes` world-readable | `20260606120000` restricts SELECT to authenticated |
| #10 | No rate limiting | `_shared/rateLimit.ts` + `check_rate_limit` RPC on every user-facing function (see F10 caveat) |
| #11 | Wildcard CORS | `_shared/cors.ts` echoes origin only from an allowlist |
| #12 | Prompt injection | `_shared/promptSafety.ts` wraps input in `<USER_INPUT>` + `INJECTION_GUARD`, strips control chars, caps length |
| #17 | GuestResponse no client validation | Zod `guestContributionSchema` added (server validation still pending — see F6) |

---

## 5. Recommended Order of Work

1. **F1** (remove anon `share_links` SELECT) — restores the token-secrecy guarantee RLS was meant to provide. Quick SQL migration.
2. **F2, F3, F4** — three small RLS/function migrations (anon UPDATE → RPC; notifications self-scope; `search_path`). Bundle them.
3. **F5, F6** — cron secret + shared server-side body validator.
4. **F13** — `npm audit fix` + CI dep-scan job (A4).
5. **F7–F12** — hardening backlog (header-based key, model JSON validation, CSP, log redaction, limiter alerting).

All §2 fixes are migration- or function-level and should land before any wider production exposure; none requires a schema redesign.
