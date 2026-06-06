-- ============================================================================
-- SECURITY: Enable Row-Level Security on the core tables (finding #1)
--
--  ⚠️  STAGING-VERIFIED. This migration was validated by restoring the live
--      prod schema into a preprod project and applying it there.
--
-- KEY INSIGHT (confirmed on staging): prod ALREADY has correct, current RLS
-- policies defined on every core table — they are simply NOT ENFORCED because
-- RLS was globally disabled for MVP testing (migration 20251126112541).
-- Therefore the fix is to ENABLE RLS, NOT to re-create policies. (An earlier
-- draft of this migration re-created policies from the security review and was
-- WRONG — the schema has since evolved, e.g. requests.audience_types is now an
-- array with values first_network/group/specific_people/public/
-- anonymous_expertise. Enabling the existing policies is correct and safe.)
--
-- Edge functions (service-role) and SECURITY DEFINER triggers bypass RLS, so
-- server-side writes keep working.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- #1 — Enable RLS on every core table that has policies defined but disabled.
--      (List derived from the live prod schema: tables with CREATE POLICY but
--       no ENABLE ROW LEVEL SECURITY.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.anonymous_handles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colleges                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_access_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_imports              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_suggestions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_items                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lists                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_directory_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_directory_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_directory_lists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_directory_votes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_anonymous_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_forwards             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_responses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_votes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_expertise               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles                   ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- #7 — recommendation_votes had a world-readable SELECT (USING (true)).
--      Restrict to authenticated. (RLS is already enabled on this table.)
-- ============================================================================
DROP POLICY IF EXISTS "Users can view all votes" ON public.recommendation_votes;
CREATE POLICY "Authenticated can view recommendation votes"
ON public.recommendation_votes FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- #6 — guest_contributions had RLS off and NO policies. Enable + add policies.
--      Anon insert is gated by a valid share link (token flow); the request
--      creator (or admin) can read contributions.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.share_link_matches(p_link_id uuid, p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.share_links sl
    WHERE sl.id = p_link_id AND sl.request_id = p_request_id
  );
$$;
GRANT EXECUTE ON FUNCTION public.share_link_matches(uuid, uuid) TO anon, authenticated;

ALTER TABLE public.guest_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Request creators can view guest contributions" ON public.guest_contributions;
DROP POLICY IF EXISTS "Guests can insert contributions via valid share link" ON public.guest_contributions;

CREATE POLICY "Request creators can view guest contributions"
ON public.guest_contributions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.requests r WHERE r.id = guest_contributions.request_id AND r.creator_id = auth.uid())
);
CREATE POLICY "Guests can insert contributions via valid share link"
ON public.guest_contributions FOR INSERT TO anon, authenticated
WITH CHECK (
  share_link_id IS NOT NULL
  AND public.share_link_matches(share_link_id, request_id)
);

-- ============================================================================
-- D3 — guest read of a request by share token (SECURITY DEFINER, anon).
-- Enabling RLS on `requests` blocks the unauthenticated /r/:id/:token page from
-- reading the request directly; this token-validated RPC returns the request +
-- creator name without granting anon any direct table access.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_request_for_guest(p_request_id uuid, p_token text)
RETURNS TABLE (
  id uuid,
  title text,
  category request_category,
  location text,
  status request_status,
  created_at timestamptz,
  expires_at timestamptz,
  creator_id uuid,
  creator_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.title, r.category, r.location, r.status, r.created_at, r.expires_at,
         r.creator_id, p.full_name AS creator_name
  FROM public.requests r
  JOIN public.share_links sl ON sl.request_id = r.id
  LEFT JOIN public.profiles p ON p.id = r.creator_id
  WHERE r.id = p_request_id AND sl.token = p_token
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_request_for_guest(uuid, text) TO anon, authenticated;
