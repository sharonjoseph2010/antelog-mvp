-- ============================================================================
-- SECURITY — Phase 0: revoke unauthenticated PII / debug RPC access
--
-- Remediates (see docs/SECURITY_REMEDIATION_PLAN_2026-06-10.md, Phase 0):
--   D1 (P0) — find_profile_by_normalized_phone: anon, unauthenticated
--             phone -> identity reverse lookup. SECURITY DEFINER, bypasses
--             profiles RLS, identity taken from a parameter, returns
--             full_name + phone_number, enumerable. Mass PII / membership oracle.
--   D7 (P2) — debug_phone_match / debug_anonymous_match: debug helpers reachable
--             by anon; oraclize the phone-matching logic behind D1.
--
-- These three functions have NO call sites in src/ or supabase/functions/
-- (only auto-generated types.ts mentions them), so revoking is zero-impact on
-- the app. The contact-matching flow runs server-side under the service role
-- (rematch-contacts), which KEEPS its grant below — matching is unaffected.
--
-- REVOKE is chosen over DROP for this emergency phase: it fully closes the
-- anon exposure, requires no types regeneration, and is trivially reversible.
-- Dropping the debug functions outright is tracked as a hygiene follow-up.
--
-- Reversible by re-GRANTing EXECUTE to the same roles (do NOT — that re-opens
-- the finding). Signatures verified against supabase/schema_baseline.sql.
-- ============================================================================

-- D1 -------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.find_profile_by_normalized_phone(input_phone text, exclude_user_id uuid)
  FROM anon, authenticated;

-- D7 -------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.debug_phone_match(contact_phone_input text, profile_phone_input text)
  FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.debug_anonymous_match(p_request_id uuid, p_uid uuid)
  FROM anon, authenticated;
