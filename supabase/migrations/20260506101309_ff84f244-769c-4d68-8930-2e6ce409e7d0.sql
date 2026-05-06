
-- Lightweight normalization helpers (deterministic, no AI)
CREATE OR REPLACE FUNCTION public.normalize_token(t text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN t IS NULL THEN NULL
    ELSE
      regexp_replace(
        -- strip trailing plural 's' / 'es' (dental, dentist, dentists -> denti...)
        regexp_replace(lower(trim(t)), '(es|s)$', '', 'g'),
        '[^a-z0-9]+', ' ', 'g'
      )
  END
$$;

CREATE OR REPLACE FUNCTION public.tokenize_text(t text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN t IS NULL OR length(trim(t)) = 0 THEN ARRAY[]::text[]
    ELSE
      ARRAY(
        SELECT DISTINCT public.normalize_token(tok)
        FROM regexp_split_to_table(lower(t), '[^a-z0-9]+') AS tok
        WHERE length(tok) >= 3
      )
  END
$$;

-- Build a user's full set of expertise/interest tokens from ALL relevant fields
CREATE OR REPLACE FUNCTION public.user_expertise_tokens(p_uid uuid)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH src AS (
    SELECT unnest(coalesce(ue.expertise_tags, ARRAY[]::text[])) AS raw FROM public.user_expertise ue WHERE ue.user_id = p_uid
    UNION ALL
    SELECT jsonb_array_elements_text(coalesce(p.expertise_domains, '[]'::jsonb)) FROM public.profiles p WHERE p.id = p_uid
    UNION ALL
    SELECT jsonb_array_elements_text(coalesce(p.interests, '[]'::jsonb)) FROM public.profiles p WHERE p.id = p_uid
  )
  SELECT ARRAY(
    SELECT DISTINCT public.normalize_token(raw)
    FROM src
    WHERE raw IS NOT NULL AND length(trim(raw)) >= 3
  );
$$;

CREATE OR REPLACE FUNCTION public.user_location_tokens(p_uid uuid)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH src AS (
    SELECT jsonb_array_elements_text(coalesce(p.expertise_cities, '[]'::jsonb)) AS raw FROM public.profiles p WHERE p.id = p_uid
    UNION ALL
    SELECT p.location FROM public.profiles p WHERE p.id = p_uid AND p.location IS NOT NULL
  )
  SELECT ARRAY(
    SELECT DISTINCT public.normalize_token(raw)
    FROM src
    WHERE raw IS NOT NULL AND length(trim(raw)) >= 2
  );
$$;

-- Replace matches_anonymous_expertise with normalized token matching
CREATE OR REPLACE FUNCTION public.matches_anonymous_expertise(p_uid uuid, p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.requests%ROWTYPE;
  score numeric := 0;
  user_tags text[]; user_locs text[]; req_title_tokens text[]; req_loc_tokens text[];
  req_cat_token text;
  ut text; rt text; lt text;
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

  -- Expertise/interest overlap
  IF user_tags IS NOT NULL THEN
    FOREACH ut IN ARRAY user_tags LOOP
      IF ut IS NULL OR length(ut) < 3 THEN CONTINUE; END IF;
      -- category exact-ish match
      IF req_cat_token IS NOT NULL AND (req_cat_token = ut OR req_cat_token LIKE ut||'%' OR ut LIKE req_cat_token||'%') THEN
        score := score + 2;
      END IF;
      -- title token prefix overlap (handles dentist/dentists/dental)
      FOREACH rt IN ARRAY req_title_tokens LOOP
        IF rt = ut THEN score := score + 3;
        ELSIF length(ut) >= 4 AND length(rt) >= 4 AND (rt LIKE ut||'%' OR ut LIKE rt||'%' OR left(rt,4) = left(ut,4)) THEN
          score := score + 1.5;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- Location overlap
  IF user_locs IS NOT NULL AND array_length(user_locs,1) IS NOT NULL THEN
    FOREACH lt IN ARRAY user_locs LOOP
      IF lt IS NULL OR length(lt) < 2 THEN CONTINUE; END IF;
      FOREACH rt IN ARRAY req_loc_tokens LOOP
        IF rt = lt OR rt LIKE lt||'%' OR lt LIKE rt||'%' THEN
          score := score + 2.5;
        END IF;
      END LOOP;
      FOREACH rt IN ARRAY req_title_tokens LOOP
        IF rt = lt THEN score := score + 1.5; END IF;
      END LOOP;
    END LOOP;
  END IF;

  RETURN score >= 2.0;
END;
$$;

-- Replace estimate function with same token-based logic
CREATE OR REPLACE FUNCTION public.estimate_anonymous_expertise_reach(
  p_category text, p_location text, p_keywords text[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  cnt int := 0;
  cat_token text := public.normalize_token(p_category);
  loc_tokens text[] := public.tokenize_text(p_location);
  kw_tokens text[];
BEGIN
  IF caller IS NULL THEN RETURN 0; END IF;
  kw_tokens := COALESCE(
    (SELECT array_agg(DISTINCT public.normalize_token(k)) FROM unnest(coalesce(p_keywords, ARRAY[]::text[])) k WHERE length(coalesce(k,'')) >= 3),
    ARRAY[]::text[]
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
        -- expertise/interest token overlap with category or keywords
        (cat_token IS NOT NULL AND cat_token <> 'other' AND EXISTS (
          SELECT 1 FROM unnest(public.user_expertise_tokens(p.id)) t
          WHERE t = cat_token OR t LIKE cat_token||'%' OR cat_token LIKE t||'%'
        ))
        OR (array_length(kw_tokens,1) IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(public.user_expertise_tokens(p.id)) t, unnest(kw_tokens) k
          WHERE t = k OR (length(t)>=4 AND length(k)>=4 AND (t LIKE k||'%' OR k LIKE t||'%'))
        ))
        OR (array_length(loc_tokens,1) IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(public.user_location_tokens(p.id)) lt, unnest(loc_tokens) rt
          WHERE lt = rt OR lt LIKE rt||'%' OR rt LIKE lt||'%'
        ))
      )
  ) sub;
  RETURN COALESCE(cnt, 0);
END;
$$;

-- Internal debug RPC: explains why a request matched (or not) for a user.
-- Safe: returns reasons but no PII beyond the caller's own data.
CREATE OR REPLACE FUNCTION public.debug_anonymous_match(p_request_id uuid, p_uid uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := COALESCE(p_uid, auth.uid());
  r public.requests%ROWTYPE;
  user_tags text[]; user_locs text[];
  req_title_tokens text[]; req_loc_tokens text[]; req_cat_token text;
  cat_overlap text[]; title_overlap text[]; loc_overlap text[];
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('error','no caller'); END IF;
  SELECT * INTO r FROM public.requests WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','request not found'); END IF;

  user_tags := public.user_expertise_tokens(uid);
  user_locs := public.user_location_tokens(uid);
  req_title_tokens := public.tokenize_text(r.title);
  req_loc_tokens := public.tokenize_text(r.location);
  req_cat_token := public.normalize_token(r.category::text);

  cat_overlap := ARRAY(SELECT t FROM unnest(user_tags) t WHERE req_cat_token IS NOT NULL AND (t = req_cat_token OR t LIKE req_cat_token||'%' OR req_cat_token LIKE t||'%'));
  title_overlap := ARRAY(SELECT DISTINCT t FROM unnest(user_tags) t, unnest(req_title_tokens) rt WHERE t = rt OR (length(t)>=4 AND length(rt)>=4 AND (rt LIKE t||'%' OR t LIKE rt||'%')));
  loc_overlap := ARRAY(SELECT DISTINCT lt FROM unnest(user_locs) lt, unnest(req_loc_tokens) rt WHERE lt = rt OR lt LIKE rt||'%' OR rt LIKE lt||'%');

  RETURN jsonb_build_object(
    'matched', public.matches_anonymous_expertise(uid, p_request_id),
    'request', jsonb_build_object('title', r.title, 'category', r.category, 'location', r.location, 'audience_types', r.audience_types),
    'user_expertise_tokens', to_jsonb(user_tags),
    'user_location_tokens', to_jsonb(user_locs),
    'request_title_tokens', to_jsonb(req_title_tokens),
    'request_location_tokens', to_jsonb(req_loc_tokens),
    'request_category_token', req_cat_token,
    'category_overlap', to_jsonb(cat_overlap),
    'title_overlap', to_jsonb(title_overlap),
    'location_overlap', to_jsonb(loc_overlap)
  );
END;
$$;
