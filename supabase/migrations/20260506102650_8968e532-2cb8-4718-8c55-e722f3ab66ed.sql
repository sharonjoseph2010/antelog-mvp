
-- 1. Title-aware reach estimator (adds p_title, weakens category, allows title-derived location)
CREATE OR REPLACE FUNCTION public.estimate_anonymous_expertise_reach(
  p_category text,
  p_location text,
  p_keywords text[] DEFAULT NULL::text[],
  p_title text DEFAULT NULL::text
)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  cnt int := 0;
  cat_token text := public.normalize_token(p_category);
  loc_tokens text[] := public.tokenize_text(p_location);
  title_tokens text[] := public.tokenize_text(p_title);
  kw_tokens text[];
  combined_expertise_tokens text[];
  combined_location_tokens text[];
BEGIN
  IF caller IS NULL THEN RETURN 0; END IF;

  kw_tokens := COALESCE(
    (SELECT array_agg(DISTINCT public.normalize_token(k))
       FROM unnest(coalesce(p_keywords, ARRAY[]::text[])) k
       WHERE length(coalesce(k,'')) >= 3),
    ARRAY[]::text[]
  );

  -- Expertise candidates: title tokens + keywords (+ category as weak signal)
  combined_expertise_tokens := ARRAY(
    SELECT DISTINCT t FROM unnest(
      coalesce(title_tokens, ARRAY[]::text[])
      || coalesce(kw_tokens, ARRAY[]::text[])
      || CASE WHEN cat_token IS NOT NULL AND cat_token <> 'other' THEN ARRAY[cat_token] ELSE ARRAY[]::text[] END
    ) t WHERE length(coalesce(t,'')) >= 3
  );

  -- Location candidates: structured location + title tokens (title may carry the locality)
  combined_location_tokens := ARRAY(
    SELECT DISTINCT t FROM unnest(
      coalesce(loc_tokens, ARRAY[]::text[]) || coalesce(title_tokens, ARRAY[]::text[])
    ) t WHERE length(coalesce(t,'')) >= 2
  );

  SELECT count(*) INTO cnt FROM (
    SELECT p.id
    FROM public.profiles p
    WHERE p.is_verified = true AND p.id <> caller
      AND NOT EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE (f.user1_id = caller AND f.user2_id = p.id)
           OR (f.user2_id = caller AND f.user1_id = p.id)
      )
      AND (
        EXISTS (
          SELECT 1 FROM unnest(public.user_expertise_tokens(p.id)) t,
                       unnest(combined_expertise_tokens) k
          WHERE t = k
             OR (length(t) >= 4 AND length(k) >= 4
                 AND (t LIKE k||'%' OR k LIKE t||'%' OR left(t,4) = left(k,4)))
        )
        OR EXISTS (
          SELECT 1 FROM unnest(public.user_location_tokens(p.id)) lt,
                       unnest(combined_location_tokens) rt
          WHERE lt = rt OR lt LIKE rt||'%' OR rt LIKE lt||'%'
        )
      )
  ) sub;
  RETURN COALESCE(cnt, 0);
END;
$function$;

