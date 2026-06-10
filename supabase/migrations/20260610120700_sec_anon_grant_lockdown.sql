-- ============================================================================
-- SECURITY — Phase 2: lock down the anon function surface (D8)
--
-- Remediates (docs/SECURITY_REMEDIATION_PLAN_2026-06-10.md, Phase 2):
--   D8 (P2, structural) — ~93 functions are GRANT-ed EXECUTE to anon, and
--   ALTER DEFAULT PRIVILEGES auto-grants EVERY new function to anon. PostgREST
--   exposes them all as anon-callable endpoints, so D1/D2/D3/D7 were the default
--   posture, not one-offs. This flips anon EXECUTE from default-on to opt-in:
--   revoke the whole surface from anon, then re-grant ONLY the functions that
--   unauthenticated flows actually need.
--
-- This single migration is the broad sweep that closes the ANON side of
-- D1/D2/D3/D7 in one move (the function-specific fixes in the other Phase 0-2
-- migrations make those functions safe even if a grant is ever restored).
--
-- ── ANON ALLOWLIST (verified) ──────────────────────────────────────────────
-- Derived by auditing every public route (/, /signup, /guest-signup,
-- /waitlist, /login, /r/:id/:token) and every anon-applicable RLS policy:
--   * Only the guest page (/r/:id/:token, GuestResponse.tsx) calls RPCs as anon.
--   * The only anon INSERT policy (guest_contributions) calls share_link_matches
--     in its WITH CHECK, so anon needs EXECUTE on it.
-- Nothing else requires anon function execution.
--
-- NOTE: this only revokes the explicit anon grants (the Supabase model: PUBLIC
-- execute is already revoked, roles are granted explicitly). It does not touch
-- `authenticated` or `service_role`.
-- ============================================================================

-- 1) Stop auto-granting FUTURE functions to anon (undo the default privileges) -
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

-- 2) Revoke the entire existing function surface from anon --------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- 3) Re-grant ONLY the anon allowlist ---------------------------------------
--    Guest page reads:
GRANT EXECUTE ON FUNCTION public.get_request_for_guest(uuid, text)            TO anon;
GRANT EXECUTE ON FUNCTION public.get_guest_page_preview(uuid, text)           TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_share_link(text)                     TO anon;
--    Guest page counter bumps + forwarding:
GRANT EXECUTE ON FUNCTION public.increment_share_link_open(text)              TO anon;
GRANT EXECUTE ON FUNCTION public.increment_share_link_response(text)          TO anon;
GRANT EXECUTE ON FUNCTION public.create_guest_share_link(text, text, text)    TO anon;
--    Required by the guest_contributions INSERT RLS policy (WITH CHECK):
GRANT EXECUTE ON FUNCTION public.share_link_matches(uuid, uuid)               TO anon;

-- ── DEPLOY GATE ────────────────────────────────────────────────────────────
-- After applying on STAGING, smoke-test the FULL logged-out guest flow end to
-- end (load /r/:id/:token, preview, submit a recommendation, "pass it along").
-- A missing allowlist entry surfaces as a `permission denied for function`
-- error on the guest page. Rollback is `GRANT EXECUTE ... TO anon` for the
-- specific function. See docs/DEPLOYMENT_2026-06-10.md (Phase 2).
-- ============================================================================
