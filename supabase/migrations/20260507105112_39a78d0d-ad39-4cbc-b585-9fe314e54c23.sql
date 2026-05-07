CREATE OR REPLACE FUNCTION public.get_for_you_requests(p_limit integer DEFAULT 20)
 RETURNS TABLE(request_id uuid, title text, category text, location text, created_at timestamp with time zone, expires_at timestamp with time zone, creator_label text, contributor_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
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
    SELECT e.*, ROW_NUMBER() OVER (PARTITION BY e.creator_id ORDER BY e.combined_score DESC, e.created_at DESC) AS rn
    FROM eligible e
  ),
  picked AS (
    SELECT * FROM diversified WHERE rn <= 2
    ORDER BY combined_score DESC, diversified.created_at DESC
    LIMIT cap
  ),
  ins AS (
    INSERT INTO public.request_anonymous_impressions (request_id, recipient_id, surfaced_at)
    SELECT p.id, caller, now() FROM picked p
    ON CONFLICT (request_id, recipient_id) DO NOTHING
    RETURNING 1
  )
  SELECT
    p.id, p.title, p.category::text, p.location, p.created_at, p.expires_at,
    (SELECT name FROM public.get_display_identity(caller, p.creator_id) LIMIT 1),
    public.anonymous_thread_label(caller, p.id)
  FROM picked p, (SELECT count(*) FROM ins) _;
END;
$function$;