-- ============================================================================
-- SECURITY: Re-enable Row-Level Security on all core tables (finding #1)
--
--  ⚠️  STAGING FIRST. Highest blast radius in the whole remediation.
--      Apply to a non-prod project and smoke-test EVERY flow (auth, friends,
--      requests, guest response, lists, directory, admin, notifications)
--      before promoting. A counter-migration that DISABLEs RLS is the rollback.
--
-- Notes on design:
--  * DISABLE ROW LEVEL SECURITY (migration 20251126112541) did NOT drop the
--    historical policies — only stopped enforcing them. We DROP+CREATE each
--    policy explicitly so this migration is deterministic regardless of which
--    historical policies still exist.
--  * Edge functions use the service-role key and SECURITY DEFINER triggers run
--    as owner — both BYPASS RLS — so server-side writes (notification triggers,
--    directory sync, expertise upserts) keep working.
--  * has_role(uid, 'admin') is an existing SECURITY DEFINER helper (no recursive
--    RLS). get_extended_network(uid) is an existing SECURITY DEFINER helper.
--
-- Behavior changes to validate on staging (decisions D1–D4):
--  * profiles: readable by self, direct friends, admin. NON-friend profile
--    reads done directly by the client (search/suggestions) will now return
--    nothing — those call sites must move to get_safe_profile_view (follow-up).
--  * requests: readable by creator + audience (friends/extended/group). A
--    public "all open requests" feed, if any, is now audience-scoped.
--  * notifications: client INSERT is denied; cross-user notifications go through
--    create_notification() (added below; client rewired in the same PR).
--  * anonymous_handles: cross-user reads must use get_display_identity()
--    (existing). Requests.tsx still reads it directly — follow-up rewire.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles  (D1: own + friends + admin)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Friends can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Profiles are viewable by self, friends, admin"
ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE (f.user1_id = auth.uid() AND f.user2_id = profiles.id)
       OR (f.user2_id = auth.uid() AND f.user1_id = profiles.id)
  )
);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile or admin"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------------------
-- 2. friendships
-- ---------------------------------------------------------------------------
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own friendships" ON public.friendships;
DROP POLICY IF EXISTS "Users can create friendships" ON public.friendships;
DROP POLICY IF EXISTS "Users can delete their own friendships" ON public.friendships;

CREATE POLICY "Users can view their own friendships"
ON public.friendships FOR SELECT TO authenticated
USING (auth.uid() = user1_id OR auth.uid() = user2_id);
CREATE POLICY "Users can create friendships"
ON public.friendships FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);
CREATE POLICY "Users can delete their own friendships"
ON public.friendships FOR DELETE TO authenticated
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- ---------------------------------------------------------------------------
-- 3. friend_requests
-- ---------------------------------------------------------------------------
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own friend requests" ON public.friend_requests;
DROP POLICY IF EXISTS "Users can create friend requests" ON public.friend_requests;
DROP POLICY IF EXISTS "Users can update their received requests" ON public.friend_requests;
DROP POLICY IF EXISTS "Users can delete their friend requests" ON public.friend_requests;

CREATE POLICY "Users can view their own friend requests"
ON public.friend_requests FOR SELECT TO authenticated
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "Users can create friend requests"
ON public.friend_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Users can update their received requests"
ON public.friend_requests FOR UPDATE TO authenticated
USING (auth.uid() = addressee_id);
CREATE POLICY "Users can delete their friend requests"
ON public.friend_requests FOR DELETE TO authenticated
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- ---------------------------------------------------------------------------
-- 4. friend_suggestions  (INSERT is system-only via SECURITY DEFINER trigger)
-- ---------------------------------------------------------------------------
ALTER TABLE public.friend_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own suggestions" ON public.friend_suggestions;
DROP POLICY IF EXISTS "Users can update their own suggestions" ON public.friend_suggestions;
DROP POLICY IF EXISTS "Users can delete their own suggestions" ON public.friend_suggestions;
DROP POLICY IF EXISTS "System can create friend suggestions" ON public.friend_suggestions;

