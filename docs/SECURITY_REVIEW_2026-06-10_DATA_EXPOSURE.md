# Security Review (Part 2) — Anonymous RPC Surface & PII Exposure

**Reviewer:** akp (Claude-assisted)
**Date:** 2026-06-10
**Branch:** `main` @ `0f8fb83`
**Companion to:** `docs/SECURITY_REVIEW_2026-06-10.md` (Part 1 — RLS policies, edge functions, dependencies)

**Why a second document.** Part 1 audited *table* RLS policies and edge functions. This pass audits a different, larger surface that RLS does **not** protect: the ~90 Postgres functions `GRANT`-ed `EXECUTE` to the **`anon`** role and exposed through PostgREST. Many are `SECURITY DEFINER` (they run as a privileged owner and **bypass RLS entirely**), and several take a user id / phone number **as a parameter** instead of deriving identity from `auth.uid()`. That combination — anon-callable + RLS-bypassing + caller-supplied identity — is an authorization model independent of the table policies, and it currently leaks PII and the social graph to unauthenticated callers.

All evidence is from `supabase/schema_baseline.sql` (the live-prod dump) unless noted.

---

## Severity Summary

| # | Finding | Severity | Area |
|---|---------|----------|------|
| D1 | `find_profile_by_normalized_phone` — **anon, unauthenticated phone→identity reverse lookup**, returns name + phone, enumerable | **P0 — Critical** | PII / enumeration |
| D2 | `get_guest_page_preview` — anon reads any request's recommendation **content** with only `request_id` (no share token) | **P1 — High** | Authz bypass / content leak |
| D3 | `get_extended_network`, `get_display_identity`, `find_network_experts` — anon social-graph traversal & **deanonymization** via caller-supplied `viewer_id` | **P1 — High** | IDOR / privacy |
| D4 | `profiles` SELECT policy is row-level only — in-network users read **`phone_number`** and other PII directly off the table, defeating "basic info only" intent | **P2 — Med** | PII / column exposure |
| D5 | Multiple `SECURITY DEFINER` functions lack `SET search_path` (`get_extended_network`, `find_network_experts`, `get_safe_profile_view`, …) | **P2 — Med** | SQL privesc |
| D6 | `directory_votes` / `master_directory_votes` world-readable **with `voter_id`** → deanonymized voting behavior | **P2 — Med** | Privacy |
| D7 | `debug_phone_match`, `debug_anonymous_match` exposed to `anon` | **P2 — Med** | Info disclosure |
| D8 | Systemic: blanket `GRANT ALL ON FUNCTIONS TO anon` + `ALTER DEFAULT PRIVILEGES … TO anon` | **P2 — Med** | Attack surface |

---

## D1 — Unauthenticated phone-number → identity reverse lookup (P0)

**Location:** `supabase/schema_baseline.sql` — function definition + `GRANT … TO anon` at line 6628.
```sql
CREATE FUNCTION public.find_profile_by_normalized_phone(input_phone text, exclude_user_id uuid)
RETURNS TABLE(id uuid, full_name text, handle text, phone_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name, p.handle, p.phone_number
  FROM profiles p
  WHERE public.normalize_phone_number(p.phone_number) = public.normalize_phone_number(input_phone)
    AND p.id != exclude_user_id AND p.full_name IS NOT NULL AND p.handle IS NOT NULL
  LIMIT 1;
END; $$;
-- GRANT ALL ON FUNCTION public.find_profile_by_normalized_phone(text, uuid) TO anon;
```

**WHY it matters.** This is the single most serious issue across both reviews.
- It is `SECURITY DEFINER`, so it **bypasses the `profiles` RLS** (including the `"Deny anonymous access to profiles"` policy).
- It is granted to **`anon`**, so **anyone** with the public anon key shipped in the SPA can call it — no login required.
- Identity comes from the `input_phone` **parameter**, not the caller, and there is **no `auth.uid()` check and no rate limiting** inside the function.
- It returns `full_name` and `phone_number`.

An attacker scripts `supabase.rpc('find_profile_by_normalized_phone', { input_phone: candidate, exclude_user_id: <random> })` over a list of phone numbers and learns, for each: *is this number on the platform, and what is the person's real name and handle?* That is mass PII harvesting, deanonymization, and a membership oracle — all unauthenticated and unthrottled. For a network/contacts product this is a flagship-class privacy breach.

**How to fix.**
1. **Revoke anon immediately:** `REVOKE ALL ON FUNCTION public.find_profile_by_normalized_phone(text, uuid) FROM anon;` (and from `authenticated` unless a specific in-app flow needs it).
2. The contact-matching use case should run **server-side** (the `rematch-contacts` / `match_*` edge path under the service role after authorizing the caller), never as a client-callable RPC that returns `phone_number`.
3. If a client lookup is truly required, make it return only a boolean/opaque match for the **caller's own** contacts, derive identity from `auth.uid()`, and gate it through `check_rate_limit`.

---

