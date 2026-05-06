
-- v1 exhaustion threshold: category-aware-ready, manually closable, adaptive later
CREATE OR REPLACE FUNCTION public.request_response_threshold(p_category text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  -- v1 heuristic: single threshold; future: per-category, overlap-aware, usefulness-aware
  SELECT 12;
$$;

CREATE OR REPLACE FUNCTION public.request_is_exhausted(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    -- manual close / non-open status
    WHEN r.status <> 'open' THEN true
    -- expiry
    WHEN r.expires_at IS NOT NULL AND r.expires_at < now() THEN true
    -- v1 response-count heuristic (replaceable; see request_response_threshold)
    WHEN (SELECT count(*) FROM public.request_responses rr WHERE rr.request_id = r.id)
         >= public.request_response_threshold(r.category::text) THEN true
    ELSE false
  END
  FROM public.requests r WHERE r.id = p_request_id;
$$;

-- Dismissal lifecycle: dismiss (forever), snooze (timed), not_relevant (forever + signal)
CREATE OR REPLACE FUNCTION public.dismiss_anonymous_impression(
  p_request_id uuid,
  p_action text DEFAULT 'dismiss',
  p_snooze_days int DEFAULT 7
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller uuid := auth.uid();
  hide_until timestamptz;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_action NOT IN ('dismiss','snooze','not_relevant') THEN
    RAISE EXCEPTION 'invalid action';
  END IF;

  hide_until := CASE
    WHEN p_action = 'snooze' THEN now() + make_interval(days => GREATEST(1, LEAST(p_snooze_days, 30)))
    ELSE 'infinity'::timestamptz
  END;

  INSERT INTO public.request_anonymous_impressions (request_id, recipient_id, surfaced_at, dismissed_at)
  VALUES (p_request_id, caller, now(), hide_until)
  ON CONFLICT (request_id, recipient_id)
  DO UPDATE SET dismissed_at = EXCLUDED.dismissed_at;
END;
$$;

-- Update For You to honor dismissal lifecycle (active dismissal/snooze hides the request)
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
      AND NOT EXISTS (
        SELECT 1 FROM public.request_anonymous_impressions rai
        WHERE rai.request_id = r.id AND rai.recipient_id = caller
          AND (rai.responded = true OR (rai.dismissed_at IS NOT NULL AND rai.dismissed_at > now()))
      )
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

-- Mark impression as responded when an anonymous responder submits a response
CREATE OR REPLACE FUNCTION public.mark_anonymous_impression_responded()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.request_anonymous_impressions
  SET responded = true
  WHERE request_id = NEW.request_id AND recipient_id = NEW.responder_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_anon_impression_responded ON public.request_responses;
CREATE TRIGGER trg_mark_anon_impression_responded
AFTER INSERT ON public.request_responses
FOR EACH ROW EXECUTE FUNCTION public.mark_anonymous_impression_responded();