CREATE POLICY "Users can view their own suggestions"
ON public.friend_suggestions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own suggestions"
ON public.friend_suggestions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own suggestions"
ON public.friend_suggestions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. contact_imports  (own only — PII)
-- ---------------------------------------------------------------------------
ALTER TABLE public.contact_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own contacts" ON public.contact_imports;
DROP POLICY IF EXISTS "Users can create their own contacts" ON public.contact_imports;
DROP POLICY IF EXISTS "Users can update their own contacts" ON public.contact_imports;
DROP POLICY IF EXISTS "Users can delete their own contacts" ON public.contact_imports;

CREATE POLICY "Users can view their own contacts"
ON public.contact_imports FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own contacts"
ON public.contact_imports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own contacts"
ON public.contact_imports FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own contacts"
ON public.contact_imports FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. anonymous_handles  (own read only; writes via SECURITY DEFINER)
-- ---------------------------------------------------------------------------
ALTER TABLE public.anonymous_handles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own anonymous handle" ON public.anonymous_handles;
DROP POLICY IF EXISTS "System can manage anonymous handles" ON public.anonymous_handles;

CREATE POLICY "Users can view their own anonymous handle"
ON public.anonymous_handles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 7. requests  (creator + audience). Guests read via get_request_for_guest().
-- ---------------------------------------------------------------------------
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view requests sent to them or created by them" ON public.requests;
DROP POLICY IF EXISTS "Users can create their own requests" ON public.requests;
DROP POLICY IF EXISTS "Users can update their own requests" ON public.requests;
DROP POLICY IF EXISTS "Users can delete their own requests" ON public.requests;

CREATE POLICY "Users can view requests sent to them or created by them"
ON public.requests FOR SELECT TO authenticated
USING (
  creator_id = auth.uid()
  OR (audience_type = 'friends' AND EXISTS (
    SELECT 1 FROM public.friendships
    WHERE (user1_id = auth.uid() AND user2_id = creator_id)
       OR (user2_id = auth.uid() AND user1_id = creator_id)
  ))
  OR (audience_type = 'extended_network' AND EXISTS (
    SELECT 1 FROM public.get_extended_network(creator_id) en WHERE en.profile_id = auth.uid()
  ))
  OR (audience_type = 'specific_group' AND group_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.group_members WHERE group_id = requests.group_id AND user_id = auth.uid()
  ))
);
CREATE POLICY "Users can create their own requests"
ON public.requests FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
CREATE POLICY "Users can update their own requests"
ON public.requests FOR UPDATE TO authenticated USING (creator_id = auth.uid());
CREATE POLICY "Users can delete their own requests"
ON public.requests FOR DELETE TO authenticated USING (creator_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 8. request_responses  (visible if the parent request is visible; own writes)
-- ---------------------------------------------------------------------------
ALTER TABLE public.request_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view responses to requests they can see" ON public.request_responses;
DROP POLICY IF EXISTS "Users can create responses to requests they can see" ON public.request_responses;
DROP POLICY IF EXISTS "Users can update their own responses" ON public.request_responses;
DROP POLICY IF EXISTS "Users can delete their own responses" ON public.request_responses;

CREATE POLICY "Users can view responses to requests they can see"
ON public.request_responses FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.requests WHERE requests.id = request_responses.request_id));
CREATE POLICY "Users can create responses to requests they can see"
ON public.request_responses FOR INSERT TO authenticated
WITH CHECK (responder_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.requests WHERE requests.id = request_responses.request_id));
CREATE POLICY "Users can update their own responses"
ON public.request_responses FOR UPDATE TO authenticated USING (responder_id = auth.uid());
CREATE POLICY "Users can delete their own responses"
ON public.request_responses FOR DELETE TO authenticated USING (responder_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 9. request_forwards
-- ---------------------------------------------------------------------------
ALTER TABLE public.request_forwards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view relevant forwards" ON public.request_forwards;
DROP POLICY IF EXISTS "Users can create forwards" ON public.request_forwards;

CREATE POLICY "Users can view relevant forwards"
ON public.request_forwards FOR SELECT TO authenticated
USING (
  auth.uid() = forwarded_by_user_id
  OR EXISTS (
    SELECT 1 FROM public.requests r WHERE r.id = request_forwards.request_id AND (
      (forwarded_to_audience = 'friends' AND EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE (f.user1_id = auth.uid() AND f.user2_id = forwarded_by_user_id)
           OR (f.user2_id = auth.uid() AND f.user1_id = forwarded_by_user_id)))
      OR (forwarded_to_audience = 'extended_network' AND EXISTS (
        SELECT 1 FROM public.get_extended_network(forwarded_by_user_id) en WHERE en.profile_id = auth.uid()))
      OR (forwarded_to_audience = 'specific_group' AND forwarded_to_group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.group_members gm WHERE gm.group_id = forwarded_to_group_id AND gm.user_id = auth.uid()))
    )
  )
);
CREATE POLICY "Users can create forwards"
ON public.request_forwards FOR INSERT TO authenticated WITH CHECK (auth.uid() = forwarded_by_user_id);