## D2 — Anon reads any request's recommendations without a share token (P1)

**Location:** `get_guest_page_preview(p_request_id uuid)`, `SECURITY DEFINER`, granted to `anon` (`schema_baseline.sql:6745`).
```sql
RETURNS TABLE(recommendation_text text, reason text, total_count bigint) … SECURITY DEFINER
-- selects rr.recommendation_text, rr.reason for ALL responses WHERE resp.request_id = p_request_id
```

**WHY it matters.** Part 1 (F1) showed the share-token model is the intended gate for guest access, and `get_request_for_guest` correctly requires `(request_id, token)`. This function bypasses that: it takes **only `request_id`** and returns the top recommendation **content** (`recommendation_text`, `reason`) plus a total count — the actual answers users contributed — to any anon caller, with no token. Request ids are UUIDs (not trivially guessable), but they are not secrets: they appear in URLs, share links, logs, and the `share_links` table (which is itself world-readable per Part 1 F1). So in practice an attacker who has — or harvests — a `request_id` reads the request's recommendations without ever holding its token.

**How to fix.** Require the share token like the sibling function does:
```sql
-- add p_token and validate it
… WHERE resp.request_id = p_request_id
  AND EXISTS (SELECT 1 FROM share_links sl WHERE sl.request_id = p_request_id AND sl.token = p_token)
```
Or restrict to `authenticated` callers who pass the request's audience/RLS check, and `REVOKE … FROM anon`.

---

## D3 — Social-graph traversal & deanonymization via caller-supplied id (P1)

**Locations (all `SECURITY DEFINER`, granted to `anon`):**
- `get_extended_network(user_id uuid)` → returns `profile_id, full_name, handle, mutual_friends[]` for **any** `user_id`.
- `get_display_identity(viewer_id uuid, profile_id uuid)` → returns real `full_name`/`handle` when `is_in_network(viewer_id, profile_id)`, else the anonymous handle.
- `find_network_experts(viewer_id uuid, query_domains text[])` → returns network members' names/handles/expertise.
- (`get_third_plus_network`, `get_connection_path`, `get_degree_of_separation`, `can_reveal_identity` follow the same pattern.)