-- 2. Title-first routing matcher with rebalanced weights and lower threshold
CREATE OR REPLACE FUNCTION public.matches_anonymous_expertise(p_uid uuid, p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.requests%ROWTYPE;
  score numeric := 0;
  user_tags text[]; user_locs text[];
  req_title_tokens text[]; req_loc_tokens text[];
  req_cat_token text;
  ut text; rt text; lt text;
  has_expertise_hit boolean := false;
  has_location_hit boolean := false;
BEGIN
  IF p_uid IS NULL THEN RETURN false; END IF;
  SELECT * INTO r FROM public.requests WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF r.creator_id = p_uid THEN RETURN false; END IF;
  IF NOT ('anonymous_expertise' = ANY(r.audience_types)) THEN RETURN false; END IF;
  IF public.request_is_exhausted(p_request_id) THEN RETURN false; END IF;
  IF public.user_in_direct_audience(p_uid, p_request_id) THEN RETURN false; END IF;

  user_tags := public.user_expertise_tokens(p_uid);
  user_locs := public.user_location_tokens(p_uid);
  req_title_tokens := public.tokenize_text(r.title);
  req_loc_tokens := public.tokenize_text(r.location);
  req_cat_token := public.normalize_token(r.category::text);

  -- Expertise: title is primary, category is a weak supporting signal
  IF user_tags IS NOT NULL THEN
    FOREACH ut IN ARRAY user_tags LOOP
      IF ut IS NULL OR length(ut) < 3 THEN CONTINUE; END IF;
      -- Category: weak signal only
      IF req_cat_token IS NOT NULL AND req_cat_token <> 'other'
         AND (req_cat_token = ut OR req_cat_token LIKE ut||'%' OR ut LIKE req_cat_token||'%') THEN
        score := score + 0.5;
        has_expertise_hit := true;
      END IF;
      -- Title token overlap (primary)
      IF req_title_tokens IS NOT NULL THEN
        FOREACH rt IN ARRAY req_title_tokens LOOP
          IF rt = ut THEN
            score := score + 3; has_expertise_hit := true;
          ELSIF length(ut) >= 4 AND length(rt) >= 4
                AND (rt LIKE ut||'%' OR ut LIKE rt||'%' OR left(rt,4) = left(ut,4)) THEN
            score := score + 1.5; has_expertise_hit := true;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- Location: structured field OR title (title carries locality in real usage)
  IF user_locs IS NOT NULL AND array_length(user_locs,1) IS NOT NULL THEN
    FOREACH lt IN ARRAY user_locs LOOP
      IF lt IS NULL OR length(lt) < 2 THEN CONTINUE; END IF;
      IF req_loc_tokens IS NOT NULL THEN
        FOREACH rt IN ARRAY req_loc_tokens LOOP
          IF rt = lt OR (length(lt) >= 4 AND length(rt) >= 4 AND (rt LIKE lt||'%' OR lt LIKE rt||'%')) THEN
            score := score + 2.5; has_location_hit := true;
          END IF;
        END LOOP;
      END IF;
      IF req_title_tokens IS NOT NULL THEN
        FOREACH rt IN ARRAY req_title_tokens LOOP
          IF rt = lt OR (length(lt) >= 4 AND length(rt) >= 4 AND (rt LIKE lt||'%' OR lt LIKE rt||'%')) THEN
            score := score + 2.5; has_location_hit := true;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- Fallback: one strong expertise + one location signal is enough, even if score is low
  IF has_expertise_hit AND has_location_hit THEN
    RETURN true;
  END IF;

  RETURN score >= 1.5;
END;
$function$;

-- 3. Extend debug helper to surface the new signals (internal only, not exposed in UI)
CREATE OR REPLACE FUNCTION public.debug_anonymous_match(p_request_id uuid, p_uid uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := COALESCE(p_uid, auth.uid());
  r public.requests%ROWTYPE;
  user_tags text[]; user_locs text[];
  req_title_tokens text[]; req_loc_tokens text[]; req_cat_token text;
  cat_overlap text[]; title_expertise_overlap text[];
  loc_struct_overlap text[]; loc_title_overlap text[];
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('error','no caller'); END IF;
  SELECT * INTO r FROM public.requests WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','request not found'); END IF;

  user_tags := public.user_expertise_tokens(uid);
  user_locs := public.user_location_tokens(uid);
  req_title_tokens := public.tokenize_text(r.title);
  req_loc_tokens := public.tokenize_text(r.location);
  req_cat_token := public.normalize_token(r.category::text);

  cat_overlap := ARRAY(
    SELECT t FROM unnest(user_tags) t
    WHERE req_cat_token IS NOT NULL AND req_cat_token <> 'other'
      AND (t = req_cat_token OR t LIKE req_cat_token||'%' OR req_cat_token LIKE t||'%')
  );
  title_expertise_overlap := ARRAY(
    SELECT DISTINCT t FROM unnest(user_tags) t, unnest(req_title_tokens) rt
    WHERE t = rt OR (length(t) >= 4 AND length(rt) >= 4
                     AND (rt LIKE t||'%' OR t LIKE rt||'%' OR left(rt,4) = left(t,4)))
  );
  loc_struct_overlap := ARRAY(
    SELECT DISTINCT lt FROM unnest(user_locs) lt, unnest(req_loc_tokens) rt
    WHERE lt = rt OR lt LIKE rt||'%' OR rt LIKE lt||'%'
  );
  loc_title_overlap := ARRAY(
    SELECT DISTINCT lt FROM unnest(user_locs) lt, unnest(req_title_tokens) rt
    WHERE lt = rt OR (length(lt) >= 4 AND length(rt) >= 4
                      AND (rt LIKE lt||'%' OR lt LIKE rt||'%'))
  );

  RETURN jsonb_build_object(
    'matched', public.matches_anonymous_expertise(uid, p_request_id),
    'request', jsonb_build_object('title', r.title, 'category', r.category,
                                  'location', r.location, 'audience_types', r.audience_types),
    'user_expertise_tokens', to_jsonb(user_tags),
    'user_location_tokens', to_jsonb(user_locs),
    'request_title_tokens', to_jsonb(req_title_tokens),
    'request_location_tokens', to_jsonb(req_loc_tokens),
    'request_category_token', req_cat_token,
    'category_overlap', to_jsonb(cat_overlap),
    'title_expertise_overlap', to_jsonb(title_expertise_overlap),
    'location_overlap_from_structured', to_jsonb(loc_struct_overlap),
    'location_overlap_from_title', to_jsonb(loc_title_overlap)
  );
END;
$function$;