-- ---------------------------------------------------------------------------
-- 10. request_votes
-- ---------------------------------------------------------------------------
ALTER TABLE public.request_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view votes on responses they can see" ON public.request_votes;
DROP POLICY IF EXISTS "Users can vote on responses" ON public.request_votes;
DROP POLICY IF EXISTS "Users can update their own votes" ON public.request_votes;
DROP POLICY IF EXISTS "Users can delete their own votes" ON public.request_votes;

CREATE POLICY "Users can view votes on responses they can see"
ON public.request_votes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.request_responses WHERE request_responses.id = request_votes.response_id));
CREATE POLICY "Users can vote on responses"
ON public.request_votes FOR INSERT TO authenticated WITH CHECK (voter_id = auth.uid());
CREATE POLICY "Users can update their own votes"
ON public.request_votes FOR UPDATE TO authenticated USING (voter_id = auth.uid());
CREATE POLICY "Users can delete their own votes"
ON public.request_votes FOR DELETE TO authenticated USING (voter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 11. notifications  (own read/update/delete; INSERT via create_notification)
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
-- No client INSERT policy: cross-user inserts go through create_notification().

-- ---------------------------------------------------------------------------
-- 12. lists
-- ---------------------------------------------------------------------------
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners can do everything with their lists" ON public.lists;
DROP POLICY IF EXISTS "Public lists are viewable by everyone" ON public.lists;

CREATE POLICY "Owners can do everything with their lists"
ON public.lists FOR ALL TO authenticated
USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Public lists are viewable by authenticated users"
ON public.lists FOR SELECT TO authenticated USING (visibility = 'public');

-- ---------------------------------------------------------------------------
-- 13. list_items  (ownership via parent list)
-- ---------------------------------------------------------------------------
ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners can manage items of their lists" ON public.list_items;
DROP POLICY IF EXISTS "Items of public lists are viewable by everyone" ON public.list_items;

CREATE POLICY "Owners can manage items of their lists"
ON public.list_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.lists l WHERE l.id = list_id AND l.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.lists l WHERE l.id = list_id AND l.owner_id = auth.uid()));
CREATE POLICY "Items of public lists are viewable by authenticated users"
ON public.list_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.lists l WHERE l.id = list_id AND l.visibility = 'public'));

-- ---------------------------------------------------------------------------
-- 14. groups
-- ---------------------------------------------------------------------------
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Group creators can manage their groups" ON public.groups;
DROP POLICY IF EXISTS "Group members can view groups they belong to" ON public.groups;

CREATE POLICY "Group creators can manage their groups"
ON public.groups FOR ALL TO authenticated
USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());
CREATE POLICY "Group members can view groups they belong to"
ON public.groups FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = id AND gm.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 15. group_members
-- ---------------------------------------------------------------------------
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Group creators can manage group members" ON public.group_members;
DROP POLICY IF EXISTS "Users can view group memberships they belong to" ON public.group_members;