**WHY it matters.** Every one of these takes the *viewer*/*user* as a **parameter** rather than from `auth.uid()`, is `SECURITY DEFINER` (RLS-bypassing), and is callable by **anon**. So the caller chooses whose vantage point to query:
- `get_extended_network(<any uuid>)` → an anon attacker enumerates **anyone's** 2nd-degree network, including **mutual-friend names** — a direct social-graph dump.
- `get_display_identity` decides anonymity from the *attacker-supplied* `viewer_id`. Passing `viewer_id = profile_id` (or any id known to be in-network with the target) forces `is_in_network → true` and **reveals the real name of an otherwise-anonymous user**. This defeats the app's anonymity feature.

Because identity is a parameter, this is textbook IDOR layered on top of unauthenticated access.

**How to fix.**
1. `REVOKE … FROM anon` for all of these (they have no legitimate anonymous use).
2. Remove the `viewer_id`/`user_id` parameter and use `auth.uid()` inside the function, so a caller can only ever query *their own* vantage point: e.g. `get_extended_network()` selecting `WHERE … = auth.uid()`. Update callers accordingly.
3. Keep `SECURITY DEFINER` only where needed to traverse `friendships`, and confirm each returns no more than the relationship justifies.

---

## D4 — `profiles` exposes `phone_number` to in-network users (column-level gap) (P2)

**Location:** `schema_baseline.sql:6182`, policy `"View basic profile info only"`.
```sql
FOR SELECT USING ( auth.uid() = id OR has_role(auth.uid(),'admin')
  OR (is_verified AND full_name IS NOT NULL AND handle IS NOT NULL
      AND (EXISTS(friendship with auth.uid()) OR (public list AND in get_extended_network(auth.uid())))) )
```

**WHY it matters.** The policy name says *"basic profile info only,"* but **RLS is row-level, not column-level**. Once the predicate lets a caller read a profile *row* (any friend, or a 2nd-degree connection who owns a public list), that caller can `select('phone_number, location, bio, occupation')` and get **all** of it. So a single accepted friend request grants direct read of a user's phone number and contact details straight off the table — the `get_safe_profile_view` RPC that *does* gate columns by relationship is bypassed by querying the table directly. Intent (hide contact PII) is not enforced.

**How to fix.** RLS can't restrict columns, so:
1. Move sensitive columns (`phone_number`, and arguably `location`) out of the directly-selectable `profiles` row — e.g. into a `profile_private` table with a stricter policy (self/admin only), or expose profiles to other users **only** through `get_safe_profile_view` and `REVOKE SELECT` on the base table from `anon`/`authenticated`, granting it back column-by-column with a `GRANT SELECT (id, full_name, handle, is_verified, …)`.
2. `GRANT SELECT (col, …)` column privileges + an RLS row predicate together give the "basic info only" behaviour the name promises.

---

## D5 — `SECURITY DEFINER` functions without `SET search_path` (P2)

**Locations:** `get_extended_network`, `find_network_experts`, `get_safe_profile_view` (and see Part 1 F4 for `update_directory_item_vote_count`). Each ends `… LANGUAGE plpgsql SECURITY DEFINER AS $$` with no `SET search_path`.

**WHY it matters.** Same mechanism as Part 1 F4: an unqualified object reference inside a definer-owned function resolves against the *caller's* `search_path`, allowing a user who can create same-named objects in an earlier schema to have privileged code execute attacker SQL. Supabase's linter flags every one (`function_search_path_mutable`).

**How to fix.** `ALTER FUNCTION public.<fn>(<args>) SET search_path = public;` for each, and add the CI grep proposed in Part 1 F4 so new definer functions can't merge without it.

---

## D6 — Voting behaviour is world-readable with voter identity (P2)

**Locations:**
- `directory_votes` — `"Users can view all directory votes" … USING (true)` (`schema_baseline.sql:6004`); table has `voter_id`, `vote_type` (upvote/downvote).
- `master_directory_votes` — `"Public read votes" … USING (true)` (`5694`); table has `user_id`, `item_id`.

**WHY it matters.** `USING (true)` with no role restriction (no `auth.uid()` predicate) means **anyone, including `anon`,** can read the full votes tables, which carry the voter's `user_id`/`voter_id`. That exposes per-user voting behaviour (who up/down-voted what) to the public — a privacy and harassment vector, and an easy join against `profiles` for deanonymization. `master_directory_items`/`_lists` being public-read is lower risk (curated content), but the **votes** carry identity.

**How to fix.** Restrict reads to authenticated users and hide the voter:
```sql
DROP POLICY IF EXISTS "Users can view all directory votes" ON public.directory_votes;
-- expose only aggregate counts via a view/RPC; if row read is needed, scope to own votes:
CREATE POLICY "Own directory votes" ON public.directory_votes FOR SELECT TO authenticated USING (voter_id = auth.uid());
```
Serve public vote *counts* through an aggregating view/RPC that never returns `voter_id`.

---

## D7 — Debug functions exposed to anon (P2)

**Locations:** `debug_phone_match(contact_phone_input, profile_phone_input)` (`6556`), `debug_anonymous_match(p_request_id, p_uid)` (`6547`) — both granted to `anon`.

**WHY it matters.** Debug helpers typically reveal internal matching logic and intermediate values; `debug_phone_match` in particular oraclizes the phone-normalization/matching that powers D1. Debug surfaces should never be reachable by unauthenticated callers in production.

**How to fix.** `DROP FUNCTION` them in prod, or at minimum `REVOKE ALL … FROM anon, authenticated`. Gate any retained debugging behind an admin-only RPC.

---

## D8 — Systemic: functions are granted to `anon` wholesale (P2)

**Locations:** ~90 explicit `GRANT ALL ON FUNCTION … TO anon` (`schema_baseline.sql:6429`–`7258`), plus:
```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;  -- :7639
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;  -- :7649
```

**WHY it matters.** The default-privileges grants mean **every new function** created by those roles is automatically executable by `anon` — so D1/D2/D3/D7 are not one-off mistakes but the default posture, and future functions inherit it silently. PostgREST exposes all of them as callable endpoints. The security boundary for a `SECURITY DEFINER` function is *inside the function* (it bypasses RLS); when the function also trusts a caller-supplied id, anon access becomes full data access.

**How to fix.**
1. Treat `anon` execute as opt-in, not default:
   ```sql
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
   REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
   ```
2. Re-grant **only** the handful genuinely needed by unauthenticated flows — `generate_share_token`, `share_link_matches`, `get_request_for_guest` (token-validated), and (after fixing) the guest preview.
3. Audit every retained `anon`/`authenticated` grant on a `SECURITY DEFINER` function for: does it derive identity from `auth.uid()` (not a parameter)? does it rate-limit? does it return only what the relationship allows?

---

## Recommended Order of Work

1. **D1** — revoke `find_profile_by_normalized_phone` from `anon` **today**; it is an unauthenticated PII reverse-lookup. (One `REVOKE`.)
2. **D8** — revoke the blanket function grants and re-grant the ~4 functions guest flows actually need; this closes D2/D3/D7 in one move.
3. **D2, D3** — additionally fix the functions themselves (token for preview; `auth.uid()` instead of `viewer_id` param) so they're safe even if re-granted.
4. **D4, D6** — restructure `profiles` PII columns and votes read access.
5. **D5** — add `SET search_path` to the remaining definer functions + CI guard (shared with Part 1 F4).

**Cross-reference:** Part 1 (`SECURITY_REVIEW_2026-06-10.md`) covers `share_links`/`notifications` RLS, edge-function hardening, CSP, logging, and dependency CVEs. Together the two documents cover RLS policies, the anon RPC surface, edge functions, client code, secrets, and supply chain.
