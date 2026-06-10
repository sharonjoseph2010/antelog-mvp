-- ============================================================================
-- SECURITY — Phase 1: lock down share_links anon access (F1, F2)
--
-- Remediates (docs/SECURITY_REMEDIATION_PLAN_2026-06-10.md, Phase 1):
--   F1 (P1) — "Anyone can read share links" (anon SELECT USING (true)) lets any
--             unauthenticated caller dump EVERY share token in the system,
--             defeating the token-as-secret model RLS was meant to provide.
--   F2 (P2) — "Anyone can update share link counters" (anon UPDATE USING (true),
--             no column scope, no WITH CHECK) lets anon overwrite ANY column of
--             ANY row (lock guests out, corrupt analytics).
--
-- Approach: remove anon DIRECT table access and route every legitimate guest
-- need through token-validated SECURITY DEFINER RPCs that expose only the
-- non-sensitive fields. The authenticated owner policies ("...their own share
-- links") are unchanged. Guest forwarding (anon INSERT) — which has been broken
-- since RLS was enabled (there is no anon INSERT policy) — is restored here in a
-- controlled form via create_guest_share_link().
--
-- Signatures/columns verified against supabase/schema_baseline.sql.
-- ============================================================================

-- F1 / F2 — drop the world-open anon policies -------------------------------
DROP POLICY IF EXISTS "Anyone can read share links"            ON public.share_links;
DROP POLICY IF EXISTS "Anyone can view share links by token"   ON public.share_links;  -- legacy name (20260226064421)
DROP POLICY IF EXISTS "Anyone can update share link counters"  ON public.share_links;

-- ---------------------------------------------------------------------------
-- resolve_share_link(p_token) — the guest page's single read.
-- Returns ONLY display fields for the one link matching the token, plus the
-- sharing chain (root -> current) with names already resolved. Never returns
-- other tokens, generated_by_user_id, or generated_by_contact.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_share_link(p_token text)
RETURNS TABLE (
  id                uuid,
  generated_by_name text,
  forwarder_name    text,
  current_responses integer,
  max_responses     integer,
  times_opened      integer,
  chain             jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT sl.id INTO v_id FROM public.share_links sl WHERE sl.token = p_token;
  IF v_id IS NULL THEN
    RETURN;  -- unknown token -> no rows
  END IF;

  RETURN QUERY
  WITH RECURSIVE up AS (
    SELECT sl.id, sl.parent_link_id, sl.generated_by_user_id,
           sl.generated_by_name, sl.forwarder_name, 0 AS depth
    FROM public.share_links sl
    WHERE sl.id = v_id
    UNION ALL
    SELECT pl.id, pl.parent_link_id, pl.generated_by_user_id,
           pl.generated_by_name, pl.forwarder_name, up.depth + 1
    FROM public.share_links pl
    JOIN up ON pl.id = up.parent_link_id
    WHERE up.depth < 10
  )
  SELECT
    cur.id, cur.generated_by_name, cur.forwarder_name,
    cur.current_responses, cur.max_responses, cur.times_opened,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object('name',
                 COALESCE(pr.full_name, up.forwarder_name, up.generated_by_name))
               ORDER BY up.depth DESC)        -- root first, current last
      FROM up
      LEFT JOIN public.profiles pr ON pr.id = up.generated_by_user_id
    ), '[]'::jsonb)
  FROM public.share_links cur
  WHERE cur.id = v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_share_link(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Counter bumps — replace the world-open anon UPDATE (F2). Each validates the
-- token and touches only its counter column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_share_link_open(p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.share_links
     SET times_opened = COALESCE(times_opened, 0) + 1
   WHERE token = p_token;
$$;
GRANT EXECUTE ON FUNCTION public.increment_share_link_open(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_share_link_response(p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.share_links
     SET current_responses = COALESCE(current_responses, 0) + 1,
         updated_at = now()
   WHERE token = p_token;
$$;
GRANT EXECUTE ON FUNCTION public.increment_share_link_response(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_guest_share_link(parent_token, name, contact) — controlled guest
-- forwarding. Derives request_id + parent_link_id from the validated parent
-- token (never trusts a client-supplied request_id), mints a token, and inserts
-- the child link. Mirrors the client length caps (F6 for this write path).
-- Returns the new token.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_guest_share_link(
  p_parent_token text,
  p_name         text,
  p_contact      text DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent  public.share_links%ROWTYPE;
  v_name    text := nullif(btrim(p_name), '');
  v_contact text := nullif(btrim(p_contact), '');
  v_token   text;
BEGIN
  IF v_name IS NULL OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;
  IF v_contact IS NOT NULL AND length(v_contact) > 120 THEN
    RAISE EXCEPTION 'invalid contact';
  END IF;

  SELECT * INTO v_parent FROM public.share_links WHERE token = p_parent_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid parent token';
  END IF;

  v_token := public.generate_share_token();

  INSERT INTO public.share_links (
    request_id, parent_link_id, token, generated_by_name, forwarder_name,
    generated_by_contact, max_responses, current_responses
  ) VALUES (
    v_parent.request_id, v_parent.id, v_token, v_name, v_name,
    v_contact, 5, 0
  );

  RETURN v_token;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_guest_share_link(text, text, text) TO anon, authenticated;
