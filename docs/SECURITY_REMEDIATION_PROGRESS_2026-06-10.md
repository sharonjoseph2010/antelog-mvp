# Security Remediation — Progress Snapshot (2026-06-10)

**Owner:** akp · **As of:** 2026-06-10
**Plan:** `docs/SECURITY_REMEDIATION_PLAN_2026-06-10.md`
**Deploy runbook:** `docs/DEPLOYMENT_2026-06-10.md`
**Reviews:** `docs/SECURITY_REVIEW_2026-06-10.md` (F1–F13),
`docs/SECURITY_REVIEW_2026-06-10_DATA_EXPOSURE.md` (D1–D8)

This document tracks what has been built so far across the phased remediation.
It is a status artifact — the authoritative deploy steps live in the runbook.

---

## Status at a glance

| Phase | Findings | Branch | State | Code? |
|------|----------|--------|-------|-------|
| 0 | D1, D7 | `security/phase0-anon-pii-revoke-akp-20260610` | ✅ built & pushed | DB only |
| 1 | F1, F2, F4, D5 | `security/phase1-rls-quickwins-akp-20260610` | ✅ built & pushed | DB + FE |
| 2 | D2, D3, D8 | `security/phase2-anon-surface-akp-20260610` | ✅ built & pushed | DB + FE |
| 3 | F5–F10 (edge hardening) | — | ⏳ not started | Edge fns |
| 4 | D4, D6 (profiles PII, votes) | — | ⏳ not started | DB + FE |
| 5 | F11–F13 (logging, CSP, deps) | — | ⏳ not started | FE + CI |

**Coverage:** D1, D2, D3 (anon part), D5, D7, D8, F1, F2, F4 — **done**.
**Remaining:** F3, F5–F13, D4, D6, and one deferred item (below).

> Note: **F3** (notifications self-scope) was assigned to Phase 2 in the original
> plan but is not yet built — it needs a validated `create_notification` RPC
> because cross-user notification fan-out (friend requests, forwards) is a
> legitimate flow. Tracked for a later phase.

---

## Branch topology & merge order

Phases are separate PRs; the chain is **stacked**:

```
main
 └─ (PR #10) security/review-2026-06-10-akp-20260610     docs: reviews + plan
      └─ security/phase0-anon-pii-revoke-akp-20260610    D1, D7   (DB only)

main
 └─ security/phase1-rls-quickwins-akp-20260610           F1,F2,F4,D5
      └─ security/phase2-anon-surface-akp-20260610        D2,D3,D8
           └─ security/remediation-progress-akp-20260610  (this doc)
```

**Merge order:** docs (#10) → Phase 0 → Phase 1 → Phase 2. Phase 1 must precede
Phase 2 (Phase 2 re-grants RPCs Phase 1 creates). Migrations are timestamp-
ordered (`20260610120000` … `120700`), so `supabase db push` applies them in the
right sequence regardless. **Merging only redeploys the front-end — migrations
are applied manually per the runbook.**

---

## What shipped, per phase

### Phase 0 — revoke anon PII / debug RPCs (D1, D7)
- `20260610120000_sec_revoke_anon_pii.sql` — `REVOKE` anon/authenticated EXECUTE
  on `find_profile_by_normalized_phone` (P0 phone→identity lookup),
  `debug_phone_match`, `debug_anonymous_match`. `service_role` retained.
- Zero front-end coupling (no call sites). Commit `4b6ff3c`.

### Phase 1 — share_links lockdown + definer search_path (F1, F2, F4, D5)
- `20260610120100_sec_share_links_rls.sql` — drop the anon `SELECT`/`UPDATE`
  policies on `share_links`; add token-validated SECURITY DEFINER RPCs:
  `resolve_share_link`, `increment_share_link_open`,
  `increment_share_link_response`, `create_guest_share_link`.
- `20260610120300_sec_definer_search_path.sql` — pin `search_path = public` on
  `update_directory_item_vote_count`, `get_extended_network`,
  `find_network_experts`, `get_safe_profile_view`.
- `GuestResponse.tsx` rewritten to use the RPCs (no direct table access; chain
  resolved server-side). **Restores guest forwarding** (broken since RLS was
  enabled). Commits `466c727`, `f345348`.
- CI: `security-guard.yml` reworked — **fixed** a repo-wide grep that had failed
  every run since 2026-06-06, and **added** a `SECURITY DEFINER`-without-
  `search_path` check.

### Phase 2 — anon surface lockdown + network auth.uid() (D2, D3, D8)
- `20260610120500_sec_guest_preview_token.sql` — `get_guest_page_preview` now
  requires `(request_id, token)`; old overload dropped (D2).
- `20260610120600_sec_network_authuid.sql` — `find_network_experts` and
  `can_reveal_identity` pin the viewer to `auth.uid()` (D3).
- `20260610120700_sec_anon_grant_lockdown.sql` — `REVOKE ALL … FROM anon` +
  undo `ALTER DEFAULT PRIVILEGES … TO anon`; re-grant only the **7-function
  anon allowlist** (D8). Closes the anon side of D1/D2/D3/D7 structurally.
- `GuestResponse.tsx` (preview token), `RequestRespond.tsx` (symmetric
  `can_reveal_identity` swap). Commits `eac9ac6`, `bf76008`.

---

## Key decisions made

1. **PR shape:** separate PR per phase, merged in order (not one big PR, not a
   deep rebase chain beyond what dependencies require). Docs branch lands first
   so phase branches diff cleanly.
2. **Guest forwarding (Phase 1):** chose to **restore** it via a controlled
   `create_guest_share_link` RPC (it had been silently broken since RLS was
   enabled), rather than leave it broken or delete the UI.
3. **`get_extended_network` (Phase 2):** **deferred** the authenticated-IDOR
   fix — see below.
4. **D8 strategy:** full blanket revoke from anon + minimal re-grant allowlist
   (max surface reduction), gated on a mandatory staging smoke test, over a
   narrower targeted revoke.

---

## Deferred follow-ups

- **`get_extended_network` authenticated IDOR.** Anon access is closed (D8), but
  a logged-in user can still enumerate another user's 2nd-degree network via the
  `user_id` parameter. Deferred deliberately: the function is called inside the
  `profiles` RLS policy and `get_safe_profile_view` with varied viewer args, so a
  body guard / signature change must be validated on a **live staging DB** first.
  Owner: akp.

---

## Remaining work

- **Phase 3 — edge-function hardening (F5–F10):** CRON secret on
  `check-request-expiry` (F5), shared server-side body validator (F6), Gemini
  key → header (F7), AI output validation (F8/F9), limiter failure alerting +
  fail-closed on the per-keystroke endpoint (F10). No RLS coupling; can base on
  `main`.
- **Phase 4 — PII columns & votes (D4, D6):** move `phone_number`/`location` off
  the directly-selectable `profiles` row; restrict `directory_votes` /
  `master_directory_votes` reads + aggregate counts. Highest data-model risk.
- **Phase 5 — client & supply chain (F11–F13):** redact client logging, ship a
  CSP, `npm audit fix` + scheduled dep-scan CI.
- **F3 — notifications INSERT self-scope** via a validated `create_notification`
  RPC (see note above).
- The deferred `get_extended_network` item.
