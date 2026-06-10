-- ============================================================================
-- SECURITY — Phase 2: token-gate the guest preview (D2)
--
-- Remediates (docs/SECURITY_REMEDIATION_PLAN_2026-06-10.md, Phase 2):
--   D2 (P1) — get_guest_page_preview(p_request_id) is SECURITY DEFINER, granted
--             to anon, and returns the actual recommendation CONTENT for a
--             request given ONLY its request_id (no share token). request_ids
--             are not secrets (they appear in URLs, logs, share_links), so any
--             anon caller who learns/harvests one reads the request's answers.
--
-- FIX: require the share token, exactly like the sibling get_request_for_guest.
-- The old single-arg overload is dropped so the un-gated version cannot be
-- called. Signature/body verified against supabase/schema_baseline.sql.
--
-- NOTE: the re-GRANT to anon here is re-asserted by the Phase 2 anon-grant
-- lockdown (D8, 20260610120700) which keeps this (now token-gated) function on
-- the small anon allowlist.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_guest_page_preview(uuid);

CREATE OR REPLACE FUNCTION public.get_guest_page_preview(p_request_id uuid, p_token text)
RETURNS TABLE(recommendation_text text, reason text, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Gate on a valid (request_id, token) pair — mirrors get_request_for_guest.
  IF NOT EXISTS (
    SELECT 1 FROM public.share_links sl
    WHERE sl.request_id = p_request_id AND sl.token = p_token
  ) THEN
    RETURN;  -- no token / wrong token -> no rows
  END IF;

  RETURN QUERY
  WITH all_recs AS (
    SELECT
      rr.recommendation_text,
      rr.reason,
      COUNT(*) OVER () AS total_count,
      ROW_NUMBER() OVER (ORDER BY rr.vote_count DESC, rr.created_at ASC) AS rn
    FROM request_responses resp
    JOIN response_recommendations rr ON rr.response_id = resp.id
    WHERE resp.request_id = p_request_id
      AND (rr.merged_away IS NULL OR rr.merged_away = false)
  )
  SELECT ar.recommendation_text, ar.reason, ar.total_count
  FROM all_recs ar
  WHERE ar.rn <= 2
  ORDER BY ar.rn;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_guest_page_preview(uuid, text) TO anon, authenticated;
