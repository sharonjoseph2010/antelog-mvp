
ALTER TYPE public.request_audience_type ADD VALUE IF NOT EXISTS 'anonymous_expertise';
COMMIT;

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS routing_signal numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.compute_request_routing_signal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s numeric := 0; title_len int := coalesce(char_length(NEW.title), 0);
BEGIN
  IF title_len BETWEEN 25 AND 160 THEN s := s + 1.0;
  ELSIF title_len BETWEEN 12 AND 24 THEN s := s + 0.4;
  ELSIF title_len < 12 THEN s := s - 0.5;
  END IF;
  IF NEW.location IS NOT NULL AND char_length(trim(NEW.location)) > 1 THEN s := s + 1.0; END IF;
  IF NEW.category IS NOT NULL AND NEW.category::text <> 'other' THEN s := s + 1.0; END IF;
  IF NEW.audience_types IS NOT NULL AND array_length(NEW.audience_types, 1) > 0
     AND NOT (NEW.audience_types = ARRAY['public']) THEN s := s + 0.5; END IF;
  IF NEW.selected_users IS NOT NULL AND array_length(NEW.selected_users, 1) > 0 THEN s := s + 0.5; END IF;
  IF NEW.group_id IS NOT NULL THEN s := s + 0.5; END IF;
  IF s < 0 THEN s := 0; END IF;
  IF s > 5 THEN s := 5; END IF;
  NEW.routing_signal := s;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_requests_routing_signal ON public.requests;
CREATE TRIGGER trg_requests_routing_signal
BEFORE INSERT OR UPDATE OF title, location, category, audience_types, selected_users, group_id
ON public.requests FOR EACH ROW EXECUTE FUNCTION public.compute_request_routing_signal();

UPDATE public.requests SET title = title;

