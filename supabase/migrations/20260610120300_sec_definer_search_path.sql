-- ============================================================================
-- SECURITY — Phase 1: pin search_path on SECURITY DEFINER functions
--
-- Remediates (docs/SECURITY_REMEDIATION_PLAN_2026-06-10.md, Phase 1):
--   F4 (P2) — update_directory_item_vote_count() is SECURITY DEFINER with no
--             SET search_path.
--   D5 (P2) — get_extended_network, find_network_experts, get_safe_profile_view
--             are SECURITY DEFINER with no SET search_path.
--
-- WHY: a SECURITY DEFINER function runs as its privileged owner. Without a
-- pinned search_path, unqualified object names resolve against the CALLER's
-- search_path, so a user who can create same-named objects in an earlier schema
-- can shadow a referenced table/function and have the definer-owned function run
-- attacker SQL with elevated rights. Supabase's linter flags each as
-- `function_search_path_mutable`.
--
-- ALTER ... SET search_path attaches the setting without changing the body, so
-- it is safe and signature-preserving. Signatures verified against
-- supabase/schema_baseline.sql.
--
-- NOTE: get_extended_network and find_network_experts are additionally
-- *rewritten* in Phase 2 (D3) to derive identity from auth.uid() and drop the
-- caller-supplied id parameter; that CREATE OR REPLACE re-declares
-- SET search_path on the new signatures. Pinning them here closes D5 for the
-- currently-deployed signatures regardless of Phase 2 timing.
-- ============================================================================

-- F4 ------------------------------------------------------------------------
ALTER FUNCTION public.update_directory_item_vote_count() SET search_path = public;

-- D5 ------------------------------------------------------------------------
ALTER FUNCTION public.get_extended_network(user_id uuid) SET search_path = public;
ALTER FUNCTION public.find_network_experts(viewer_id uuid, query_domains text[]) SET search_path = public;
ALTER FUNCTION public.get_safe_profile_view(profile_id uuid) SET search_path = public;
