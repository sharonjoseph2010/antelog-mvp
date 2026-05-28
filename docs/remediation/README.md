# Remediation Deep Dives

One document per finding from [`SECURITY_REVIEW.md`](../SECURITY_REVIEW.md). Each covers the *why*, *what could break*, *gotchas during rollout*, and *common pitfalls + how to solve them*. Patches and SQL live in [`SECURITY_REMEDIATION.md`](../SECURITY_REMEDIATION.md); these docs are about everything around the patch.

## Block 1 — Stop the bleed (P0)

1. [Re-enable RLS on all 23 tables](./01-reenable-rls.md)
2. [Untrack `.env` and rotate keys](./02-untrack-env.md)
3. [Fix `ai-update-user-expertise` — derive identity from JWT](./03-ai-update-user-expertise.md)
4. [Fix `rematch-contacts` — scope to caller or admin-only](./04-rematch-contacts.md)
5. [Fix `ai-normalize-entries` — verify ownership](./05-ai-normalize-entries.md)

## Block 2 — Defense in depth (P1)

6. [`guest_contributions` — explicit policies + RPC](./06-guest-contributions.md)
7. [`recommendation_votes` — remove public read](./07-recommendation-votes.md)
8. [Admin gate via `user_roles`](./08-admin-gate.md)
9. [`ListEdit` — explicit owner check](./09-listedit-owner-check.md)
10. [Rate limiting middleware](./10-rate-limiting.md)

## Block 3 — Hygiene (P2 / P3)

11. [CORS — origin allowlist](./11-cors.md)
12. [LLM prompt-injection hardening](./12-prompt-injection.md)
13. [Session storage + Content-Security-Policy](./13-session-csp.md)
14. [Drop `InternalRoute` state guard](./14-internalroute-guard.md)
15. [Sanitise edge function error messages](./15-edge-error-messages.md)
16. [Strip production `console.log` of identifiers](./16-console-logging.md)
17. [`GuestResponse` Zod validation](./17-guestresponse-validation.md)

## Cross-cutting

- [A1. Shared edge-function helpers](./A1-shared-helpers.md)
- [A2. CI guard against `DISABLE ROW LEVEL SECURITY`](./A2-ci-rls-guard.md)
- [A3. SECURITY DEFINER function audit](./A3-security-definer-audit.md)
- [A4. Dependency CVE scan](./A4-dependency-scan.md)