CREATE TABLE IF NOT EXISTS public.request_anonymous_impressions (
  request_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  surfaced_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  responded boolean NOT NULL DEFAULT false,
  PRIMARY KEY (request_id, recipient_id)
);
ALTER TABLE public.request_anonymous_impressions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny all on impressions" ON public.request_anonymous_impressions;
CREATE POLICY "deny all on impressions" ON public.request_anonymous_impressions
FOR ALL TO public USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_rai_recipient ON public.request_anonymous_impressions (recipient_id, surfaced_at DESC);
CREATE INDEX IF NOT EXISTS idx_rai_request ON public.request_anonymous_impressions (request_id);
CREATE INDEX IF NOT EXISTS idx_requests_audience_types_gin ON public.requests USING gin (audience_types);
CREATE INDEX IF NOT EXISTS idx_requests_open_anon ON public.requests (status, expires_at) WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.user_in_direct_audience(p_uid uuid, p_request_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.requests%ROWTYPE;
BEGIN
  IF p_uid IS NULL THEN RETURN false; END IF;
  SELECT * INTO r FROM public.requests WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF r.creator_id = p_uid THEN RETURN true; END IF;
  IF 'first_network' = ANY(r.audience_types) AND EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE (f.user1_id = p_uid AND f.user2_id = r.creator_id)
       OR (f.user2_id = p_uid AND f.user1_id = r.creator_id)
  ) THEN RETURN true; END IF;
  IF 'group' = ANY(r.audience_types) AND r.group_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.group_members gm WHERE gm.group_id = r.group_id AND gm.user_id = p_uid
  ) THEN RETURN true; END IF;
  IF 'specific_people' = ANY(r.audience_types) AND r.selected_users IS NOT NULL
     AND p_uid = ANY(r.selected_users) THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM public.request_forwards rf
    WHERE rf.request_id = p_request_id AND p_uid = ANY(rf.forwarded_to)
  ) THEN RETURN true; END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_is_exhausted(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN r.status <> 'open' THEN true
    WHEN r.expires_at IS NOT NULL AND r.expires_at < now() THEN true
    WHEN (SELECT count(*) FROM public.request_responses rr WHERE rr.request_id = r.id) >= 12 THEN true
    ELSE false
  END FROM public.requests r WHERE r.id = p_request_id;
$$;

CREATE OR REPLACE FUNCTION public.matches_anonymous_expertise(p_uid uuid, p_request_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.requests%ROWTYPE; score numeric := 0;
  user_tags text[]; user_interests text[]; user_cities text[]; user_loc text; tag text;
BEGIN
  IF p_uid IS NULL THEN RETURN false; END IF;
  SELECT * INTO r FROM public.requests WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF r.creator_id = p_uid THEN RETURN false; END IF;
  IF NOT ('anonymous_expertise' = ANY(r.audience_types)) THEN RETURN false; END IF;
  IF public.request_is_exhausted(p_request_id) THEN RETURN false; END IF;
  IF public.user_in_direct_audience(p_uid, p_request_id) THEN RETURN false; END IF;

  SELECT expertise_tags INTO user_tags FROM public.user_expertise WHERE user_id = p_uid;
  SELECT
    COALESCE(array(SELECT jsonb_array_elements_text(p.interests)), ARRAY[]::text[]),
    COALESCE(array(SELECT jsonb_array_elements_text(p.expertise_cities)), ARRAY[]::text[]),
    p.location
  INTO user_interests, user_cities, user_loc
  FROM public.profiles p WHERE p.id = p_uid;

  IF user_tags IS NOT NULL THEN
    FOREACH tag IN ARRAY user_tags LOOP
      IF length(tag) >= 3 THEN
        IF r.title ILIKE '%'||tag||'%' THEN score := score + 2; END IF;
        IF r.category::text ILIKE '%'||tag||'%' THEN score := score + 3; END IF;
      END IF;
    END LOOP;
  END IF;
  IF user_interests IS NOT NULL THEN
    FOREACH tag IN ARRAY user_interests LOOP
      IF length(tag) >= 3 AND (r.title ILIKE '%'||tag||'%' OR r.category::text ILIKE '%'||tag||'%') THEN
        score := score + 1.5;
      END IF;
    END LOOP;
  END IF;
  IF r.location IS NOT NULL THEN
    IF user_loc IS NOT NULL AND r.location ILIKE '%'||user_loc||'%' THEN score := score + 1.5; END IF;
    IF user_cities IS NOT NULL THEN
      FOREACH tag IN ARRAY user_cities LOOP
        IF length(tag) >= 2 AND r.location ILIKE '%'||tag||'%' THEN score := score + 2; END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN score >= 2.0;
END;
$$;

CREATE OR REPLACE FUNCTION public.anonymous_creator_cooldown_ok(p_creator_id uuid, p_recipient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.request_anonymous_impressions rai
    JOIN public.requests r ON r.id = rai.request_id
    WHERE rai.recipient_id = p_recipient_id
      AND r.creator_id = p_creator_id
      AND rai.surfaced_at > now() - interval '48 hours'
  );
$$;

CREATE OR REPLACE FUNCTION public.anonymous_active_cap_ok(p_recipient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (
    SELECT count(*) FROM public.request_anonymous_impressions rai
    WHERE rai.recipient_id = p_recipient_id
      AND rai.dismissed_at IS NULL AND rai.responded = false
      AND rai.surfaced_at > now() - interval '14 days'
  ) < 12;
$$;

CREATE OR REPLACE FUNCTION public.anonymous_thread_label(p_uid uuid, p_request_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'Contributor ' || upper(substr(md5(p_uid::text || ':' || p_request_id::text), 1, 4));
$$;

CREATE OR REPLACE FUNCTION public.estimate_anonymous_expertise_reach(
  p_category text, p_location text, p_keywords text[] DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE caller uuid := auth.uid(); cnt int;
BEGIN
  IF caller IS NULL THEN RETURN 0; END IF;
  SELECT count(DISTINCT p.id) INTO cnt
  FROM public.profiles p
  LEFT JOIN public.user_expertise ue ON ue.user_id = p.id
  WHERE p.is_verified = true AND p.id <> caller
    AND NOT EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user1_id = caller AND f.user2_id = p.id)
         OR (f.user2_id = caller AND f.user1_id = p.id)
    )
    AND (
      (p_category IS NOT NULL AND p_category <> 'other' AND (
        EXISTS (SELECT 1 FROM unnest(coalesce(ue.expertise_tags, ARRAY[]::text[])) t
                WHERE p_category ILIKE '%'||t||'%' OR t ILIKE '%'||p_category||'%')
        OR p.interests::text ILIKE '%'||p_category||'%'
      ))
      OR (p_location IS NOT NULL AND length(p_location) > 1 AND (
        p.location ILIKE '%'||p_location||'%'
        OR p.expertise_cities::text ILIKE '%'||p_location||'%'
      ))
    );
  RETURN COALESCE(cnt, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_for_you_requests(p_limit int DEFAULT 20)
RETURNS TABLE(
  request_id uuid, title text, category text, location text,
  created_at timestamptz, expires_at timestamptz,
  creator_label text, contributor_label text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller uuid := auth.uid();
  cap int := LEAST(GREATEST(coalesce(p_limit, 20), 1), 20);
BEGIN
  IF caller IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH eligible AS (
    SELECT r.*, (
      public.calculate_request_relevance(caller, r.id) * 0.6
      + r.routing_signal * 0.3
      + GREATEST(0, 1.0 - EXTRACT(epoch FROM (now() - r.created_at)) / (96.0 * 3600.0)) * 0.1
    ) AS combined_score
    FROM public.requests r
    WHERE r.status = 'open' AND r.expires_at > now()
      AND 'anonymous_expertise' = ANY(r.audience_types)
      AND r.creator_id <> caller
      AND public.matches_anonymous_expertise(caller, r.id)
      AND NOT public.user_in_direct_audience(caller, r.id)
      AND NOT EXISTS (SELECT 1 FROM public.request_responses rr WHERE rr.request_id = r.id AND rr.responder_id = caller)
      AND public.anonymous_creator_cooldown_ok(r.creator_id, caller)
      AND public.anonymous_active_cap_ok(caller)
  ),
  diversified AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY creator_id ORDER BY combined_score DESC, created_at DESC) AS rn
    FROM eligible
  ),
  picked AS (
    SELECT * FROM diversified WHERE rn <= 2
    ORDER BY combined_score DESC, created_at DESC
    LIMIT cap
  ),
  ins AS (
    INSERT INTO public.request_anonymous_impressions (request_id, recipient_id, surfaced_at)
    SELECT id, caller, now() FROM picked
    ON CONFLICT (request_id, recipient_id) DO NOTHING
    RETURNING 1
  )
  SELECT
    p.id, p.title, p.category::text, p.location, p.created_at, p.expires_at,
    (SELECT name FROM public.get_display_identity(caller, p.creator_id) LIMIT 1),
    public.anonymous_thread_label(caller, p.id)
  FROM picked p, (SELECT count(*) FROM ins) _;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_response_origin(p_response_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_request uuid; v_responder uuid;
BEGIN
  SELECT request_id, responder_id INTO v_request, v_responder
  FROM public.request_responses WHERE id = p_response_id;
  IF NOT FOUND THEN RETURN 'direct'; END IF;
  IF public.user_in_direct_audience(v_responder, v_request) THEN RETURN 'direct'; END IF;
  RETURN 'anonymous';
END;
$$;

DROP POLICY IF EXISTS "Users can view requests sent to them or created by them" ON public.requests;
CREATE POLICY "Users can view requests sent to them or created by them"
ON public.requests FOR SELECT TO public
USING (
  creator_id = auth.uid()
  OR ('first_network' = ANY(audience_types) AND EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE (f.user1_id = auth.uid() AND f.user2_id = requests.creator_id)
       OR (f.user2_id = auth.uid() AND f.user1_id = requests.creator_id)
  ))
  OR ('group' = ANY(audience_types) AND group_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.group_members gm WHERE gm.group_id = requests.group_id AND gm.user_id = auth.uid()
  ))
  OR ('specific_people' = ANY(audience_types) AND selected_users IS NOT NULL AND auth.uid() = ANY(selected_users))
  OR ('public' = ANY(audience_types) AND auth.uid() IS NOT NULL)
  OR ('anonymous_expertise' = ANY(audience_types) AND public.matches_anonymous_expertise(auth.uid(), id))
  OR EXISTS (
    SELECT 1 FROM public.request_forwards rf
    WHERE rf.request_id = requests.id AND auth.uid() = ANY(rf.forwarded_to)
  )
);

DROP POLICY IF EXISTS "Users can create forwards" ON public.request_forwards;
CREATE POLICY "Users can create forwards"
ON public.request_forwards FOR INSERT TO public
WITH CHECK (
  forwarded_by_user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.requests r WHERE r.id = request_forwards.request_id AND r.allow_forwarding = true)
  AND public.user_in_direct_audience(auth.uid(), request_forwards.request_id)
);
