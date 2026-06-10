-- ============================================================================
-- SECURITY — Phase 2: bind network-function viewer to auth.uid() (D3)
--
-- Remediates (docs/SECURITY_REMEDIATION_PLAN_2026-06-10.md, Phase 2):
--   D3 (P1) — get_extended_network / find_network_experts / can_reveal_identity
--             (and get_display_identity / get_connection_path /
--             get_degree_of_separation / get_third_plus_network) are
--             SECURITY DEFINER, granted to anon, and take the *viewer* as a
--             PARAMETER instead of deriving it from auth.uid(). That is IDOR +
--             unauthenticated social-graph traversal / deanonymization.
--
-- This migration handles the AUTHENTICATED-caller IDOR for the two functions
-- that are (a) called by the client and (b) safe to guard (no RLS/internal
-- callers): it pins the viewer to auth.uid() inside the body. The ANON exposure
-- for ALL of these functions is closed by the companion lockdown migration
-- (20260610120700, D8), which revokes the whole function surface from anon.
--
--   * find_network_experts(viewer_id, ...) — only caller is the client
--     (RequestsNew.tsx), which passes the current user. Guard viewer_id.
--   * can_reveal_identity(p_viewer_id, ...) — only caller is the client
--     (RequestRespond.tsx). The function is symmetric in (viewer, target), so
--     the one call site that passed the *creator* as viewer is updated to pass
--     auth.uid() as viewer with the creator as target (same result). Guard
--     p_viewer_id.
--
-- NOT changed here (deliberate — see plan):
--   get_extended_network MUST keep its parameter form and its `authenticated`
--   EXECUTE grant: the `profiles` RLS policy "View basic profile info only"
--   (schema_baseline.sql:6182) and get_safe_profile_view both call it, as do
--   several other SECURITY DEFINER functions, with varied viewer arguments. A
--   body guard or signature change risks breaking profile reads app-wide. Its
--   anon exposure is closed by D8; the residual *authenticated* IDOR on it is
--   tracked as a dedicated, staging-validated follow-up.
--
-- Bodies reproduced from supabase/schema_baseline.sql with only the auth.uid()
-- guard prepended and search_path pinned.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- find_network_experts — pin viewer to the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_network_experts(viewer_id uuid, query_domains text[])
RETURNS TABLE(profile_id uuid, full_name text, handle text, matching_domains text[], degree integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- IDOR guard: a caller may only query their own vantage point.
  IF auth.uid() IS NULL OR viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN;
  END IF;

  RETURN QUERY
  -- 1st degree friends with matching expertise
  SELECT
    p.id as profile_id,
    p.full_name,
    p.handle,
    ARRAY(
      SELECT UNNEST(ARRAY(SELECT jsonb_array_elements_text(p.expertise_domains)))
      INTERSECT
      SELECT UNNEST(query_domains)
    ) as matching_domains,
    1 as degree
  FROM friendships f
  JOIN profiles p ON (
    CASE WHEN f.user1_id = viewer_id THEN p.id = f.user2_id ELSE p.id = f.user1_id END
  )
  WHERE (f.user1_id = viewer_id OR f.user2_id = viewer_id)
    AND p.expertise_domains IS NOT NULL
    AND p.expertise_domains != '[]'::jsonb
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(p.expertise_domains) AS ed
      WHERE ed = ANY(query_domains)
    )

  UNION ALL

  -- 2nd degree connections with matching expertise
  SELECT
    p.id as profile_id,
    p.full_name,
    p.handle,
    ARRAY(
      SELECT UNNEST(ARRAY(SELECT jsonb_array_elements_text(p.expertise_domains)))
      INTERSECT
      SELECT UNNEST(query_domains)
    ) as matching_domains,
    2 as degree
  FROM get_extended_network(viewer_id) en
  JOIN profiles p ON p.id = en.profile_id
  WHERE p.expertise_domains IS NOT NULL
    AND p.expertise_domains != '[]'::jsonb
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(p.expertise_domains) AS ed
      WHERE ed = ANY(query_domains)
    )
    AND NOT EXISTS (
      SELECT 1 FROM friendships f2
      WHERE (f2.user1_id = viewer_id AND f2.user2_id = p.id)
         OR (f2.user2_id = viewer_id AND f2.user1_id = p.id)
    )

  ORDER BY degree ASC, full_name ASC
  LIMIT 5;
END;
$$;

-- ---------------------------------------------------------------------------
-- can_reveal_identity — pin viewer to the caller. Function is symmetric in
-- (viewer, target), so callers that previously passed a non-self viewer pass
-- auth.uid() as viewer and the other party as target (updated in the client).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_reveal_identity(p_viewer_id uuid, p_request_id uuid, p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_creator uuid;
  v_friends boolean;
BEGIN
  -- IDOR guard: the viewer must be the caller.
  IF auth.uid() IS NULL OR p_viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  IF p_viewer_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Self always reveals
  IF p_viewer_id = p_target_user_id THEN
    RETURN true;
  END IF;

  -- Direct 1st-degree friendship always reveals
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE (f.user1_id = p_viewer_id AND f.user2_id = p_target_user_id)
       OR (f.user2_id = p_viewer_id AND f.user1_id = p_target_user_id)
  ) INTO v_friends;
  IF v_friends THEN
    RETURN true;
  END IF;

  IF p_request_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT creator_id INTO v_creator FROM public.requests WHERE id = p_request_id;
  IF v_creator IS NULL THEN
    RETURN false;
  END IF;

  IF p_viewer_id = v_creator AND public.user_in_direct_audience(p_target_user_id, p_request_id) THEN
    RETURN true;
  END IF;

  IF p_target_user_id = v_creator AND public.user_in_direct_audience(p_viewer_id, p_request_id) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