CREATE POLICY "Group creators can manage group members"
ON public.group_members FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.creator_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.creator_id = auth.uid()));
CREATE POLICY "Users can view group memberships they belong to"
ON public.group_members FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 16. directory_entries  (public read; writes system-only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.directory_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Directory entries are viewable by everyone" ON public.directory_entries;
DROP POLICY IF EXISTS "System can manage directory entries" ON public.directory_entries;

CREATE POLICY "Directory entries are viewable by authenticated"
ON public.directory_entries FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 17. directory_votes
-- ---------------------------------------------------------------------------
ALTER TABLE public.directory_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view all directory votes" ON public.directory_votes;
DROP POLICY IF EXISTS "Authenticated users can vote" ON public.directory_votes;
DROP POLICY IF EXISTS "Users can update their own votes" ON public.directory_votes;
DROP POLICY IF EXISTS "Users can delete their own votes" ON public.directory_votes;

CREATE POLICY "Users can view directory votes"
ON public.directory_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can vote"
ON public.directory_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = voter_id);
CREATE POLICY "Users can update their own directory votes"
ON public.directory_votes FOR UPDATE TO authenticated USING (auth.uid() = voter_id);
CREATE POLICY "Users can delete their own directory votes"
ON public.directory_votes FOR DELETE TO authenticated USING (auth.uid() = voter_id);

-- ---------------------------------------------------------------------------
-- 18. master_directory_entries  (authenticated read; writes via service key)
-- ---------------------------------------------------------------------------
ALTER TABLE public.master_directory_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can search master directory" ON public.master_directory_entries;
DROP POLICY IF EXISTS "System can manage master directory entries" ON public.master_directory_entries;

CREATE POLICY "Authenticated users can search master directory"
ON public.master_directory_entries FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 19. search_analytics  (own/anon read; authenticated insert)
-- ---------------------------------------------------------------------------
ALTER TABLE public.search_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own search analytics" ON public.search_analytics;
DROP POLICY IF EXISTS "System can create search analytics" ON public.search_analytics;

CREATE POLICY "Users can view their own search analytics"
ON public.search_analytics FOR SELECT TO authenticated USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Authenticated can create search analytics"
ON public.search_analytics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ---------------------------------------------------------------------------
-- 20. user_expertise  (own read; writes via service key / SECURITY DEFINER)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_expertise ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own expertise" ON public.user_expertise;
DROP POLICY IF EXISTS "System can manage user expertise" ON public.user_expertise;

CREATE POLICY "Users can view their own expertise"
ON public.user_expertise FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 21. user_roles  (own read; only admin writes — prevents self-promotion)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all user roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all user roles"
ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------------------
-- 22. colleges  (public read)
-- ---------------------------------------------------------------------------
ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Colleges are readable by everyone" ON public.colleges;
CREATE POLICY "Colleges are readable by authenticated"
ON public.colleges FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 23. contact_access_logs  (admin read; writes via SECURITY DEFINER log fn)
-- ---------------------------------------------------------------------------
ALTER TABLE public.contact_access_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view contact access logs" ON public.contact_access_logs;
CREATE POLICY "Admins can view contact access logs"
ON public.contact_access_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================================
-- #7 recommendation_votes — was world-readable (SELECT USING true). Restrict.
-- ============================================================================
ALTER TABLE public.recommendation_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view recommendation votes" ON public.recommendation_votes;
DROP POLICY IF EXISTS "Recommendation votes are viewable by everyone" ON public.recommendation_votes;
DROP POLICY IF EXISTS "Authenticated can view recommendation votes" ON public.recommendation_votes;
DROP POLICY IF EXISTS "Users can cast recommendation votes" ON public.recommendation_votes;
DROP POLICY IF EXISTS "Users can change their recommendation votes" ON public.recommendation_votes;
DROP POLICY IF EXISTS "Users can remove their recommendation votes" ON public.recommendation_votes;

CREATE POLICY "Authenticated can view recommendation votes"
ON public.recommendation_votes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can cast recommendation votes"
ON public.recommendation_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove their recommendation votes"
ON public.recommendation_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- #6 guest_contributions — explicit policies (anon insert gated by share link).
-- ============================================================================
-- SECURITY DEFINER check so the anon INSERT policy can verify the share link
-- without anon needing direct SELECT on share_links.
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
-- Lets the unauthenticated /r/:id/:token page load the request + creator name
-- without granting anon any direct table access.
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

-- ============================================================================
-- D4 — controlled notification creation (SECURITY DEFINER).
-- Replaces direct client INSERTs into notifications. The actor is recorded as
-- related_user_id = auth.uid(); finer relationship validation is a follow-up.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  INSERT INTO public.notifications (user_id, type, title, message, related_user_id, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, auth.uid(), p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, jsonb) TO authenticated;
