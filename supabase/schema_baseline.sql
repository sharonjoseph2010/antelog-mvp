-- ============================================================================
-- PROD SCHEMA BASELINE — authoritative snapshot of the live production schema
-- Generated 2026-06-06 via: pg_dump --schema-only --schema=public --no-owner
-- (project bzeomaxcafiqwxlskwvz). Reflects the post-security-remediation state.
--
-- WHY THIS EXISTS: the incremental migrations in supabase/migrations/ do NOT
-- cleanly replay onto an empty database (invalid/duplicate legacy SQL), and the
-- repo had drifted behind prod. This file is the source-of-truth for a rebuild.
--
-- TO REBUILD A FRESH DB: restore this file into a new project (psql -f), then
-- apply any migrations dated AFTER this snapshot. Do NOT auto-apply this file
-- as a migration — it lives outside supabase/migrations/ on purpose.
-- ============================================================================

--
-- PostgreSQL database dump
--

\restrict eUqkptkGqFkVSm7gdVaDLPGAgJDuNl40PKtkbchshPAlNfJ9w31Ehb1oryzyVxK

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'moderator',
    'user'
);


--
-- Name: list_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.list_category AS ENUM (
    'films',
    'places',
    'products',
    'services',
    'other'
);


--
-- Name: list_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.list_visibility AS ENUM (
    'private',
    'friends',
    'public'
);


--
-- Name: request_audience_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_audience_type AS ENUM (
    'first_network',
    'group',
    'specific_people',
    'public',
    'anonymous_expertise'
);


--
-- Name: request_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_category AS ENUM (
    'films',
    'places',
    'products',
    'services',
    'other'
);


--
-- Name: request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_status AS ENUM (
    'open',
    'responded',
    'reviewing',
    'closed'
);


--
-- Name: response_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.response_type AS ENUM (
    'existing_list',
    'new_recommendations',
    'comment'
);


--
-- Name: user_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_type AS ENUM (
    'verified',
    'guest'
);


--
-- Name: verification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.verification_status AS ENUM (
    'pending',
    'verified',
    'rejected'
);


--
-- Name: vote_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vote_type AS ENUM (
    'helpful',
    'not_helpful'
);


--
-- Name: admin_delete_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_user(user_id_to_delete uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;
  
  -- Prevent admin from deleting themselves
  IF auth.uid() = user_id_to_delete THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;
  
  -- Delete in order to respect dependencies
  -- Note: Many of these will be handled by ON DELETE CASCADE if constraints are in place
  
  -- Delete list items from user's lists
  DELETE FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE owner_id = user_id_to_delete);
  
  -- Delete user's lists
  DELETE FROM lists WHERE owner_id = user_id_to_delete;
  
  -- Delete request responses
  DELETE FROM request_responses WHERE responder_id = user_id_to_delete;
  DELETE FROM request_responses WHERE request_id IN (SELECT id FROM requests WHERE creator_id = user_id_to_delete);
  
  -- Delete request forwards
  DELETE FROM request_forwards WHERE forwarded_by_user_id = user_id_to_delete;
  DELETE FROM request_forwards WHERE request_id IN (SELECT id FROM requests WHERE creator_id = user_id_to_delete);
  
  -- Delete request votes
  DELETE FROM request_votes WHERE voter_id = user_id_to_delete;
  
  -- Delete user's requests
  DELETE FROM requests WHERE creator_id = user_id_to_delete;
  
  -- Delete directory votes
  DELETE FROM directory_votes WHERE voter_id = user_id_to_delete;
  
  -- Delete directory entries
  DELETE FROM directory_entries WHERE contributor_id = user_id_to_delete;
  
  -- Delete contact imports
  DELETE FROM contact_imports WHERE user_id = user_id_to_delete;
  DELETE FROM contact_imports WHERE matched_user_id = user_id_to_delete;
  
  -- Delete friendships
  DELETE FROM friendships WHERE user1_id = user_id_to_delete OR user2_id = user_id_to_delete;
  
  -- Delete friend requests
  DELETE FROM friend_requests WHERE requester_id = user_id_to_delete OR addressee_id = user_id_to_delete;
  
  -- Delete friend suggestions
  DELETE FROM friend_suggestions WHERE user_id = user_id_to_delete OR suggested_user_id = user_id_to_delete;
  
  -- Delete group memberships
  DELETE FROM group_members WHERE user_id = user_id_to_delete;
  
  -- Delete groups created by user
  DELETE FROM groups WHERE creator_id = user_id_to_delete;
  
  -- Delete notifications
  DELETE FROM notifications WHERE user_id = user_id_to_delete OR related_user_id = user_id_to_delete;
  
  -- Delete anonymous handles
  DELETE FROM anonymous_handles WHERE user_id = user_id_to_delete;
  
  -- Delete user expertise
  DELETE FROM user_expertise WHERE user_id = user_id_to_delete;
  
  -- Delete contact access logs
  DELETE FROM contact_access_logs WHERE user_id = user_id_to_delete;
  
  -- Delete search analytics
  DELETE FROM search_analytics WHERE user_id = user_id_to_delete;
  
  -- Delete user roles
  DELETE FROM user_roles WHERE user_id = user_id_to_delete;
  
  -- Delete profile
  DELETE FROM profiles WHERE id = user_id_to_delete;
  
  -- Finally delete from auth.users (requires service role in practice, but function runs as definer)
  DELETE FROM auth.users WHERE id = user_id_to_delete;
END;
$$;


--
-- Name: anonymous_active_cap_ok(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.anonymous_active_cap_ok(p_recipient_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT (
    SELECT count(*) FROM public.request_anonymous_impressions rai
    WHERE rai.recipient_id = p_recipient_id
      AND rai.dismissed_at IS NULL AND rai.responded = false
      AND rai.surfaced_at > now() - interval '14 days'
  ) < 12;
$$;


--
-- Name: anonymous_creator_cooldown_ok(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.anonymous_creator_cooldown_ok(p_creator_id uuid, p_recipient_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.request_anonymous_impressions rai
    JOIN public.requests r ON r.id = rai.request_id
    WHERE rai.recipient_id = p_recipient_id
      AND r.creator_id = p_creator_id
      AND rai.surfaced_at > now() - interval '48 hours'
  );
$$;


--
-- Name: anonymous_thread_label(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.anonymous_thread_label(p_uid uuid, p_request_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 'Contributor ' || upper(substr(md5(p_uid::text || ':' || p_request_id::text), 1, 4));
$$;


--
-- Name: audit_contact_access(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_contact_access() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Log all contact access for security monitoring
  PERFORM public.log_contact_access(
    TG_OP || '_CONTACT',
    COALESCE(NEW.id, OLD.id)
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: build_canonical_signature(text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.build_canonical_signature(p_entity_type text, p_geography text DEFAULT NULL::text, p_use_case text DEFAULT NULL::text, p_hard_filter text DEFAULT NULL::text, p_temporal_scope text DEFAULT 'current'::text, p_ranking_lens text DEFAULT 'best_overall'::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN concat_ws('|',
    normalize_for_canonical(p_entity_type),
    normalize_for_canonical(p_geography),
    normalize_for_canonical(p_use_case),
    normalize_for_canonical(p_hard_filter),
    normalize_for_canonical(p_temporal_scope),
    normalize_for_canonical(p_ranking_lens)
  );
END;
$$;


--
-- Name: build_canonical_title(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.build_canonical_title(p_entity_type text, p_plural_term text DEFAULT NULL::text, p_geography text DEFAULT NULL::text, p_use_case text DEFAULT NULL::text, p_hard_filter text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  title TEXT;
  display_entity TEXT;
BEGIN
  display_entity := COALESCE(p_plural_term, p_entity_type || 's');
  IF p_geography IS NOT NULL AND trim(p_geography) != '' THEN
    title := 'Best ' || display_entity || ' in ' || trim(p_geography);
  ELSE
    title := 'Best ' || display_entity;
  END IF;
  IF p_use_case IS NOT NULL AND trim(p_use_case) != '' THEN
    title := title || ' for ' || trim(p_use_case);
  END IF;
  IF p_hard_filter IS NOT NULL AND trim(p_hard_filter) != '' THEN
    title := title || ' · ' || trim(p_hard_filter);
  END IF;
  RETURN title;
END;
$$;


--
-- Name: calculate_request_relevance(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_request_relevance(user_id_param uuid, request_id_param uuid) RETURNS numeric
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  user_tags TEXT[];
  request_title TEXT;
  request_category list_category;
  relevance_score NUMERIC := 0;
  tag TEXT;
BEGIN
  -- Get user's expertise tags
  SELECT expertise_tags INTO user_tags
  FROM user_expertise
  WHERE user_id = user_id_param;
  
  -- Get request details
  SELECT r.title, r.category INTO request_title, request_category
  FROM requests r
  WHERE r.id = request_id_param;
  
  -- If no expertise tags, return 0
  IF user_tags IS NULL OR array_length(user_tags, 1) IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Calculate relevance based on tag matches in title and category
  FOREACH tag IN ARRAY user_tags
  LOOP
    -- Check if tag appears in request title (case insensitive)
    IF request_title ILIKE '%' || tag || '%' THEN
      relevance_score := relevance_score + 2;
    END IF;
    
    -- Check if tag matches category
    IF request_category::TEXT ILIKE '%' || tag || '%' THEN
      relevance_score := relevance_score + 3;
    END IF;
  END LOOP;
  
  RETURN relevance_score;
END;
$$;


--
-- Name: can_reveal_identity(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_reveal_identity(p_viewer_id uuid, p_request_id uuid, p_target_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_creator uuid;
  v_friends boolean;
BEGIN
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

  -- Without a request context, no further reveal
  IF p_request_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT creator_id INTO v_creator FROM public.requests WHERE id = p_request_id;
  IF v_creator IS NULL THEN
    RETURN false;
  END IF;

  -- Viewer is creator, target reached the request via direct (non-anonymous) audience
  IF p_viewer_id = v_creator AND public.user_in_direct_audience(p_target_user_id, p_request_id) THEN
    RETURN true;
  END IF;

  -- Target is creator, viewer reached request via direct audience (not anonymous routing)
  IF p_target_user_id = v_creator AND public.user_in_direct_audience(p_viewer_id, p_request_id) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;


--
-- Name: check_rate_limit(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_rate_limit(_key text, _action text, _limit integer, _window_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.rate_limit_log
  WHERE key = _key
    AND action = _action
    AND created_at > now() - make_interval(secs => _window_seconds);

  IF v_count >= _limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_log (key, action) VALUES (_key, _action);

  -- Opportunistic cleanup of old rows for this key/action.
  DELETE FROM public.rate_limit_log
  WHERE key = _key AND action = _action
    AND created_at < now() - make_interval(secs => _window_seconds * 2);

  RETURN true;
END;
$$;


--
-- Name: cleanup_expired_contacts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_contacts() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Delete contacts past retention period (1 year)
  DELETE FROM contact_imports 
  WHERE data_retention_expires_at < now()
  AND consent_given = false;
  
  -- For consented contacts, anonymize after retention period
  UPDATE contact_imports 
  SET 
    contact_name = 'ANONYMIZED',
    contact_phone = NULL,
    contact_email = NULL,
    encrypted_phone = NULL,
    encrypted_email = NULL
  WHERE data_retention_expires_at < now()
  AND consent_given = true
  AND contact_name != 'ANONYMIZED';
END;
$$;


--
-- Name: compute_request_routing_signal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_request_routing_signal() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


--
-- Name: create_anonymous_handle_for_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_anonymous_handle_for_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only create for verified users with complete profiles
  IF NEW.is_verified = true AND NEW.full_name IS NOT NULL AND NEW.handle IS NOT NULL THEN
    INSERT INTO anonymous_handles (user_id, anonymous_handle)
    VALUES (NEW.id, public.generate_anonymous_handle())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: create_mutual_friend_suggestions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_mutual_friend_suggestions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  contact_rec RECORD;
  suggestion_exists BOOLEAN;
  user_email TEXT;
  hashed_match_value TEXT;
BEGIN
  -- Only proceed if the user has a complete profile
  IF NEW.full_name IS NULL OR NEW.handle IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- When a new profile is created or phone number is updated
  IF NEW.phone_number IS NOT NULL AND NEW.phone_number != '' THEN
    -- Direct query instead of using the vulnerable function
    FOR contact_rec IN 
      SELECT ci.user_id, ci.contact_name, ci.contact_email
      FROM contact_imports ci
      JOIN profiles p ON ci.user_id = p.id  -- Only users with complete profiles
      WHERE ci.contact_phone = NEW.phone_number 
      AND ci.user_id != NEW.id  -- CRITICAL: Don't match with self
      AND NOT ci.is_matched
      AND p.full_name IS NOT NULL 
      AND p.handle IS NOT NULL
    LOOP
      -- Check if suggestion already exists
      SELECT EXISTS(
        SELECT 1 FROM friend_suggestions 
        WHERE user_id = contact_rec.user_id 
        AND suggested_user_id = NEW.id
      ) INTO suggestion_exists;
      
      -- Create mutual suggestions if they don't exist
      IF NOT suggestion_exists THEN
        -- Hash the phone number for privacy
        hashed_match_value := public.hash_contact_info(NEW.phone_number);
        
        -- Temporarily allow inserts for system operations
        SET LOCAL row_security = off;
        
        -- Suggestion for contact owner about new user
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (contact_rec.user_id, NEW.id, 'phone', hashed_match_value);
        
        -- Suggestion for new user about contact owner (reverse suggestion)
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (NEW.id, contact_rec.user_id, 'phone', hashed_match_value);
        
        -- Create notifications for BOTH users
        INSERT INTO notifications (user_id, type, title, message, related_user_id)
        VALUES 
        (contact_rec.user_id, 'contact_joined', 'Someone from your contacts joined!', 
         CONCAT(COALESCE(contact_rec.contact_name, NEW.full_name, 'A contact'), ' just joined Antelog'), NEW.id),
        (NEW.id, 'contact_joined', 'Found a connection!', 
         'Someone who has your contact just connected on Antelog', contact_rec.user_id);
        
        -- Reset row security
        SET LOCAL row_security = on;
      END IF;
      
      -- Mark contact as matched
      UPDATE contact_imports 
      SET is_matched = true, matched_user_id = NEW.id
      WHERE user_id = contact_rec.user_id AND contact_phone = NEW.phone_number;
    END LOOP;
  END IF;
  
  -- Also check email matches (get email from auth.users)
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;
  
  IF user_email IS NOT NULL THEN
    FOR contact_rec IN 
      SELECT ci.user_id, ci.contact_name, ci.contact_email
      FROM contact_imports ci
      JOIN profiles p ON ci.user_id = p.id  -- Only users with complete profiles
      WHERE ci.contact_email = user_email
      AND ci.user_id != NEW.id  -- CRITICAL: Don't match with self
      AND NOT ci.is_matched
      AND p.full_name IS NOT NULL 
      AND p.handle IS NOT NULL
    LOOP
      -- Check if suggestion already exists
      SELECT EXISTS(
        SELECT 1 FROM friend_suggestions 
        WHERE user_id = contact_rec.user_id 
        AND suggested_user_id = NEW.id
      ) INTO suggestion_exists;
      
      -- Create mutual suggestions if they don't exist
      IF NOT suggestion_exists THEN
        -- Hash the email for privacy
        hashed_match_value := public.hash_contact_info(user_email);
        
        -- Temporarily allow inserts for system operations
        SET LOCAL row_security = off;
        
        -- Suggestion for contact owner about new user
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (contact_rec.user_id, NEW.id, 'email', hashed_match_value);
        
        -- Suggestion for new user about contact owner
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (NEW.id, contact_rec.user_id, 'email', hashed_match_value);
        
        -- Create notifications for BOTH users
        INSERT INTO notifications (user_id, type, title, message, related_user_id)
        VALUES 
        (contact_rec.user_id, 'contact_joined', 'Someone from your contacts joined!', 
         CONCAT(COALESCE(contact_rec.contact_name, NEW.full_name, 'A contact'), ' just joined Antelog'), NEW.id),
        (NEW.id, 'contact_joined', 'Found a connection!', 
         'Someone who has your contact just connected on Antelog', contact_rec.user_id);
        
        -- Reset row security  
        SET LOCAL row_security = on;
      END IF;
      
      -- Mark contact as matched
      UPDATE contact_imports 
      SET is_matched = true, matched_user_id = NEW.id
      WHERE user_id = contact_rec.user_id AND contact_email = user_email;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: debug_anonymous_match(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.debug_anonymous_match(p_request_id uuid, p_uid uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: debug_phone_match(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.debug_phone_match(contact_phone_input text, profile_phone_input text) RETURNS TABLE(contact_original text, contact_normalized text, profile_original text, profile_normalized text, matches boolean)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  contact_norm TEXT;
  profile_norm TEXT;
BEGIN
  contact_norm := public.normalize_phone_number(contact_phone_input);
  profile_norm := public.normalize_phone_number(profile_phone_input);
  
  RETURN QUERY
  SELECT 
    contact_phone_input,
    contact_norm,
    profile_phone_input,
    profile_norm,
    (contact_norm = profile_norm);
END;
$$;


--
-- Name: decrement_directory_item_vote_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_directory_item_vote_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE master_directory_items
  SET vote_count = GREATEST(vote_count - 1, 0)
  WHERE id = OLD.item_id;

  UPDATE master_directory_lists
  SET 
    total_votes = GREATEST(total_votes - 1, 0),
    contributor_count = (
      SELECT COUNT(DISTINCT mdv.user_id) 
      FROM master_directory_votes mdv
      JOIN master_directory_items mdi ON mdv.item_id = mdi.id
      WHERE mdi.list_id = (SELECT list_id FROM master_directory_items WHERE id = OLD.item_id)
    ),
    updated_at = NOW()
  WHERE id = (SELECT list_id FROM master_directory_items WHERE id = OLD.item_id);

  RETURN OLD;
END;
$$;


--
-- Name: dismiss_anonymous_impression(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dismiss_anonymous_impression(p_request_id uuid, p_action text DEFAULT 'dismiss'::text, p_snooze_days integer DEFAULT 7) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: encrypt_contact_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encrypt_contact_data() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only encrypt if consent is given
  IF NEW.consent_given = true THEN
    -- Hash the phone and email for privacy (using existing hash function)
    IF NEW.contact_phone IS NOT NULL AND NEW.contact_phone != '' THEN
      NEW.encrypted_phone := public.hash_contact_info(NEW.contact_phone);
    END IF;
    
    IF NEW.contact_email IS NOT NULL AND NEW.contact_email != '' THEN
      NEW.encrypted_email := public.hash_contact_info(NEW.contact_email);
    END IF;
    
    NEW.consent_timestamp := now();
  ELSE
    -- Clear encrypted data if consent is revoked
    NEW.encrypted_phone := NULL;
    NEW.encrypted_email := NULL;
    NEW.consent_timestamp := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: estimate_anonymous_expertise_reach(text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.estimate_anonymous_expertise_reach(p_category text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_keywords text[] DEFAULT NULL::text[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
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
    WHERE p.user_type = 'verified' AND p.id <> caller
      AND NOT EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE (f.user1_id = caller AND f.user2_id = p.id)
           OR (f.user2_id = caller AND f.user1_id = p.id)
      )
      AND (
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


--
-- Name: estimate_anonymous_expertise_reach(text, text, text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.estimate_anonymous_expertise_reach(p_category text, p_location text, p_keywords text[] DEFAULT NULL::text[], p_title text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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

  combined_expertise_tokens := ARRAY(
    SELECT DISTINCT t FROM unnest(
      coalesce(title_tokens, ARRAY[]::text[])
      || coalesce(kw_tokens, ARRAY[]::text[])
      || CASE WHEN cat_token IS NOT NULL AND cat_token <> 'other' THEN ARRAY[cat_token] ELSE ARRAY[]::text[] END
    ) t WHERE length(coalesce(t,'')) >= 3
  );

  combined_location_tokens := ARRAY(
    SELECT DISTINCT t FROM unnest(
      coalesce(loc_tokens, ARRAY[]::text[]) || coalesce(title_tokens, ARRAY[]::text[])
    ) t WHERE length(coalesce(t,'')) >= 2
  );

  SELECT count(*) INTO cnt FROM (
    SELECT p.id
    FROM public.profiles p
    WHERE p.user_type = 'verified' AND p.id <> caller
      -- Exclude 1st degree (direct friends)
      AND NOT EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE (f.user1_id = caller AND f.user2_id = p.id)
           OR (f.user2_id = caller AND f.user1_id = p.id)
      )
      -- Exclude 2nd degree (friends of friends)
      AND NOT EXISTS (
        SELECT 1 FROM public.get_extended_network(caller) en
        WHERE en.profile_id = p.id
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
$$;


--
-- Name: find_network_experts(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_network_experts(viewer_id uuid, query_domains text[]) RETURNS TABLE(profile_id uuid, full_name text, handle text, matching_domains text[], degree integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  -- 1st degree friends with matching expertise
  SELECT 
    p.id as profile_id,
    p.full_name,
    p.handle,
    ARRAY(
      SELECT UNNEST(
        ARRAY(SELECT jsonb_array_elements_text(p.expertise_domains))
      )
      INTERSECT
      SELECT UNNEST(query_domains)
    ) as matching_domains,
    1 as degree
  FROM friendships f
  JOIN profiles p ON (
    CASE 
      WHEN f.user1_id = viewer_id THEN p.id = f.user2_id
      ELSE p.id = f.user1_id
    END
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
      SELECT UNNEST(
        ARRAY(SELECT jsonb_array_elements_text(p.expertise_domains))
      )
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
  -- Exclude 1st degree (already included above)
  AND NOT EXISTS (
    SELECT 1 FROM friendships f2
    WHERE (f2.user1_id = viewer_id AND f2.user2_id = p.id)
    OR (f2.user2_id = viewer_id AND f2.user1_id = p.id)
  )

  ORDER BY degree ASC, full_name ASC
  LIMIT 5;
END;
$$;


--
-- Name: find_network_experts_all_degrees(uuid, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_network_experts_all_degrees(viewer_id uuid, domain_filter text DEFAULT NULL::text, location_filter text DEFAULT NULL::text, max_depth integer DEFAULT 6) RETURNS TABLE(expert_user_id uuid, expert_name text, expert_handle text, network_degree integer, connection_path text[], matched_domains text[], matched_cities text[])
    LANGUAGE sql SECURITY DEFINER
    AS $$
  WITH RECURSIVE
  network_graph(uid, hop, path) AS (
    SELECT
      CASE WHEN f.user1_id = viewer_id THEN f.user2_id ELSE f.user1_id END,
      1,
      ARRAY[viewer_id, CASE WHEN f.user1_id = viewer_id THEN f.user2_id ELSE f.user1_id END]
    FROM friendships f
    WHERE f.user1_id = viewer_id OR f.user2_id = viewer_id

    UNION

    SELECT
      CASE WHEN f.user1_id = ng.uid THEN f.user2_id ELSE f.user1_id END,
      ng.hop + 1,
      ng.path || CASE WHEN f.user1_id = ng.uid THEN f.user2_id ELSE f.user1_id END
    FROM network_graph ng
    JOIN friendships f ON f.user1_id = ng.uid OR f.user2_id = ng.uid
    WHERE ng.hop < max_depth
      AND (CASE WHEN f.user1_id = ng.uid THEN f.user2_id ELSE f.user1_id END) != ALL(ng.path)
  ),
  shortest_paths AS (
    SELECT DISTINCT ON (uid) uid, hop, path
    FROM network_graph
    WHERE uid != viewer_id
    ORDER BY uid, hop ASC
  ),
  matched AS (
    SELECT
      sp.uid,
      sp.hop,
      sp.path,
      array_agg(DISTINCT ed) FILTER (WHERE
        domain_filter IS NOT NULL AND length(domain_filter) > 0 AND
        lower(ed) ILIKE '%' || lower(domain_filter) || '%'
      ) as m_domains,
      array_agg(DISTINCT ec) FILTER (WHERE
        location_filter IS NOT NULL AND length(location_filter) > 0 AND
        lower(ec) ILIKE '%' || lower(location_filter) || '%'
      ) as m_cities
    FROM shortest_paths sp
    JOIN profiles p ON p.id = sp.uid
    LEFT JOIN jsonb_array_elements_text(p.expertise_domains) ed ON true
    LEFT JOIN jsonb_array_elements_text(p.expertise_cities) ec ON true
    WHERE p.user_type = 'verified'
    GROUP BY sp.uid, sp.hop, sp.path
    HAVING (
      (domain_filter IS NOT NULL AND length(domain_filter) > 0 AND
        bool_or(lower(ed) ILIKE '%' || lower(domain_filter) || '%'))
      OR
      (location_filter IS NOT NULL AND length(location_filter) > 0 AND
        bool_or(lower(ec) ILIKE '%' || lower(location_filter) || '%'))
    )
  )
  SELECT
    m.uid,
    p.full_name,
    p.handle,
    m.hop,
    ARRAY(
      SELECT prof.full_name
      FROM unnest(m.path) WITH ORDINALITY AS t(pid, ord)
      JOIN profiles prof ON prof.id = t.pid
      ORDER BY ord
    ),
    m.m_domains,
    m.m_cities
  FROM matched m
  JOIN profiles p ON p.id = m.uid
  ORDER BY m.hop ASC, array_length(m.m_domains, 1) DESC NULLS LAST
  LIMIT 10;
$$;


--
-- Name: find_profile_by_normalized_phone(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_profile_by_normalized_phone(input_phone text, exclude_user_id uuid) RETURNS TABLE(id uuid, full_name text, handle text, phone_number text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name, p.handle, p.phone_number
  FROM profiles p
  WHERE public.normalize_phone_number(p.phone_number) = public.normalize_phone_number(input_phone)
    AND p.id != exclude_user_id
    AND p.full_name IS NOT NULL
    AND p.handle IS NOT NULL
  LIMIT 1;
END;
$$;


--
-- Name: find_similar_directory_lists(text, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_similar_directory_lists(p_title text, p_threshold double precision DEFAULT 0.5) RETURNS TABLE(id uuid, title text, contributor_count integer, total_votes integer, similarity_score double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mdl.id,
    mdl.title,
    mdl.contributor_count,
    mdl.total_votes,
    similarity(mdl.title_normalized, normalize_directory_text(p_title))::FLOAT as similarity_score
  FROM master_directory_lists mdl
  WHERE similarity(mdl.title_normalized, normalize_directory_text(p_title)) > p_threshold
  ORDER BY similarity_score DESC
  LIMIT 5;
END;
$$;


--
-- Name: find_similar_recommendations_unified(uuid, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_similar_recommendations_unified(req_id uuid, threshold double precision DEFAULT 0.5) RETURNS TABLE(rec1_text text, rec2_text text, rec1_source text, rec2_source text, similarity_score double precision)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH all_recs AS (
    -- Antelog recommendations: exclude merged away entries
    SELECT 
      rr.recommendation_text as text,
      lower(trim(rr.recommendation_text)) as text_normalized,
      'antelog' as source
    FROM response_recommendations rr
    JOIN request_responses resp ON rr.response_id = resp.id
    WHERE resp.request_id = req_id
    AND (rr.merged_into_id IS NULL AND (rr.merged_away IS NULL OR rr.merged_away = FALSE))

    UNION ALL

    -- Guest recommendations: exclude merged away entries
    SELECT 
      (item->>'text')::TEXT as text,
      lower(trim(item->>'text')) as text_normalized,
      'guest' as source
    FROM guest_contributions gc,
    jsonb_array_elements(gc.recommendations) AS item
    WHERE gc.request_id = req_id
    AND item->>'text' IS NOT NULL
    AND item IS NOT NULL
    AND item != 'null'::jsonb
    AND (item->>'merged_into_id') IS NULL
  )
  SELECT 
    a.text as rec1_text,
    b.text as rec2_text,
    a.source as rec1_source,
    b.source as rec2_source,
    similarity(a.text_normalized, b.text_normalized)::FLOAT as similarity_score
  FROM all_recs a
  CROSS JOIN all_recs b
  WHERE a.text_normalized < b.text_normalized
  AND similarity(a.text_normalized, b.text_normalized) > threshold
  ORDER BY similarity_score DESC;
END;
$$;


--
-- Name: generate_anonymous_handle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_anonymous_handle() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  new_handle TEXT;
  handle_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate format: @user followed by 4-digit random number
    new_handle := '@user' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    
    -- Check if handle already exists
    SELECT EXISTS(
      SELECT 1 FROM anonymous_handles WHERE anonymous_handle = new_handle
    ) INTO handle_exists;
    
    EXIT WHEN NOT handle_exists;
  END LOOP;
  
  RETURN new_handle;
END;
$$;


--
-- Name: generate_share_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_share_token() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..12 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;


--
-- Name: get_connection_path(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_connection_path(user_a uuid, user_b uuid) RETURNS text[]
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  path TEXT[];
  mutual_friend_name TEXT;
BEGIN
  -- Check if they are direct friends
  IF EXISTS (
    SELECT 1 FROM friendships f
    WHERE (f.user1_id = user_a AND f.user2_id = user_b) OR
          (f.user2_id = user_a AND f.user1_id = user_b)
  ) THEN
    SELECT ARRAY[
      (SELECT full_name FROM profiles WHERE id = user_a),
      (SELECT full_name FROM profiles WHERE id = user_b)
    ] INTO path;
    RETURN path;
  END IF;
  
  -- Check for connection through mutual friend (extended network)
  SELECT en.mutual_friends[1] INTO mutual_friend_name
  FROM get_extended_network(user_a) en
  WHERE en.profile_id = user_b
  LIMIT 1;
  
  IF mutual_friend_name IS NOT NULL THEN
    SELECT ARRAY[
      (SELECT full_name FROM profiles WHERE id = user_a),
      mutual_friend_name,
      (SELECT full_name FROM profiles WHERE id = user_b)
    ] INTO path;
    RETURN path;
  END IF;
  
  -- No connection found
  RETURN ARRAY[]::TEXT[];
END;
$$;


--
-- Name: get_current_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_user_role() RETURNS public.app_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT role 
  FROM public.user_roles 
  WHERE user_id = auth.uid() 
  ORDER BY CASE role 
    WHEN 'admin' THEN 1 
    WHEN 'moderator' THEN 2 
    WHEN 'user' THEN 3 
  END 
  LIMIT 1
$$;


--
-- Name: get_dashboard_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_summary() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  uid uuid := auth.uid();
  v_created int; v_open int; v_network int; v_unread int; v_has_activity boolean;
begin
  if uid is null then return null; end if;
  select count(*) into v_created from requests where creator_id = uid;
  select count(*) into v_open from requests where creator_id = uid and status = 'open';
  select count(*) into v_network from friendships where user1_id = uid or user2_id = uid;
  select count(*) into v_unread from notifications where user_id = uid and is_read = false;
  select exists(select 1 from notifications where user_id = uid) into v_has_activity;
  return jsonb_build_object(
    'is_new_user', (v_created = 0 and not v_has_activity),
    'requests_created', v_created,
    'requests_open', v_open,
    'network_count', v_network,
    'unread_notifications', v_unread
  );
end; $$;


--
-- Name: get_degree_of_separation(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_degree_of_separation(user_a uuid, user_b uuid) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Same user
  IF user_a = user_b THEN
    RETURN 0;
  END IF;
  
  -- Direct friends (1st degree)
  IF EXISTS (
    SELECT 1 FROM friendships f
    WHERE (f.user1_id = user_a AND f.user2_id = user_b) OR
          (f.user2_id = user_a AND f.user1_id = user_b)
  ) THEN
    RETURN 1;
  END IF;
  
  -- Extended network (2nd degree)
  IF EXISTS (
    SELECT 1 FROM get_extended_network(user_a) en
    WHERE en.profile_id = user_b
  ) THEN
    RETURN 2;
  END IF;
  
  -- No connection
  RETURN NULL;
END;
$$;


--
-- Name: get_display_identity(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_display_identity(viewer_id uuid, profile_id uuid) RETURNS TABLE(name text, handle text, is_anonymous boolean, is_verified boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN public.is_in_network(viewer_id, profile_id) THEN p.full_name
      ELSE ah.anonymous_handle
    END as name,
    CASE 
      WHEN public.is_in_network(viewer_id, profile_id) THEN p.handle
      ELSE ah.anonymous_handle
    END as handle,
    NOT public.is_in_network(viewer_id, profile_id) as is_anonymous,
    p.is_verified
  FROM profiles p
  LEFT JOIN anonymous_handles ah ON ah.user_id = p.id
  WHERE p.id = profile_id;
END;
$$;


--
-- Name: get_extended_network(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_extended_network(user_id uuid) RETURNS TABLE(profile_id uuid, full_name text, handle text, mutual_friends text[])
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as profile_id,
    p.full_name,
    p.handle,
    array_agg(DISTINCT mutual_friend.full_name) as mutual_friends
  FROM profiles p
  JOIN friendships f2 ON (p.id = f2.user1_id OR p.id = f2.user2_id)
  JOIN profiles mutual_friend ON (
    CASE 
      WHEN f2.user1_id = p.id THEN f2.user2_id 
      ELSE f2.user1_id 
    END = mutual_friend.id
  )
  JOIN friendships f1 ON (mutual_friend.id = f1.user1_id OR mutual_friend.id = f1.user2_id)
  WHERE 
    (f1.user1_id = user_id OR f1.user2_id = user_id)
    AND p.id != user_id
    AND p.id NOT IN (
      SELECT CASE 
        WHEN direct_f.user1_id = user_id THEN direct_f.user2_id 
        ELSE direct_f.user1_id 
      END
      FROM friendships direct_f 
      WHERE direct_f.user1_id = user_id OR direct_f.user2_id = user_id
    )
    AND p.full_name IS NOT NULL 
    AND p.handle IS NOT NULL
    AND p.user_type = 'verified'
    AND mutual_friend.id != user_id
  GROUP BY p.id, p.full_name, p.handle
  ORDER BY array_length(array_agg(DISTINCT mutual_friend.full_name), 1) DESC, p.full_name;
END;
$$;


--
-- Name: get_for_you_requests(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_for_you_requests(p_limit integer DEFAULT 20) RETURNS TABLE(request_id uuid, title text, category text, location text, created_at timestamp with time zone, expires_at timestamp with time zone, creator_label text, contributor_label text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
      AND NOT EXISTS (
        SELECT 1 FROM public.request_responses rr
        WHERE rr.request_id = r.id AND rr.responder_id = caller
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.request_anonymous_impressions rai
        WHERE rai.request_id = r.id AND rai.recipient_id = caller
          AND (
            rai.responded = true
            OR (rai.dismissed_at IS NOT NULL AND rai.dismissed_at > now())
          )
      )
      AND public.anonymous_creator_cooldown_ok(r.creator_id, caller)
      AND public.anonymous_active_cap_ok(caller)
  ),
  diversified AS (
    SELECT e.*, ROW_NUMBER() OVER (
      PARTITION BY e.creator_id ORDER BY e.combined_score DESC, e.created_at DESC
    ) AS rn
    FROM eligible e
  ),
  picked AS (
    SELECT * FROM diversified WHERE rn <= 2
    ORDER BY combined_score DESC, created_at DESC
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
$$;


--
-- Name: get_fyp_latest_surfaced_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_fyp_latest_surfaced_at() RETURNS timestamp with time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT max(rai.surfaced_at)
  FROM public.request_anonymous_impressions rai
  WHERE rai.recipient_id = auth.uid()
    AND rai.responded = false
    AND rai.dismissed_at IS NULL;
$$;


--
-- Name: get_guest_page_preview(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_guest_page_preview(p_request_id uuid) RETURNS TABLE(recommendation_text text, reason text, total_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH all_recs AS (
    SELECT 
      rr.recommendation_text,
      rr.reason,
      COUNT(*) OVER () as total_count,
      ROW_NUMBER() OVER (ORDER BY rr.vote_count DESC, rr.created_at ASC) as rn
    FROM request_responses resp
    JOIN response_recommendations rr ON rr.response_id = resp.id
    WHERE resp.request_id = p_request_id
    AND (rr.merged_away IS NULL OR rr.merged_away = false)
  )
  SELECT 
    ar.recommendation_text,
    ar.reason,
    ar.total_count
  FROM all_recs ar
  WHERE ar.rn <= 2
  ORDER BY ar.rn;
END;
$$;


--
-- Name: get_network_contributors(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_network_contributors(user_id_param uuid, contributor_ids uuid[]) RETURNS TABLE(contributor_id uuid, full_name text, handle text, is_friend boolean, is_extended_network boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  friend_ids uuid[];
  extended_ids uuid[];
BEGIN
  -- Get direct friends
  SELECT array_agg(DISTINCT 
    CASE 
      WHEN f.user1_id = user_id_param THEN f.user2_id
      ELSE f.user1_id
    END
  ) INTO friend_ids
  FROM friendships f
  WHERE f.user1_id = user_id_param OR f.user2_id = user_id_param;
  
  -- Get extended network
  SELECT array_agg(DISTINCT en.profile_id) INTO extended_ids
  FROM get_extended_network(user_id_param) en;
  
  -- Return contributor info with network status
  RETURN QUERY
  SELECT 
    p.id as contributor_id,
    p.full_name,
    p.handle,
    (friend_ids @> ARRAY[p.id]) as is_friend,
    (extended_ids @> ARRAY[p.id]) as is_extended_network
  FROM profiles p
  WHERE p.id = ANY(contributor_ids)
  AND p.full_name IS NOT NULL 
  AND p.handle IS NOT NULL;
END;
$$;


--
-- Name: get_request_for_guest(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_request_for_guest(p_request_id uuid, p_token text) RETURNS TABLE(id uuid, title text, category public.request_category, location text, status public.request_status, created_at timestamp with time zone, expires_at timestamp with time zone, creator_id uuid, creator_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT r.id, r.title, r.category, r.location, r.status, r.created_at, r.expires_at,
         r.creator_id, p.full_name AS creator_name
  FROM public.requests r
  JOIN public.share_links sl ON sl.request_id = r.id
  LEFT JOIN public.profiles p ON p.id = r.creator_id
  WHERE r.id = p_request_id AND sl.token = p_token
  LIMIT 1;
$$;


--
-- Name: get_response_origin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_response_origin(p_response_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_request uuid; v_responder uuid;
BEGIN
  SELECT request_id, responder_id INTO v_request, v_responder
  FROM public.request_responses WHERE id = p_response_id;
  IF NOT FOUND THEN RETURN 'direct'; END IF;
  IF public.user_in_direct_audience(v_responder, v_request) THEN RETURN 'direct'; END IF;
  RETURN 'anonymous';
END;
$$;


--
-- Name: get_response_tree(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_response_tree(p_request_id uuid) RETURNS TABLE(node_id text, parent_node_id text, person_name text, is_antelog_user boolean, is_root boolean, has_responded boolean, has_forwarded boolean, recommendation_count integer, forwarded_to_count integer, earliest_action_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_creator_id UUID;
  v_root_node_id TEXT;
BEGIN
  SELECT r.creator_id INTO v_creator_id FROM requests r WHERE r.id = p_request_id;
  v_root_node_id := 'user:' || v_creator_id::TEXT;

  RETURN QUERY
  WITH
  antelog_nodes AS (
    SELECT
      'user:' || u.user_id::TEXT AS node_id,
      u.user_id,
      p.full_name AS person_name,
      TRUE AS is_antelog_user,
      (u.user_id = v_creator_id) AS is_root
    FROM (
      SELECT v_creator_id AS user_id
      UNION
      SELECT rr.responder_id FROM request_responses rr WHERE rr.request_id = p_request_id
      UNION
      SELECT rf.forwarded_by_user_id FROM request_forwards rf WHERE rf.request_id = p_request_id
      UNION
      SELECT UNNEST(rf.forwarded_to) FROM request_forwards rf WHERE rf.request_id = p_request_id
    ) u
    JOIN profiles p ON p.id = u.user_id
  ),
  guest_nodes AS (
    SELECT DISTINCT ON (gc.contributor_name, gc.share_link_id)
      'guest:' || gc.share_link_id::TEXT || ':' || gc.contributor_name AS node_id,
      gc.share_link_id,
      gc.contributor_name AS person_name,
      FALSE AS is_antelog_user,
      FALSE AS is_root
    FROM guest_contributions gc
    WHERE gc.request_id = p_request_id
      AND EXISTS (
        SELECT 1 FROM guest_contributions gc2
        WHERE gc2.request_id = p_request_id
          AND gc2.contributor_name = gc.contributor_name
          AND gc2.share_link_id = gc.share_link_id
          AND jsonb_array_length(gc2.recommendations) > 0
      )
    ORDER BY gc.contributor_name, gc.share_link_id, gc.created_at
  ),
  guest_with_parent AS (
    SELECT
      gn.node_id,
      gn.share_link_id,
      gn.person_name,
      gn.is_antelog_user,
      gn.is_root,
      CASE
        WHEN sl.generated_by_user_id IS NOT NULL THEN 'user:' || sl.generated_by_user_id::TEXT
        WHEN sl.generated_by_name IS NOT NULL THEN COALESCE(
          (SELECT gn2.node_id FROM guest_nodes gn2
           WHERE gn2.person_name = sl.generated_by_name
             AND gn2.share_link_id = sl.parent_link_id
           LIMIT 1),
          v_root_node_id
        )
        ELSE v_root_node_id
      END AS parent_node_id
    FROM guest_nodes gn
    JOIN share_links sl ON sl.id = gn.share_link_id
  ),
  antelog_with_parent AS (
    SELECT
      an.node_id,
      an.user_id,
      an.person_name,
      an.is_antelog_user,
      an.is_root,
      CASE
        WHEN an.is_root THEN NULL
        ELSE COALESCE(
          (SELECT 'user:' || rf.forwarded_by_user_id::TEXT
           FROM request_forwards rf
           WHERE rf.request_id = p_request_id
             AND an.user_id = ANY(rf.forwarded_to)
           LIMIT 1),
          v_root_node_id
        )
      END AS parent_node_id
    FROM antelog_nodes an
  ),
  all_nodes AS (
    SELECT
      awp.node_id, awp.parent_node_id, awp.person_name, awp.is_antelog_user, awp.is_root,
      awp.user_id AS antelog_user_id, NULL::UUID AS guest_share_link_id
    FROM antelog_with_parent awp
    UNION ALL
    SELECT
      gwp.node_id, gwp.parent_node_id, gwp.person_name, gwp.is_antelog_user, gwp.is_root,
      NULL::UUID, gwp.share_link_id
    FROM guest_with_parent gwp
  )
  SELECT
    an.node_id,
    an.parent_node_id,
    an.person_name,
    an.is_antelog_user,
    an.is_root,
    CASE
      WHEN an.is_antelog_user THEN EXISTS (
        SELECT 1 FROM request_responses rr
        WHERE rr.request_id = p_request_id AND rr.responder_id = an.antelog_user_id
      )
      ELSE EXISTS (
        SELECT 1 FROM guest_contributions gc
        WHERE gc.request_id = p_request_id
          AND gc.contributor_name = an.person_name
          AND gc.share_link_id = an.guest_share_link_id
          AND jsonb_array_length(gc.recommendations) > 0
      )
    END AS has_responded,
    CASE
      WHEN an.is_antelog_user THEN (
        EXISTS (SELECT 1 FROM share_links sl WHERE sl.request_id = p_request_id AND sl.generated_by_user_id = an.antelog_user_id AND sl.parent_link_id IS NOT NULL)
        OR EXISTS (SELECT 1 FROM request_forwards rf WHERE rf.request_id = p_request_id AND rf.forwarded_by_user_id = an.antelog_user_id)
      )
      ELSE EXISTS (
        SELECT 1 FROM share_links sl WHERE sl.request_id = p_request_id AND sl.generated_by_name = an.person_name
      )
    END AS has_forwarded,
    CASE
      WHEN an.is_antelog_user THEN (
        SELECT COUNT(*)::INT FROM response_recommendations rrec
        JOIN request_responses rr ON rr.id = rrec.response_id
        WHERE rr.request_id = p_request_id AND rr.responder_id = an.antelog_user_id
          AND (rrec.merged_away IS NULL OR rrec.merged_away = false)
      )
      ELSE COALESCE((
        SELECT SUM(jsonb_array_length(gc.recommendations))::INT FROM guest_contributions gc
        WHERE gc.request_id = p_request_id
          AND gc.contributor_name = an.person_name
          AND gc.share_link_id = an.guest_share_link_id
      ), 0)
    END AS recommendation_count,
    (SELECT COUNT(*)::INT FROM all_nodes child WHERE child.parent_node_id = an.node_id) AS forwarded_to_count,
    CASE
      WHEN an.is_antelog_user THEN (
        SELECT MIN(rr.created_at) FROM request_responses rr
        WHERE rr.request_id = p_request_id AND rr.responder_id = an.antelog_user_id
      )
      ELSE (
        SELECT MIN(gc.created_at) FROM guest_contributions gc
        WHERE gc.request_id = p_request_id
          AND gc.contributor_name = an.person_name
          AND gc.share_link_id = an.guest_share_link_id
      )
    END AS earliest_action_at
  FROM all_nodes an;
END;
$$;


--
-- Name: get_safe_profile_view(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_safe_profile_view(profile_id uuid) RETURNS TABLE(id uuid, full_name text, handle text, is_verified boolean, phone_number text, location text, occupation text, bio text, interests jsonb, expertise_domains jsonb, expertise_cities jsonb, user_type text, relationship text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  target_uuid UUID := profile_id;
  is_friend boolean := false;
  is_extended_network boolean := false;
  is_admin boolean := false;
  has_pending_request boolean := false;
  is_any_network boolean := false;
  relationship_type TEXT := 'public';
BEGIN
  SELECT public.has_role(auth.uid(), 'admin'::app_role) INTO is_admin;

  IF auth.uid() = target_uuid THEN
    relationship_type := 'self';
  ELSE
    -- Check 1st degree
    SELECT EXISTS (
      SELECT 1 FROM friendships f 
      WHERE ((f.user1_id = auth.uid() AND f.user2_id = target_uuid) OR 
             (f.user2_id = auth.uid() AND f.user1_id = target_uuid))
    ) INTO is_friend;

    IF is_friend THEN
      relationship_type := 'first_degree';
    ELSE
      -- Check 2nd degree
      SELECT EXISTS (
        SELECT 1 FROM get_extended_network(auth.uid()) en 
        WHERE en.profile_id = target_uuid
      ) INTO is_extended_network;

      IF is_extended_network THEN
        relationship_type := 'second_degree';
      ELSE
        -- Check 3rd+ degree via get_third_plus_network
        SELECT EXISTS (
          SELECT 1 FROM get_third_plus_network(auth.uid(), 6) tn
          WHERE tn.profile_id = target_uuid
        ) INTO is_any_network;

        IF is_any_network THEN
          relationship_type := 'extended_network';
        END IF;
      END IF;

      -- Check pending request
      SELECT EXISTS (
        SELECT 1 FROM friend_requests fr
        WHERE ((fr.requester_id = auth.uid() AND fr.addressee_id = target_uuid) OR
               (fr.requester_id = target_uuid AND fr.addressee_id = auth.uid()))
        AND fr.status = 'pending'
      ) INTO has_pending_request;
    END IF;
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    CASE WHEN auth.uid() = p.id OR is_admin OR is_friend OR is_extended_network OR is_any_network OR has_pending_request 
      THEN p.full_name ELSE NULL END,
    p.handle,
    p.is_verified,
    CASE WHEN auth.uid() = p.id OR is_admin THEN p.phone_number ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR is_admin OR is_friend OR is_extended_network OR is_any_network 
      THEN p.location ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR is_admin OR is_friend OR is_extended_network OR is_any_network 
      THEN p.occupation ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR is_admin OR is_friend OR is_extended_network OR is_any_network 
      THEN p.bio ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR is_admin OR is_friend OR is_extended_network OR is_any_network 
      THEN p.interests ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR is_admin OR is_friend OR is_extended_network OR is_any_network 
      THEN p.expertise_domains ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR is_admin OR is_friend OR is_extended_network OR is_any_network 
      THEN p.expertise_cities ELSE NULL END,
    p.user_type::text,
    relationship_type::text
  FROM profiles p
  WHERE p.id = target_uuid
  AND (
    auth.uid() = p.id OR is_admin OR is_friend OR is_extended_network 
    OR is_any_network OR has_pending_request OR p.is_verified = true
  );
END;
$$;


--
-- Name: get_third_plus_network(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_third_plus_network(viewer_id uuid, max_depth integer DEFAULT 6) RETURNS TABLE(profile_id uuid, full_name text, handle text, network_degree integer, connection_path text[])
    LANGUAGE sql SECURITY DEFINER
    AS $$
  WITH RECURSIVE
  network_graph(uid, hop, path) AS (
    SELECT
      CASE WHEN f.user1_id = viewer_id THEN f.user2_id ELSE f.user1_id END,
      1,
      ARRAY[viewer_id, CASE WHEN f.user1_id = viewer_id THEN f.user2_id ELSE f.user1_id END]
    FROM friendships f
    WHERE f.user1_id = viewer_id OR f.user2_id = viewer_id

    UNION

    SELECT
      CASE WHEN f.user1_id = ng.uid THEN f.user2_id ELSE f.user1_id END,
      ng.hop + 1,
      ng.path || CASE WHEN f.user1_id = ng.uid THEN f.user2_id ELSE f.user1_id END
    FROM network_graph ng
    JOIN friendships f ON f.user1_id = ng.uid OR f.user2_id = ng.uid
    WHERE ng.hop < max_depth
      AND (CASE WHEN f.user1_id = ng.uid THEN f.user2_id ELSE f.user1_id END) != ALL(ng.path)
  ),
  shortest_paths AS (
    SELECT DISTINCT ON (uid) uid, hop, path
    FROM network_graph
    WHERE uid != viewer_id
    ORDER BY uid, hop ASC
  )
  SELECT
    sp.uid,
    p.full_name,
    p.handle,
    sp.hop,
    ARRAY(
      SELECT prof.full_name
      FROM unnest(sp.path) WITH ORDINALITY AS t(pid, ord)
      JOIN profiles prof ON prof.id = t.pid
      ORDER BY ord
    )
  FROM shortest_paths sp
  JOIN profiles p ON p.id = sp.uid
  WHERE p.user_type = 'verified'
    AND sp.hop >= 3  -- Only return people whose SHORTEST path is 3+
  ORDER BY sp.hop ASC, p.full_name ASC;
$$;


--
-- Name: handle_user_signup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_user_signup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  generated_handle TEXT;
  handle_exists BOOLEAN;
  user_phone TEXT;
  user_full_name TEXT;
  requested_user_type public.user_type;
  final_user_type public.user_type;
  trusted_share_signup BOOLEAN := false;
  final_is_verified BOOLEAN := false;
  final_verification_status public.verification_status := 'pending'::public.verification_status;
  adjectives TEXT[] := ARRAY[
    'sunset','moonlight','crystal','shadow','golden','silver','bright','misty',
    'gentle','swift','quiet','wild','calm','bold','wise','brave','clever',
    'nimble','sleepy','happy','cosmic','electric','velvet','jade','amber',
    'ruby','azure','frost','storm','dawn','dusk','stellar','lunar','solar',
    'crimson','violet','emerald','sapphire','ocean','forest','mountain',
    'river','breeze','thunder','whisper','echo','dream','starlight','aurora',
    'mystic','phantom','marble','bronze','pearl','coral','ivory','obsidian',
    'quartz','topaz','garnet','opal','diamond','platinum','copper','steel',
    'iron','silk','satin','linen','cotton','wool','cashmere','velour',
    'midnight','twilight','sunrise','daybreak','evening','morning','noon',
    'zenith','horizon','celestial','ethereal','radiant','luminous','glowing',
    'shimmering','sparkling','gleaming','blazing','flaming','frozen','arctic',
    'tropical','alpine','coastal','desert','prairie','tundra','savanna'
  ];
  animals TEXT[] := ARRAY[
    'koala','panda','raccoon','otter','fox','wolf','bear','eagle','hawk',
    'owl','raven','sparrow','dolphin','whale','shark','tiger','lion','leopard',
    'cheetah','lynx','deer','elk','moose','rabbit','squirrel','badger',
    'beaver','seal','walrus','penguin','falcon','phoenix','dragon','serpent',
    'tortoise','gecko','cobra','python','jaguar','panther','gazelle','antelope',
    'flamingo','crane','heron','pelican','albatross','condor','vulture',
    'peacock','swan','duck','goose','turkey','crow','magpie','jay','finch',
    'cardinal','robin','wren','thrush','warbler','lark','nightingale','swallow',
    'swift','parrot','macaw','cockatoo','budgie','canary','pigeon','dove',
    'quail','pheasant','grouse','stork','ibis','egret','kingfisher',
    'woodpecker','hummingbird','toucan','hornbill','kiwi','emu','ostrich',
    'rhea','cassowary','kestrel','merlin','harrier','buzzard','kite',
    'osprey','puffin','wombat','platypus','lemur','meerkat','mongoose'
  ];
BEGIN
  user_phone := NEW.raw_user_meta_data->>'phone_number';
  user_full_name := NEW.raw_user_meta_data->>'full_name';
  requested_user_type := COALESCE(NEW.raw_user_meta_data->>'user_type', 'guest')::public.user_type;
  trusted_share_signup := COALESCE((NEW.raw_user_meta_data->>'is_share_signup')::boolean, false);

  final_user_type := CASE WHEN trusted_share_signup THEN 'verified'::public.user_type ELSE requested_user_type END;
  
  -- is_verified should match user_type = 'verified', not just share signups
  final_is_verified := (final_user_type = 'verified'::public.user_type);
  
  final_verification_status := CASE
    WHEN final_user_type = 'verified'::public.user_type THEN 'verified'::public.verification_status
    ELSE 'pending'::public.verification_status
  END;

  LOOP
    generated_handle := adjectives[1 + floor(random() * array_length(adjectives, 1))]
      || '_'
      || animals[1 + floor(random() * array_length(animals, 1))]
      || (10 + floor(random() * 90))::text;
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE handle = generated_handle) INTO handle_exists;
    EXIT WHEN NOT handle_exists;
  END LOOP;

  INSERT INTO public.profiles (
    id, handle, phone_number, full_name, user_type,
    is_verified, verification_status, trial_ends_at
  )
  VALUES (
    NEW.id, generated_handle, user_phone, user_full_name, final_user_type,
    final_is_verified, final_verification_status,
    CASE WHEN final_user_type = 'verified'::public.user_type
      THEN now() + interval '2 months' ELSE NULL END
  );

  RETURN NEW;
END;
$$;


--
-- Name: has_fyp_unread(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_fyp_unread() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.request_anonymous_impressions i
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE i.recipient_id = auth.uid()
      AND (p.last_for_you_visit IS NULL OR i.surfaced_at > p.last_for_you_visit)
  );
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: hash_contact_info(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hash_contact_info(contact_value text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  RETURN encode(extensions.digest(contact_value, 'sha256'), 'hex');
END;
$$;


--
-- Name: increment_master_directory_search_count(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_master_directory_search_count(entry_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE master_directory_entries 
  SET 
    total_search_count = total_search_count + 1,
    updated_at = now()
  WHERE id = ANY(entry_ids);
END;
$$;


--
-- Name: increment_search_count(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_search_count(entry_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE directory_entries 
  SET search_count = search_count + 1 
  WHERE id = ANY(entry_ids);
END;
$$;


--
-- Name: is_group_creator(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_creator(group_id uuid, user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM groups g 
    WHERE g.id = group_id AND g.creator_id = user_id
  )
$$;


--
-- Name: is_group_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_member(group_id uuid, user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members gm 
    WHERE gm.group_id = group_id AND gm.user_id = user_id
  )
$$;


--
-- Name: is_in_network(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_in_network(viewer_id uuid, profile_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  is_direct_friend BOOLEAN;
  is_extended BOOLEAN;
  target_uuid UUID := profile_id;
BEGIN
  IF viewer_id = target_uuid THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM friendships f
    WHERE (f.user1_id = viewer_id AND f.user2_id = target_uuid)
       OR (f.user2_id = viewer_id AND f.user1_id = target_uuid)
  ) INTO is_direct_friend;

  IF is_direct_friend THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM get_extended_network(viewer_id) en
    WHERE en.profile_id = target_uuid
  ) INTO is_extended;

  RETURN is_extended;
END;
$$;


--
-- Name: log_contact_access(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_contact_access(action_type text, contact_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO contact_access_logs (user_id, action, contact_id, created_at)
  VALUES (auth.uid(), action_type, contact_id, now());
END;
$$;


--
-- Name: log_contact_access_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_contact_access_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Log all contact access attempts (only for authenticated users)
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.log_contact_access(
      CASE 
        WHEN TG_OP = 'SELECT' THEN 'VIEW_CONTACT'
        WHEN TG_OP = 'INSERT' THEN 'CREATE_CONTACT'
        WHEN TG_OP = 'UPDATE' THEN 'UPDATE_CONTACT'
        WHEN TG_OP = 'DELETE' THEN 'DELETE_CONTACT'
        ELSE 'UNKNOWN_CONTACT_OPERATION'
      END,
      COALESCE(NEW.id, OLD.id)
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: mark_anonymous_impression_responded(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_anonymous_impression_responded() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.request_anonymous_impressions
  SET responded = true
  WHERE request_id = NEW.request_id AND recipient_id = NEW.responder_id;
  RETURN NEW;
END;
$$;


--
-- Name: mark_for_you_visited(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_for_you_visited() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.profiles SET last_for_you_visit = now() WHERE id = auth.uid();
$$;


--
-- Name: match_contact_on_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_contact_on_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  matching_profile RECORD;
  normalized_contact_phone TEXT;
BEGIN
  -- Only proceed if contact has a phone number
  IF NEW.contact_phone IS NOT NULL AND NEW.contact_phone != '' THEN
    
    -- Normalize the contact phone for matching
    normalized_contact_phone := public.normalize_phone_number(NEW.contact_phone);
    
    -- Find profile with matching phone number (excluding the contact owner)
    SELECT p.id, p.full_name, p.handle, p.phone_number
    INTO matching_profile
    FROM profiles p
    WHERE public.normalize_phone_number(p.phone_number) = normalized_contact_phone
    AND p.id != NEW.user_id  -- Don't match with self
    AND p.full_name IS NOT NULL 
    AND p.handle IS NOT NULL
    LIMIT 1;
    
    -- If match found, update the contact record
    IF matching_profile.id IS NOT NULL THEN
      NEW.is_matched := true;
      NEW.matched_user_id := matching_profile.id;
      
      RAISE NOTICE 'Contact matched: contact_phone=%, normalized=%, matched_user_id=%', 
        NEW.contact_phone, normalized_contact_phone, matching_profile.id;
    ELSE
      NEW.is_matched := false;
      NEW.matched_user_id := NULL;
      
      RAISE NOTICE 'No match found for contact_phone=%, normalized=%', 
        NEW.contact_phone, normalized_contact_phone;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: match_contacts_by_phone(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_contacts_by_phone(user_id_input uuid) RETURNS TABLE(contact_id uuid, matched_user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ci.id as contact_id,
    p.id as matched_user_id
  FROM contact_imports ci
  CROSS JOIN profiles p
  WHERE ci.user_id = user_id_input
    AND ci.matched_user_id IS NULL
    AND ci.contact_phone IS NOT NULL
    AND p.id != user_id_input
    AND p.phone_number IS NOT NULL
    AND RIGHT(REGEXP_REPLACE(ci.contact_phone, '[^0-9]', '', 'g'), 10) = 
        RIGHT(REGEXP_REPLACE(p.phone_number, '[^0-9]', '', 'g'), 10);
END;
$$;


--
-- Name: match_new_user_to_contacts(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_new_user_to_contacts(new_user_id uuid, new_user_phone text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  match_count INTEGER := 0;
BEGIN
  -- When a new user signs up or updates their phone, find all contacts that have their phone number
  UPDATE contact_imports ci
  SET 
    matched_user_id = new_user_id,
    is_matched = true,
    updated_at = NOW()
  WHERE ci.matched_user_id IS NULL
    AND ci.contact_phone IS NOT NULL
    AND RIGHT(REGEXP_REPLACE(ci.contact_phone, '[^0-9]', '', 'g'), 10) = 
        RIGHT(REGEXP_REPLACE(new_user_phone, '[^0-9]', '', 'g'), 10);
  
  GET DIAGNOSTICS match_count = ROW_COUNT;
  RETURN match_count;
END;
$$;


--
-- Name: matches_anonymous_expertise(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.matches_anonymous_expertise(p_uid uuid, p_request_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: normalize_contact_phone(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_contact_phone() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.contact_phone IS NOT NULL AND NEW.contact_phone != '' THEN
    NEW.contact_phone := public.normalize_phone_number(NEW.contact_phone);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: normalize_directory_text(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_directory_text(input text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  RETURN lower(regexp_replace(trim(input), '\s+', ' ', 'g'));
END;
$$;


--
-- Name: normalize_for_canonical(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_for_canonical(input text) RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF input IS NULL OR trim(input) = '' THEN RETURN ''; END IF;
  RETURN lower(trim(regexp_replace(input, '\s+', '_', 'g')));
END;
$$;


--
-- Name: normalize_phone_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_phone_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
BEGIN
  IF NEW.contact_phone IS NOT NULL AND NEW.contact_phone != '' THEN
    NEW.contact_phone := CASE 
      WHEN NEW.contact_phone ~ '^\+' THEN NEW.contact_phone
      WHEN NEW.contact_phone ~ '^91' THEN '+' || NEW.contact_phone
      WHEN NEW.contact_phone ~ '^[0-9]{10}$' THEN '+91' || NEW.contact_phone
      ELSE '+91' || REGEXP_REPLACE(NEW.contact_phone, '[^0-9]', '', 'g')
    END;
  END IF;
  RETURN NEW;
END;
$_$;


--
-- Name: normalize_phone_number(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_phone_number(phone_input text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
BEGIN
  IF phone_input IS NULL OR phone_input = '' THEN
    RETURN NULL;
  END IF;
  
  -- AGGRESSIVE NORMALIZATION: Remove ALL non-digit characters except +
  phone_input := REGEXP_REPLACE(phone_input, '[^0-9+]', '', 'g');
  
  -- Remove ALL leading zeros
  phone_input := REGEXP_REPLACE(phone_input, '^0+', '');
  
  -- If already has +, ensure format is correct
  IF phone_input LIKE '+%' THEN
    phone_input := '+' || REGEXP_REPLACE(SUBSTRING(phone_input FROM 2), '[^0-9]', '', 'g');
  ELSE
    -- No + prefix, add country code logic
    IF phone_input LIKE '91%' AND LENGTH(phone_input) = 12 THEN
      phone_input := '+' || phone_input;
    ELSIF LENGTH(phone_input) = 10 THEN
      phone_input := '+91' || phone_input;
    ELSIF LENGTH(phone_input) = 11 AND phone_input LIKE '1%' THEN
      phone_input := '+' || phone_input;
    ELSE
      phone_input := '+' || phone_input;
    END IF;
  END IF;
  
  -- Final cleanup
  phone_input := REGEXP_REPLACE(phone_input, '[^0-9+]', '', 'g');
  
  RETURN phone_input;
END;
$$;


--
-- Name: normalize_profile_handle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_profile_handle() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.handle is not null then
    new.handle := lower(new.handle);
  end if;
  return new;
end;
$$;


--
-- Name: normalize_profile_phone(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_profile_phone() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.phone_number IS NOT NULL AND NEW.phone_number != '' THEN
    NEW.phone_number := public.normalize_phone_number(NEW.phone_number);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: normalize_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_token(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
  SELECT CASE
    WHEN t IS NULL THEN NULL
    ELSE
      regexp_replace(
        -- strip trailing plural 's' / 'es' (dental, dentist, dentists -> denti...)
        regexp_replace(lower(trim(t)), '(es|s)$', '', 'g'),
        '[^a-z0-9]+', ' ', 'g'
      )
  END
$_$;


--
-- Name: notify_fyp_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_fyp_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, metadata)
  VALUES (
    NEW.recipient_id,
    'fyp_request',
    'A question you might know the answer to',
    'Someone in the Antelog network has asked something that matches your expertise. Take a look.',
    jsonb_build_object('link', '/for-you')
  );
  RETURN NEW;
END;
$$;


--
-- Name: notify_guest_contribution(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_guest_contribution() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_creator uuid; v_title text; v_name text;
begin
  select creator_id, title into v_creator, v_title from requests where id = NEW.request_id;
  if v_creator is null then return NEW; end if;
  v_name := coalesce(nullif(trim(NEW.contributor_name), ''), 'Someone');
  insert into notifications (user_id, type, title, message, is_read, metadata)
  values (v_creator, 'request_response',
          v_name || ' responded to your request', v_title, false,
          jsonb_build_object('request_id', NEW.request_id, 'guest', true, 'anonymous', false));
  return NEW;
end; $$;


--
-- Name: notify_recommendation_vote(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_recommendation_vote() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_rec_text TEXT;
  v_responder_id UUID;
  v_response_id UUID;
  v_request_id UUID;
  v_creator_id UUID;
  v_request_title TEXT;
  v_voter_handle TEXT;
BEGIN
  -- 1. Get recommendation info
  SELECT rr.recommendation_text, rr.response_id, resp.responder_id
  INTO v_rec_text, v_response_id, v_responder_id
  FROM response_recommendations rr
  JOIN request_responses resp ON resp.id = rr.response_id
  WHERE rr.id = NEW.recommendation_id;

  IF v_response_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Get request info
  SELECT r.id, r.creator_id, r.title
  INTO v_request_id, v_creator_id, v_request_title
  FROM requests r
  JOIN request_responses resp ON resp.request_id = r.id
  WHERE resp.id = v_response_id;

  -- 3. Get voter handle
  SELECT handle INTO v_voter_handle FROM profiles WHERE id = NEW.user_id;

  -- 4. Notify recommender (skip self-vote)
  IF v_responder_id IS NOT NULL AND NEW.user_id != v_responder_id THEN
    INSERT INTO notifications (user_id, type, title, message, related_user_id, metadata)
    VALUES (
      v_responder_id,
      'recommendation_voted',
      'Your recommendation was upvoted',
      COALESCE(v_voter_handle, 'Someone') || ' upvoted your recommendation "' || left(v_rec_text, 50) || '" in request "' || left(v_request_title, 50) || '"',
      NEW.user_id,
      jsonb_build_object('request_id', v_request_id)
    );
  END IF;

  -- 5. Notify requester (skip if voter=requester or requester=recommender to avoid duplicate)
  IF v_creator_id IS NOT NULL
     AND NEW.user_id != v_creator_id
     AND v_creator_id != v_responder_id THEN
    INSERT INTO notifications (user_id, type, title, message, related_user_id, metadata)
    VALUES (
      v_creator_id,
      'recommendation_voted',
      'Vote on your request',
      'Someone voted on a response to your request "' || left(v_request_title, 50) || '"',
      NEW.user_id,
      jsonb_build_object('request_id', v_request_id)
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: refresh_contact_matches(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_contact_matches(user_id_param uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  contact_record RECORD;
  profile_record RECORD;
  matches_found INTEGER := 0;
  contacts_processed INTEGER := 0;
  normalized_contact_phone TEXT;
  normalized_profile_phone TEXT;
  target_user_id UUID;
BEGIN
  -- Use provided user_id or fall back to auth.uid()
  target_user_id := COALESCE(user_id_param, auth.uid());
  
  -- Validate authenticated user
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Starting contact matching for user: %', target_user_id;
  RAISE NOTICE '========================================';
  
  -- Process each contact for the user
  FOR contact_record IN 
    SELECT id, user_id, contact_name, contact_phone, is_matched, matched_user_id
    FROM contact_imports
    WHERE user_id = target_user_id
    AND contact_phone IS NOT NULL
    AND contact_phone != ''
  LOOP
    contacts_processed := contacts_processed + 1;
    
    -- Normalize the contact phone
    normalized_contact_phone := public.normalize_phone_number(contact_record.contact_phone);
    
    RAISE NOTICE '----------------------------------------';
    RAISE NOTICE 'Checking contact: "%"', contact_record.contact_name;
    RAISE NOTICE '  Original phone: %', contact_record.contact_phone;
    RAISE NOTICE '  Normalized phone: %', normalized_contact_phone;
    RAISE NOTICE '  Currently matched: %', contact_record.is_matched;
    RAISE NOTICE '  Current matched_user_id: %', contact_record.matched_user_id;
    
    -- Try to find matching profile
    -- FIXED: Removed full_name requirement - match based on phone number alone
    FOR profile_record IN
      SELECT p.id, p.phone_number, p.handle, p.full_name
      FROM profiles p
      WHERE p.phone_number IS NOT NULL
      AND p.id != target_user_id  -- Don't match with self
      AND p.handle IS NOT NULL    -- Must have handle to be a real user
      ORDER BY p.handle
    LOOP
      -- Normalize profile phone
      normalized_profile_phone := public.normalize_phone_number(profile_record.phone_number);
      
      RAISE NOTICE '  Comparing with profile: @% (%)', profile_record.handle, COALESCE(profile_record.full_name, 'no name set');
      RAISE NOTICE '    Profile ID: %', profile_record.id;
      RAISE NOTICE '    Profile original phone: %', profile_record.phone_number;
      RAISE NOTICE '    Profile normalized phone: %', normalized_profile_phone;
      RAISE NOTICE '    Comparison: "%" = "%" ? %', 
        normalized_contact_phone, 
        normalized_profile_phone, 
        (normalized_contact_phone = normalized_profile_phone);
      
      -- Check if phones match
      IF normalized_contact_phone = normalized_profile_phone THEN
        RAISE NOTICE '  ✓ MATCH FOUND! Contact "%" matches profile @% (ID: %)', 
          contact_record.contact_name, profile_record.handle, profile_record.id;
        
        -- Update contact with match
        UPDATE contact_imports
        SET is_matched = true,
            matched_user_id = profile_record.id,
            updated_at = now()
        WHERE id = contact_record.id;
        
        RAISE NOTICE '  Database updated: is_matched=true, matched_user_id=%', profile_record.id;
        
        matches_found := matches_found + 1;
        EXIT; -- Found match, stop checking other profiles
      END IF;
    END LOOP;
    
    -- If no match found and was previously matched, clear it
    IF NOT FOUND AND contact_record.is_matched THEN
      RAISE NOTICE '  ✗ No match found, clearing previous match for: %', contact_record.contact_name;
      
      UPDATE contact_imports
      SET is_matched = false,
          matched_user_id = NULL,
          updated_at = now()
      WHERE id = contact_record.id;
      
      RAISE NOTICE '  Database updated: is_matched=false, matched_user_id=NULL';
    ELSIF NOT FOUND THEN
      RAISE NOTICE '  ✗ No match found for: %', contact_record.contact_name;
    END IF;
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Contact matching complete';
  RAISE NOTICE '  Contacts processed: %', contacts_processed;
  RAISE NOTICE '  Matches found: %', matches_found;
  RAISE NOTICE '========================================';
  
  RETURN json_build_object(
    'success', true,
    'contacts_processed', contacts_processed,
    'matches_found', matches_found
  );
END;
$$;


--
-- Name: refresh_master_directory(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_master_directory() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Clear existing entries
  TRUNCATE master_directory_entries;
  
  -- Insert aggregated data INCLUDING searchable_text
  INSERT INTO master_directory_entries (
    normalized_content,
    display_content,
    category,
    url,
    mention_count,
    mentioned_by_users,
    latest_mention_at,
    total_search_count,
    searchable_text
  )
  SELECT 
    normalized_content,
    display_content,
    category,
    url,
    mention_count,
    mentioned_by_users,
    latest_mention_at,
    total_search_count,
    searchable_text
  FROM master_directory_view;
END;
$$;


--
-- Name: refresh_master_directory_on_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_master_directory_on_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Schedule refresh (in practice, you might want to debounce this)
  PERFORM public.refresh_master_directory();
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: reject_closed_request_contributions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_closed_request_contributions() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  req_status TEXT;
  req_expires TIMESTAMPTZ;
BEGIN
  SELECT status::text, expires_at INTO req_status, req_expires
  FROM requests WHERE id = NEW.request_id;

  IF req_status IS NULL THEN
    RAISE EXCEPTION 'Request % not found', NEW.request_id;
  END IF;

  IF req_status != 'open' THEN
    RAISE EXCEPTION 'Request is % and no longer accepting responses', req_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF req_expires IS NOT NULL AND req_expires < NOW() THEN
    RAISE EXCEPTION 'Request has expired and is no longer accepting responses'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: request_is_exhausted(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_is_exhausted(p_request_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: request_response_threshold(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_response_threshold(p_category text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  -- v1 heuristic: single threshold; future: per-category, overlap-aware, usefulness-aware
  SELECT 12;
$$;


--
-- Name: resolve_preferred_term(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_preferred_term(input text) RETURNS TABLE(preferred_term text, plural_term text, category_group text)
    LANGUAGE plpgsql
    AS $$
DECLARE normalized TEXT;
BEGIN
  normalized := lower(trim(input));
  RETURN QUERY
  SELECT pt.preferred_term, pt.plural_term, pt.category_group
  FROM directory_preferred_terms pt
  WHERE pt.preferred_term = normalized LIMIT 1;
  IF FOUND THEN RETURN; END IF;
  RETURN QUERY
  SELECT pt.preferred_term, pt.plural_term, pt.category_group
  FROM directory_preferred_terms pt
  WHERE pt.aliases @> to_jsonb(normalized) LIMIT 1;
END;
$$;


--
-- Name: search_directory_pool_items(uuid, text, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_directory_pool_items(p_list_id uuid, p_query text, p_threshold double precision DEFAULT 0.3) RETURNS TABLE(id uuid, item_name text, vote_count integer, similarity_score double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mdi.id,
    mdi.item_name,
    mdi.vote_count,
    similarity(mdi.item_name_normalized, normalize_directory_text(p_query))::FLOAT as similarity_score
  FROM master_directory_items mdi
  WHERE mdi.list_id = p_list_id
    AND similarity(mdi.item_name_normalized, normalize_directory_text(p_query)) > p_threshold
  ORDER BY similarity_score DESC
  LIMIT 5;
END;
$$;


--
-- Name: search_similar_recommendations(text, uuid, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_similar_recommendations(search_term text, req_id uuid, similarity_threshold double precision DEFAULT 0.4) RETURNS TABLE(id uuid, recommendation_text text, vote_count integer, similarity_score double precision)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rr.id,
    rr.recommendation_text,
    rr.vote_count,
    similarity(rr.recommendation_text_normalized, search_term)::FLOAT as similarity_score
  FROM response_recommendations rr
  JOIN request_responses resp ON rr.response_id = resp.id
  WHERE resp.request_id = req_id
    AND similarity(rr.recommendation_text_normalized, search_term) > similarity_threshold
  ORDER BY similarity_score DESC
  LIMIT 5;
END;
$$;


--
-- Name: share_link_matches(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.share_link_matches(p_link_id uuid, p_request_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.share_links sl
    WHERE sl.id = p_link_id AND sl.request_id = p_request_id
  );
$$;


--
-- Name: sync_directory_list_edits(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_directory_list_edits(p_list_id uuid, p_new_title text, p_new_category text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_directory_list_id uuid;
  v_owner_id uuid;
BEGIN
  -- Get the list's directory_list_id and owner
  SELECT directory_list_id, owner_id INTO v_directory_list_id, v_owner_id
  FROM lists
  WHERE id = p_list_id;

  -- Verify the caller owns this list
  IF v_owner_id IS NULL OR v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to edit this list';
  END IF;

  -- Only sync if published to directory
  IF v_directory_list_id IS NULL THEN
    RETURN;
  END IF;

  -- Update master_directory_lists
  UPDATE master_directory_lists
  SET 
    title = p_new_title,
    title_normalized = lower(regexp_replace(trim(p_new_title), '\s+', ' ', 'g')),
    category = p_new_category,
    updated_at = now()
  WHERE id = v_directory_list_id;
END;
$$;


--
-- Name: sync_is_verified_with_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_is_verified_with_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.is_verified := COALESCE(NEW.verification_status = 'verified', FALSE);
  RETURN NEW;
END;
$$;


--
-- Name: tokenize_text(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tokenize_text(t text) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
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


--
-- Name: update_directory_item_vote_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_directory_item_vote_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE master_directory_items
  SET vote_count = vote_count + 1
  WHERE id = NEW.item_id;

  UPDATE master_directory_lists
  SET 
    total_votes = total_votes + 1,
    contributor_count = (
      SELECT COUNT(DISTINCT mdv.user_id) 
      FROM master_directory_votes mdv
      JOIN master_directory_items mdi ON mdv.item_id = mdi.id
      WHERE mdi.list_id = (SELECT list_id FROM master_directory_items WHERE id = NEW.item_id)
    ),
    updated_at = NOW()
  WHERE id = (SELECT list_id FROM master_directory_items WHERE id = NEW.item_id);

  RETURN NEW;
END;
$$;


--
-- Name: update_guest_recommendation_merge(uuid, text, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_guest_recommendation_merge(_guest_contribution_id uuid, _recommendation_id text, _vote_count integer, _merged_into_id text DEFAULT NULL::text, _merged_into_text text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE guest_contributions
  SET recommendations = (
    SELECT jsonb_agg(
      CASE
        WHEN (item->>'id') = _recommendation_id THEN
          jsonb_build_object(
            'id', item->>'id',
            'text', item->>'text',
            'link', item->'link',
            'reason', item->>'reason',
            'position', (item->>'position')::int,
            'vote_count', _vote_count,
            'merged_into_id', _merged_into_id,
            'merged_into_text', _merged_into_text
          )
        ELSE item
      END
    )
    FROM jsonb_array_elements(recommendations) AS item
    WHERE item IS NOT NULL AND item != 'null'::jsonb
  )
  WHERE id = _guest_contribution_id;
END;
$$;


--
-- Name: update_matched_contacts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_matched_contacts(user_id_input uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  match_count INTEGER := 0;
BEGIN
  -- Update contact_imports with matched users
  WITH matches AS (
    SELECT * FROM match_contacts_by_phone(user_id_input)
  )
  UPDATE contact_imports ci
  SET 
    matched_user_id = m.matched_user_id,
    is_matched = true,
    updated_at = NOW()
  FROM matches m
  WHERE ci.id = m.contact_id;
  
  GET DIAGNOSTICS match_count = ROW_COUNT;
  RETURN match_count;
END;
$$;


--
-- Name: update_recommendation_vote_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_recommendation_vote_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE response_recommendations
    SET vote_count = vote_count + 1
    WHERE id = NEW.recommendation_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE response_recommendations
    SET vote_count = vote_count - 1
    WHERE id = OLD.recommendation_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: user_expertise_tokens(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_expertise_tokens(p_uid uuid) RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: user_in_direct_audience(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_in_direct_audience(p_uid uuid, p_request_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: user_location_tokens(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_location_tokens(p_uid uuid) RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: validate_authenticated_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_authenticated_user() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Operation requires authentication';
  END IF;
  RETURN true;
END;
$$;


--
-- Name: validate_contact_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_contact_data() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
BEGIN
  -- Validate contact data before insertion
  
  -- Ensure user_id is set and matches auth.uid()
  IF NEW.user_id IS NULL OR NEW.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Invalid user_id for contact import';
  END IF;
  
  -- Sanitize contact name (remove potentially dangerous characters)
  IF NEW.contact_name IS NOT NULL THEN
    NEW.contact_name := regexp_replace(NEW.contact_name, '[<>&"'']', '', 'g');
    NEW.contact_name := trim(NEW.contact_name);
  END IF;
  
  -- Validate email format if provided
  IF NEW.contact_email IS NOT NULL AND NEW.contact_email != '' THEN
    IF NEW.contact_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'Invalid email format';
    END IF;
  END IF;
  
  -- Validate phone format if provided
  IF NEW.contact_phone IS NOT NULL AND NEW.contact_phone != '' THEN
    -- Allow only digits, +, -, spaces, and parentheses
    NEW.contact_phone := regexp_replace(NEW.contact_phone, '[^0-9+\-\s()]', '', 'g');
  END IF;
  
  RETURN NEW;
END;
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: anonymous_handles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anonymous_handles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    anonymous_handle text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    handle text NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    trial_ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_status public.verification_status DEFAULT 'pending'::public.verification_status NOT NULL,
    phone_number text,
    user_type public.user_type DEFAULT 'verified'::public.user_type NOT NULL,
    location text,
    bio text,
    interests jsonb,
    expertise_domains jsonb DEFAULT '[]'::jsonb,
    expertise_cities jsonb DEFAULT '[]'::jsonb,
    occupation text,
    questionnaire_completed boolean DEFAULT false,
    questionnaire_completed_at timestamp with time zone,
    last_for_you_visit timestamp with time zone,
    CONSTRAINT ck_profiles_handle_format CHECK ((handle ~ '^[a-z0-9_]{3,20}$'::text))
);


--
-- Name: TABLE profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profiles IS '⚠️ RLS DISABLED FOR MVP TESTING - RE-ENABLE BEFORE PRODUCTION';


--
-- Name: recommendation_clusters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendation_clusters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    canonical_text text NOT NULL,
    recommendation_ids text[] DEFAULT '{}'::uuid[] NOT NULL,
    total_votes integer DEFAULT 0,
    mention_count integer DEFAULT 0,
    similarity_score numeric(3,2),
    cluster_method text DEFAULT 'fuzzy_match'::text,
    status text DEFAULT 'pending'::text,
    "position" integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT recommendation_clusters_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'split'::text])))
);


--
-- Name: request_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    responder_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    overall_notes text
);


--
-- Name: response_recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.response_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    response_id uuid NOT NULL,
    recommendation_text text NOT NULL,
    recommendation_text_normalized text NOT NULL,
    "position" integer NOT NULL,
    quick_details text,
    reason text NOT NULL,
    link text,
    vote_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    merged_into_id uuid,
    merged_away boolean DEFAULT false
);


--
-- Name: cluster_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.cluster_details AS
 SELECT id AS cluster_id,
    request_id,
    canonical_text,
    total_votes,
    mention_count,
    similarity_score,
    status,
    "position",
    ( SELECT json_agg(json_build_object('id', rr.id, 'text', rr.recommendation_text, 'votes', rr.vote_count, 'contributor', COALESCE(p.full_name, 'Anonymous'::text))) AS json_agg
           FROM (((unnest(rc.recommendation_ids) rec_id(rec_id)
             LEFT JOIN public.response_recommendations rr ON (((rr.id)::text = rec_id.rec_id)))
             LEFT JOIN public.request_responses resp ON ((resp.id = rr.response_id)))
             LEFT JOIN public.profiles p ON ((p.id = resp.responder_id)))) AS variations
   FROM public.recommendation_clusters rc;


--
-- Name: colleges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.colleges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_access_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_access_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action text NOT NULL,
    contact_id uuid,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: contact_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    contact_name text NOT NULL,
    contact_phone text,
    contact_email text,
    import_source text DEFAULT 'manual'::text NOT NULL,
    is_matched boolean DEFAULT false NOT NULL,
    matched_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    consent_given boolean DEFAULT false,
    consent_timestamp timestamp with time zone,
    encrypted_phone text,
    encrypted_email text,
    data_retention_expires_at timestamp with time zone DEFAULT (now() + '1 year'::interval)
);


--
-- Name: directory_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directory_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content text NOT NULL,
    category public.list_category NOT NULL,
    url text,
    contributor_id uuid NOT NULL,
    list_id uuid NOT NULL,
    list_item_id uuid NOT NULL,
    search_count integer DEFAULT 0 NOT NULL,
    vote_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: directory_preferred_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directory_preferred_terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    preferred_term text NOT NULL,
    plural_term text NOT NULL,
    category_group text NOT NULL,
    aliases jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: directory_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directory_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    voter_id uuid NOT NULL,
    vote_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT directory_votes_vote_type_check CHECK ((vote_type = ANY (ARRAY['upvote'::text, 'downvote'::text])))
);


--
-- Name: friend_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid NOT NULL,
    addressee_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT friend_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])))
);


--
-- Name: friend_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    suggested_user_id uuid NOT NULL,
    match_type text NOT NULL,
    match_value text NOT NULL,
    is_dismissed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT friend_suggestions_match_type_check CHECK ((match_type = ANY (ARRAY['phone'::text, 'email'::text])))
);


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friendships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user1_id uuid NOT NULL,
    user2_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT friendships_check CHECK ((user1_id <> user2_id))
);


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: guest_contributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_contributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid,
    share_link_id uuid,
    contributor_name text NOT NULL,
    contributor_contact text,
    recommendations jsonb DEFAULT '[]'::jsonb NOT NULL,
    invited_to_join boolean DEFAULT false,
    joined_antelog boolean DEFAULT false,
    converted_user_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: guest_recommendation_merges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_recommendation_merges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guest_contribution_id uuid,
    recommendation_position integer,
    merged_into_rec_id uuid,
    merged_into_text text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: list_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.list_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    list_id uuid NOT NULL,
    content text NOT NULL,
    url text,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vote_count integer DEFAULT 0,
    mention_count integer DEFAULT 1,
    source_recommendation_ids uuid[] DEFAULT '{}'::uuid[],
    notes text
);

ALTER TABLE ONLY public.list_items REPLICA IDENTITY FULL;


--
-- Name: lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    category public.list_category NOT NULL,
    visibility public.list_visibility DEFAULT 'private'::public.list_visibility NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_request_id uuid,
    total_votes integer DEFAULT 0,
    total_contributors integer DEFAULT 0,
    item_count integer DEFAULT 0,
    directory_list_id uuid
);

ALTER TABLE ONLY public.lists REPLICA IDENTITY FULL;


--
-- Name: COLUMN lists.source_request_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lists.source_request_id IS 'References the request if this list was created by closing/resolving a request';


--
-- Name: master_directory_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_directory_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    normalized_content text NOT NULL,
    display_content text NOT NULL,
    category public.list_category NOT NULL,
    url text,
    mention_count integer DEFAULT 0 NOT NULL,
    mentioned_by_users uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    latest_mention_at timestamp with time zone NOT NULL,
    total_search_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    searchable_text text
);


--
-- Name: master_directory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_directory_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    list_id uuid,
    item_name text NOT NULL,
    item_name_normalized text NOT NULL,
    vote_count integer DEFAULT 0,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: master_directory_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_directory_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    title_normalized text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    original_contributor_id uuid,
    contributor_count integer DEFAULT 1,
    total_votes integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    domain text,
    geography text,
    use_case text,
    hard_filter text,
    canonical_signature text,
    canonical_query text,
    facets jsonb DEFAULT '{}'::jsonb,
    category_group text,
    entity_type text,
    temporal_scope text DEFAULT 'current'::text,
    ranking_lens text DEFAULT 'best_overall'::text,
    canonical_title text,
    source_title text,
    aliases jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'live'::text,
    display_geography text,
    normalized_geography text,
    legacy_migrated boolean DEFAULT false
);


--
-- Name: master_directory_lists_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.master_directory_lists_view AS
 SELECT l.id AS list_id,
    l.title AS list_title,
    l.description AS list_description,
    l.category,
    l.owner_id,
    l.created_at,
    l.updated_at,
    p.handle AS creator_handle,
    p.full_name AS creator_name,
    ( SELECT p2.handle
           FROM (public.lists l2
             JOIN public.profiles p2 ON ((p2.id = l2.owner_id)))
          WHERE ((lower(TRIM(BOTH FROM l2.title)) = lower(TRIM(BOTH FROM l.title))) AND (l2.visibility = 'public'::public.list_visibility) AND (p2.is_verified = true))
          ORDER BY l2.created_at
         LIMIT 1) AS primary_creator_handle,
    ( SELECT (count(DISTINCT l2.owner_id))::integer AS count
           FROM (public.lists l2
             JOIN public.profiles p2 ON ((p2.id = l2.owner_id)))
          WHERE ((lower(TRIM(BOTH FROM l2.title)) = lower(TRIM(BOTH FROM l.title))) AND (l2.visibility = 'public'::public.list_visibility) AND (p2.is_verified = true))) AS contributor_count,
    ( SELECT array_agg(DISTINCT p2.handle) AS array_agg
           FROM (public.lists l2
             JOIN public.profiles p2 ON ((p2.id = l2.owner_id)))
          WHERE ((lower(TRIM(BOTH FROM l2.title)) = lower(TRIM(BOTH FROM l.title))) AND (l2.visibility = 'public'::public.list_visibility) AND (p2.is_verified = true))) AS contributor_handles,
    (count(DISTINCT li.id))::integer AS item_count,
    string_agg(DISTINCT li.content, ', '::text ORDER BY li.content) AS items_preview,
    array_agg(DISTINCT li.content ORDER BY li.content) AS items_array,
    ((((lower(l.title) || ' '::text) || COALESCE(lower(l.description), ''::text)) || ' '::text) || COALESCE(string_agg(DISTINCT lower(li.content), ' '::text), ''::text)) AS searchable_text,
    max(li.created_at) AS latest_item_at
   FROM ((public.lists l
     JOIN public.profiles p ON ((l.owner_id = p.id)))
     LEFT JOIN public.list_items li ON ((li.list_id = l.id)))
  WHERE ((l.visibility = 'public'::public.list_visibility) AND (p.is_verified = true) AND (p.user_type = 'verified'::public.user_type))
  GROUP BY l.id, l.title, l.description, l.category, l.owner_id, l.created_at, l.updated_at, p.handle, p.full_name;


--
-- Name: master_directory_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.master_directory_view AS
 SELECT lower(TRIM(BOTH FROM li.content)) AS normalized_content,
    li.content AS display_content,
    l.category,
    li.url,
    count(DISTINCT l.owner_id) AS mention_count,
    array_agg(DISTINCT l.owner_id) AS mentioned_by_users,
    max(li.created_at) AS latest_mention_at,
    COALESCE(sum(de.search_count), (0)::bigint) AS total_search_count,
    ((lower(TRIM(BOTH FROM li.content)) || ' '::text) || string_agg(DISTINCT lower(l.title), ' '::text)) AS searchable_text
   FROM (((public.list_items li
     JOIN public.lists l ON ((li.list_id = l.id)))
     JOIN public.profiles p ON ((l.owner_id = p.id)))
     LEFT JOIN public.directory_entries de ON ((li.id = de.list_item_id)))
  WHERE ((l.visibility = 'public'::public.list_visibility) AND (p.is_verified = true) AND (p.user_type = 'verified'::public.user_type))
  GROUP BY (lower(TRIM(BOTH FROM li.content))), li.content, l.category, li.url
 HAVING (count(DISTINCT l.owner_id) > 0);


--
-- Name: master_directory_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_directory_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    related_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb
);


--
-- Name: TABLE notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notifications IS '⚠️ RLS DISABLED FOR MVP TESTING - RE-ENABLE BEFORE PRODUCTION';


--
-- Name: rate_limit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recommendation_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendation_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recommendation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: request_anonymous_impressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_anonymous_impressions (
    request_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    surfaced_at timestamp with time zone DEFAULT now() NOT NULL,
    dismissed_at timestamp with time zone,
    responded boolean DEFAULT false NOT NULL
);


--
-- Name: request_forwards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_forwards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    forwarded_by_user_id uuid NOT NULL,
    forwarded_to_audience public.request_audience_type NOT NULL,
    forwarded_to_group_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    forwarded_to uuid[] DEFAULT '{}'::uuid[],
    network_depth integer DEFAULT 1,
    network_path uuid[] DEFAULT '{}'::uuid[]
);


--
-- Name: request_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    response_id uuid NOT NULL,
    voter_id uuid NOT NULL,
    vote_type public.vote_type NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    title text NOT NULL,
    category public.request_category NOT NULL,
    location text,
    audience_type public.request_audience_type NOT NULL,
    status public.request_status DEFAULT 'open'::public.request_status NOT NULL,
    group_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    forwarding_chain jsonb DEFAULT '[]'::jsonb,
    allow_forwarding boolean DEFAULT true,
    selected_users uuid[],
    audience_types text[] NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    expiry_notified boolean DEFAULT false,
    routing_signal numeric DEFAULT 0 NOT NULL,
    CONSTRAINT requests_audience_types_check CHECK ((array_length(audience_types, 1) > 0))
);


--
-- Name: TABLE requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.requests IS '⚠️ RLS DISABLED FOR MVP TESTING - RE-ENABLE BEFORE PRODUCTION';


--
-- Name: search_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    search_query text NOT NULL,
    category public.list_category,
    results_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: share_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid,
    parent_link_id uuid,
    token character varying(12) NOT NULL,
    generated_by_user_id uuid,
    generated_by_name text,
    generated_by_contact text,
    max_responses integer DEFAULT 5,
    current_responses integer DEFAULT 0,
    times_opened integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    forwarder_name text
);


--
-- Name: temp_waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.temp_waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_expertise; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_expertise (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    expertise_tags text[] DEFAULT '{}'::text[] NOT NULL,
    confidence_scores numeric[] DEFAULT '{}'::numeric[] NOT NULL,
    last_updated timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'user'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: anonymous_handles anonymous_handles_anonymous_handle_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymous_handles
    ADD CONSTRAINT anonymous_handles_anonymous_handle_key UNIQUE (anonymous_handle);


--
-- Name: anonymous_handles anonymous_handles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymous_handles
    ADD CONSTRAINT anonymous_handles_pkey PRIMARY KEY (id);


--
-- Name: anonymous_handles anonymous_handles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymous_handles
    ADD CONSTRAINT anonymous_handles_user_id_key UNIQUE (user_id);


--
-- Name: colleges colleges_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colleges
    ADD CONSTRAINT colleges_domain_key UNIQUE (domain);


--
-- Name: colleges colleges_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colleges
    ADD CONSTRAINT colleges_name_key UNIQUE (name);


--
-- Name: colleges colleges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colleges
    ADD CONSTRAINT colleges_pkey PRIMARY KEY (id);


--
-- Name: contact_access_logs contact_access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_access_logs
    ADD CONSTRAINT contact_access_logs_pkey PRIMARY KEY (id);


--
-- Name: contact_imports contact_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_imports
    ADD CONSTRAINT contact_imports_pkey PRIMARY KEY (id);


--
-- Name: directory_entries directory_entries_list_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_entries
    ADD CONSTRAINT directory_entries_list_item_id_key UNIQUE (list_item_id);


--
-- Name: directory_entries directory_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_entries
    ADD CONSTRAINT directory_entries_pkey PRIMARY KEY (id);


--
-- Name: directory_preferred_terms directory_preferred_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_preferred_terms
    ADD CONSTRAINT directory_preferred_terms_pkey PRIMARY KEY (id);


--
-- Name: directory_preferred_terms directory_preferred_terms_preferred_term_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_preferred_terms
    ADD CONSTRAINT directory_preferred_terms_preferred_term_key UNIQUE (preferred_term);


--
-- Name: directory_votes directory_votes_entry_id_voter_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_votes
    ADD CONSTRAINT directory_votes_entry_id_voter_id_key UNIQUE (entry_id, voter_id);


--
-- Name: directory_votes directory_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directory_votes
    ADD CONSTRAINT directory_votes_pkey PRIMARY KEY (id);


--
-- Name: friend_requests friend_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_pkey PRIMARY KEY (id);


--
-- Name: friend_requests friend_requests_requester_id_addressee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_requester_id_addressee_id_key UNIQUE (requester_id, addressee_id);


--
-- Name: friend_suggestions friend_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_suggestions
    ADD CONSTRAINT friend_suggestions_pkey PRIMARY KEY (id);


--
-- Name: friend_suggestions friend_suggestions_user_id_suggested_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_suggestions
    ADD CONSTRAINT friend_suggestions_user_id_suggested_user_id_key UNIQUE (user_id, suggested_user_id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_user1_id_user2_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user1_id_user2_id_key UNIQUE (user1_id, user2_id);


--
-- Name: group_members group_members_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: guest_contributions guest_contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_contributions
    ADD CONSTRAINT guest_contributions_pkey PRIMARY KEY (id);


--
-- Name: guest_recommendation_merges guest_recommendation_merges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_recommendation_merges
    ADD CONSTRAINT guest_recommendation_merges_pkey PRIMARY KEY (id);


--
-- Name: list_items list_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT list_items_pkey PRIMARY KEY (id);


--
-- Name: lists lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_pkey PRIMARY KEY (id);


--
-- Name: master_directory_entries master_directory_entries_normalized_content_category_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_directory_entries
    ADD CONSTRAINT master_directory_entries_normalized_content_category_key UNIQUE (normalized_content, category);


--
-- Name: master_directory_entries master_directory_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_directory_entries
    ADD CONSTRAINT master_directory_entries_pkey PRIMARY KEY (id);


--
-- Name: master_directory_items master_directory_items_list_id_item_name_normalized_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_directory_items
    ADD CONSTRAINT master_directory_items_list_id_item_name_normalized_key UNIQUE (list_id, item_name_normalized);


--
-- Name: master_directory_items master_directory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_directory_items
    ADD CONSTRAINT master_directory_items_pkey PRIMARY KEY (id);


--
-- Name: master_directory_lists master_directory_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_directory_lists
    ADD CONSTRAINT master_directory_lists_pkey PRIMARY KEY (id);


--
-- Name: master_directory_votes master_directory_votes_item_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_directory_votes
    ADD CONSTRAINT master_directory_votes_item_id_user_id_key UNIQUE (item_id, user_id);


--
-- Name: master_directory_votes master_directory_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_directory_votes
    ADD CONSTRAINT master_directory_votes_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_handle_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_handle_key UNIQUE (handle);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_log rate_limit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_log
    ADD CONSTRAINT rate_limit_log_pkey PRIMARY KEY (id);


--
-- Name: recommendation_clusters recommendation_clusters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_clusters
    ADD CONSTRAINT recommendation_clusters_pkey PRIMARY KEY (id);


--
-- Name: recommendation_votes recommendation_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_votes
    ADD CONSTRAINT recommendation_votes_pkey PRIMARY KEY (id);


--
-- Name: recommendation_votes recommendation_votes_recommendation_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_votes
    ADD CONSTRAINT recommendation_votes_recommendation_id_user_id_key UNIQUE (recommendation_id, user_id);


--
-- Name: request_anonymous_impressions request_anonymous_impressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_anonymous_impressions
    ADD CONSTRAINT request_anonymous_impressions_pkey PRIMARY KEY (request_id, recipient_id);


--
-- Name: request_forwards request_forwards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_forwards
    ADD CONSTRAINT request_forwards_pkey PRIMARY KEY (id);


--
-- Name: request_responses request_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_responses
    ADD CONSTRAINT request_responses_pkey PRIMARY KEY (id);


--
-- Name: request_votes request_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_votes
    ADD CONSTRAINT request_votes_pkey PRIMARY KEY (id);


--
-- Name: request_votes request_votes_response_id_voter_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_votes
    ADD CONSTRAINT request_votes_response_id_voter_id_key UNIQUE (response_id, voter_id);


--
-- Name: requests requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_pkey PRIMARY KEY (id);


--
-- Name: response_recommendations response_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_recommendations
    ADD CONSTRAINT response_recommendations_pkey PRIMARY KEY (id);


--
-- Name: search_analytics search_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_analytics
    ADD CONSTRAINT search_analytics_pkey PRIMARY KEY (id);


--
-- Name: share_links share_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_pkey PRIMARY KEY (id);


--
-- Name: share_links share_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_token_key UNIQUE (token);


--
-- Name: temp_waitlist temp_waitlist_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.temp_waitlist
    ADD CONSTRAINT temp_waitlist_email_key UNIQUE (email);


--
-- Name: temp_waitlist temp_waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.temp_waitlist
    ADD CONSTRAINT temp_waitlist_pkey PRIMARY KEY (id);


--
-- Name: user_expertise user_expertise_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_expertise
    ADD CONSTRAINT user_expertise_pkey PRIMARY KEY (id);


--
-- Name: user_expertise user_expertise_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_expertise
    ADD CONSTRAINT user_expertise_user_id_key UNIQUE (user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: idx_contact_imports_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_imports_email ON public.contact_imports USING btree (contact_email) WHERE (contact_email IS NOT NULL);


--
-- Name: idx_contact_imports_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_imports_phone ON public.contact_imports USING btree (contact_phone) WHERE (contact_phone IS NOT NULL);


--
-- Name: idx_contact_imports_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_imports_user_id ON public.contact_imports USING btree (user_id);


--
-- Name: idx_directory_entries_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_directory_entries_category ON public.directory_entries USING btree (category);


--
-- Name: idx_directory_entries_content_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_directory_entries_content_gin ON public.directory_entries USING gin (to_tsvector('english'::regconfig, content));


--
-- Name: idx_directory_entries_search_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_directory_entries_search_count ON public.directory_entries USING btree (search_count DESC);


--
-- Name: idx_directory_entries_vote_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_directory_entries_vote_count ON public.directory_entries USING btree (vote_count DESC);


--
-- Name: idx_friend_suggestions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_suggestions_user_id ON public.friend_suggestions USING btree (user_id);


--
-- Name: idx_guest_contributions_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guest_contributions_contact ON public.guest_contributions USING btree (contributor_contact);


--
-- Name: idx_guest_contributions_link; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guest_contributions_link ON public.guest_contributions USING btree (share_link_id);


--
-- Name: idx_guest_contributions_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guest_contributions_request ON public.guest_contributions USING btree (request_id);


--
-- Name: idx_list_items_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_list_items_list ON public.list_items USING btree (list_id);


--
-- Name: idx_list_items_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_list_items_position ON public.list_items USING btree (list_id, "position");


--
-- Name: idx_lists_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lists_owner ON public.lists USING btree (owner_id);


--
-- Name: idx_lists_source_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lists_source_request ON public.lists USING btree (source_request_id);


--
-- Name: idx_lists_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lists_visibility ON public.lists USING btree (visibility);


--
-- Name: idx_master_directory_canonical_signature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_master_directory_canonical_signature ON public.master_directory_lists USING btree (canonical_signature) WHERE (canonical_signature IS NOT NULL);


--
-- Name: idx_master_directory_domain_geography; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_master_directory_domain_geography ON public.master_directory_lists USING btree (domain, geography) WHERE (domain IS NOT NULL);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_rai_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rai_recipient ON public.request_anonymous_impressions USING btree (recipient_id, surfaced_at DESC);


--
-- Name: idx_rai_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rai_request ON public.request_anonymous_impressions USING btree (request_id);


--
-- Name: idx_rate_limit_log_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limit_log_lookup ON public.rate_limit_log USING btree (key, action, created_at DESC);


--
-- Name: idx_recommendation_clusters_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendation_clusters_request ON public.recommendation_clusters USING btree (request_id);


--
-- Name: idx_recommendation_clusters_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendation_clusters_status ON public.recommendation_clusters USING btree (request_id, status);


--
-- Name: idx_recommendation_votes_recommendation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendation_votes_recommendation ON public.recommendation_votes USING btree (recommendation_id);


--
-- Name: idx_recommendation_votes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommendation_votes_user ON public.recommendation_votes USING btree (user_id);


--
-- Name: idx_request_forwards_forwarded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_request_forwards_forwarded_by ON public.request_forwards USING btree (forwarded_by_user_id);


--
-- Name: idx_request_forwards_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_request_forwards_request_id ON public.request_forwards USING btree (request_id);


--
-- Name: idx_requests_audience_types; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requests_audience_types ON public.requests USING gin (audience_types);


--
-- Name: idx_requests_audience_types_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requests_audience_types_gin ON public.requests USING gin (audience_types);


--
-- Name: idx_requests_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requests_expires_at ON public.requests USING btree (expires_at) WHERE (status <> 'closed'::public.request_status);


--
-- Name: idx_requests_open_anon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requests_open_anon ON public.requests USING btree (status, expires_at) WHERE (status = 'open'::public.request_status);


--
-- Name: idx_response_recommendations_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_response_recommendations_normalized ON public.response_recommendations USING btree (recommendation_text_normalized);


--
-- Name: idx_response_recommendations_response; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_response_recommendations_response ON public.response_recommendations USING btree (response_id);


--
-- Name: idx_search_analytics_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_analytics_created_at ON public.search_analytics USING btree (created_at DESC);


--
-- Name: idx_search_analytics_query; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_analytics_query ON public.search_analytics USING btree (search_query);


--
-- Name: idx_share_links_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_links_parent ON public.share_links USING btree (parent_link_id);


--
-- Name: idx_share_links_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_links_request ON public.share_links USING btree (request_id);


--
-- Name: idx_share_links_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_links_token ON public.share_links USING btree (token);


--
-- Name: idx_temp_waitlist_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_temp_waitlist_created ON public.temp_waitlist USING btree (created_at);


--
-- Name: idx_temp_waitlist_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_temp_waitlist_email ON public.temp_waitlist USING btree (email);


--
-- Name: unique_user_request_forward; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_user_request_forward ON public.request_forwards USING btree (request_id, forwarded_by_user_id);


--
-- Name: contact_imports audit_contact_access_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_contact_access_trigger AFTER INSERT OR DELETE OR UPDATE ON public.contact_imports FOR EACH ROW EXECUTE FUNCTION public.audit_contact_access();


--
-- Name: contact_imports contact_access_audit_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contact_access_audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.contact_imports FOR EACH ROW EXECUTE FUNCTION public.log_contact_access_trigger();


--
-- Name: profiles create_anonymous_handle_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER create_anonymous_handle_trigger AFTER INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.create_anonymous_handle_for_user();


--
-- Name: contact_imports encrypt_contact_data_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER encrypt_contact_data_trigger BEFORE INSERT OR UPDATE ON public.contact_imports FOR EACH ROW EXECUTE FUNCTION public.encrypt_contact_data();


--
-- Name: contact_imports match_contact_on_insert_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER match_contact_on_insert_trigger BEFORE INSERT ON public.contact_imports FOR EACH ROW EXECUTE FUNCTION public.match_contact_on_insert();


--
-- Name: contact_imports match_contact_on_update_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER match_contact_on_update_trigger BEFORE UPDATE ON public.contact_imports FOR EACH ROW WHEN ((old.contact_phone IS DISTINCT FROM new.contact_phone)) EXECUTE FUNCTION public.match_contact_on_insert();


--
-- Name: contact_imports normalize_contact_phone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER normalize_contact_phone BEFORE INSERT OR UPDATE ON public.contact_imports FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_number();


--
-- Name: contact_imports normalize_phone_before_contact_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER normalize_phone_before_contact_insert BEFORE INSERT OR UPDATE OF contact_phone ON public.contact_imports FOR EACH ROW EXECUTE FUNCTION public.normalize_contact_phone();


--
-- Name: profiles normalize_phone_before_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER normalize_phone_before_insert BEFORE INSERT OR UPDATE OF phone_number ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.normalize_profile_phone();


--
-- Name: master_directory_votes on_directory_vote_deleted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_directory_vote_deleted AFTER DELETE ON public.master_directory_votes FOR EACH ROW EXECUTE FUNCTION public.decrement_directory_item_vote_count();


--
-- Name: master_directory_votes on_directory_vote_inserted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_directory_vote_inserted AFTER INSERT ON public.master_directory_votes FOR EACH ROW EXECUTE FUNCTION public.update_directory_item_vote_count();


--
-- Name: lists refresh_master_directory_on_list_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_master_directory_on_list_change AFTER UPDATE ON public.lists FOR EACH ROW WHEN (((old.visibility IS DISTINCT FROM new.visibility) OR (old.category IS DISTINCT FROM new.category))) EXECUTE FUNCTION public.refresh_master_directory_on_change();


--
-- Name: list_items refresh_master_directory_on_list_item_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_master_directory_on_list_item_change AFTER INSERT OR DELETE OR UPDATE ON public.list_items FOR EACH ROW EXECUTE FUNCTION public.refresh_master_directory_on_change();


--
-- Name: guest_contributions trg_block_closed_request_guest_contributions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_closed_request_guest_contributions BEFORE INSERT ON public.guest_contributions FOR EACH ROW EXECUTE FUNCTION public.reject_closed_request_contributions();


--
-- Name: request_responses trg_block_closed_request_request_responses; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_closed_request_request_responses BEFORE INSERT ON public.request_responses FOR EACH ROW EXECUTE FUNCTION public.reject_closed_request_contributions();


--
-- Name: list_items trg_list_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_list_items_updated_at BEFORE UPDATE ON public.list_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: lists trg_lists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lists_updated_at BEFORE UPDATE ON public.lists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: request_responses trg_mark_anon_impression_responded; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mark_anon_impression_responded AFTER INSERT ON public.request_responses FOR EACH ROW EXECUTE FUNCTION public.mark_anonymous_impression_responded();


--
-- Name: request_anonymous_impressions trg_notify_fyp_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_fyp_request AFTER INSERT ON public.request_anonymous_impressions FOR EACH ROW EXECUTE FUNCTION public.notify_fyp_request();


--
-- Name: guest_contributions trg_notify_guest_contribution; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_guest_contribution AFTER INSERT ON public.guest_contributions FOR EACH ROW EXECUTE FUNCTION public.notify_guest_contribution();


--
-- Name: recommendation_votes trg_notify_recommendation_vote; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_recommendation_vote AFTER INSERT ON public.recommendation_votes FOR EACH ROW EXECUTE FUNCTION public.notify_recommendation_vote();


--
-- Name: profiles trg_profiles_normalize_handle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_normalize_handle BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.normalize_profile_handle();


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: requests trg_requests_routing_signal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_requests_routing_signal BEFORE INSERT OR UPDATE OF title, location, category, audience_types, selected_users, group_id ON public.requests FOR EACH ROW EXECUTE FUNCTION public.compute_request_routing_signal();


--
-- Name: profiles trg_sync_is_verified_with_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_is_verified_with_status BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_is_verified_with_status();


--
-- Name: profiles trigger_create_mutual_friend_suggestions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_create_mutual_friend_suggestions AFTER INSERT OR UPDATE OF phone_number ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.create_mutual_friend_suggestions();


--
-- Name: contact_imports update_contact_imports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contact_imports_updated_at BEFORE UPDATE ON public.contact_imports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: directory_entries update_directory_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_directory_entries_updated_at BEFORE UPDATE ON public.directory_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: friend_requests update_friend_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_friend_requests_updated_at BEFORE UPDATE ON public.friend_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: groups update_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: recommendation_votes update_recommendation_vote_count_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_recommendation_vote_count_trigger AFTER INSERT OR DELETE ON public.recommendation_votes FOR EACH ROW EXECUTE FUNCTION public.update_recommendation_vote_count();


--
-- Name: requests update_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_requests_updated_at BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contact_imports validate_contact_data_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_contact_data_trigger BEFORE INSERT OR UPDATE ON public.contact_imports FOR EACH ROW EXECUTE FUNCTION public.validate_contact_data();


--
-- Name: anonymous_handles anonymous_handles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymous_handles
    ADD CONSTRAINT anonymous_handles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: contact_imports contact_imports_matched_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_imports
    ADD CONSTRAINT contact_imports_matched_user_id_fkey FOREIGN KEY (matched_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: contact_imports contact_imports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_imports
    ADD CONSTRAINT contact_imports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: list_items fk_list_items_list; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_items
    ADD CONSTRAINT fk_list_items_list FOREIGN KEY (list_id) REFERENCES public.lists(id) ON DELETE CASCADE;


--
-- Name: lists fk_lists_owner; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT fk_lists_owner FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: request_responses fk_request_responses_request_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_responses
    ADD CONSTRAINT fk_request_responses_request_id FOREIGN KEY (request_id) REFERENCES public.requests(id) ON DELETE CASCADE;


--
-- Name: request_votes fk_request_votes_response_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_votes
    ADD CONSTRAINT fk_request_votes_response_id FOREIGN KEY (response_id) REFERENCES public.request_responses(id) ON DELETE CASCADE;


--
-- Name: requests fk_requests_group_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT fk_requests_group_id FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_addressee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friend_suggestions friend_suggestions_suggested_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_suggestions
    ADD CONSTRAINT friend_suggestions_suggested_user_id_fkey FOREIGN KEY (suggested_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friend_suggestions friend_suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_suggestions
    ADD CONSTRAINT friend_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_user1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user1_id_fkey FOREIGN KEY (user1_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_user2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user2_id_fkey FOREIGN KEY (user2_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: groups groups_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: guest_contributions guest_contributions_converted_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_contributions
    ADD CONSTRAINT guest_contributions_converted_user_id_fkey FOREIGN KEY (converted_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: guest_contributions guest_contributions_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_contributions
    ADD CONSTRAINT guest_contributions_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.requests(id) ON DELETE CASCADE;


--
-- Name: guest_contributions guest_contributions_share_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_contributions
    ADD CONSTRAINT guest_contributions_share_link_id_fkey FOREIGN KEY (share_link_id) REFERENCES public.share_links(id) ON DELETE SET NULL;


--
-- Name: guest_recommendation_merges guest_recommendation_merges_guest_contribution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_recommendation_merges
    ADD CONSTRAINT guest_recommendation_merges_guest_contribution_id_fkey FOREIGN KEY (guest_contribution_id) REFERENCES public.guest_contributions(id) ON DELETE CASCADE;


--
-- Name: lists lists_directory_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_directory_list_id_fkey FOREIGN KEY (directory_list_id) REFERENCES public.master_directory_lists(id);


--
-- Name: lists lists_source_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_source_request_id_fkey FOREIGN KEY (source_request_id) REFERENCES public.requests(id) ON DELETE SET NULL;


--
-- Name: master_directory_items master_directory_items_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_directory_items
    ADD CONSTRAINT master_directory_items_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.profiles(id);


--
-- Name: master_directory_items master_directory_items_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_directory_items
    ADD CONSTRAINT master_directory_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.master_directory_lists(id) ON DELETE CASCADE;


--
-- Name: master_directory_lists master_directory_lists_original_contributor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_directory_lists
    ADD CONSTRAINT master_directory_lists_original_contributor_id_fkey FOREIGN KEY (original_contributor_id) REFERENCES public.profiles(id);


--
-- Name: master_directory_votes master_directory_votes_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_directory_votes
    ADD CONSTRAINT master_directory_votes_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.master_directory_items(id) ON DELETE CASCADE;


--
-- Name: master_directory_votes master_directory_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_directory_votes
    ADD CONSTRAINT master_directory_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: notifications notifications_related_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_related_user_id_fkey FOREIGN KEY (related_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: recommendation_clusters recommendation_clusters_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_clusters
    ADD CONSTRAINT recommendation_clusters_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.requests(id) ON DELETE CASCADE;


--
-- Name: request_forwards request_forwards_forwarded_to_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_forwards
    ADD CONSTRAINT request_forwards_forwarded_to_group_id_fkey FOREIGN KEY (forwarded_to_group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: request_forwards request_forwards_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_forwards
    ADD CONSTRAINT request_forwards_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.requests(id) ON DELETE CASCADE;


--
-- Name: response_recommendations response_recommendations_merged_into_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_recommendations
    ADD CONSTRAINT response_recommendations_merged_into_id_fkey FOREIGN KEY (merged_into_id) REFERENCES public.response_recommendations(id) ON DELETE SET NULL;


--
-- Name: response_recommendations response_recommendations_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_recommendations
    ADD CONSTRAINT response_recommendations_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.request_responses(id) ON DELETE CASCADE;


--
-- Name: share_links share_links_generated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_generated_by_user_id_fkey FOREIGN KEY (generated_by_user_id) REFERENCES public.profiles(id);


--
-- Name: share_links share_links_parent_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_parent_link_id_fkey FOREIGN KEY (parent_link_id) REFERENCES public.share_links(id) ON DELETE CASCADE;


--
-- Name: share_links share_links_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.requests(id) ON DELETE CASCADE;


--
-- Name: user_expertise user_expertise_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_expertise
    ADD CONSTRAINT user_expertise_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: temp_waitlist Admins can delete waitlist entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete waitlist entries" ON public.temp_waitlist FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can manage all user roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all user roles" ON public.user_roles USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: contact_access_logs Admins can view contact access logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view contact access logs" ON public.contact_access_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: temp_waitlist Admins can view waitlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view waitlist" ON public.temp_waitlist FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: temp_waitlist Anyone can join waitlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can join waitlist" ON public.temp_waitlist FOR INSERT WITH CHECK (true);


--
-- Name: share_links Anyone can read share links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read share links" ON public.share_links FOR SELECT TO anon USING (true);


--
-- Name: share_links Anyone can update share link counters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update share link counters" ON public.share_links FOR UPDATE TO anon USING (true);


--
-- Name: recommendation_votes Authenticated can view recommendation votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view recommendation votes" ON public.recommendation_votes FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL));


--
-- Name: notifications Authenticated users can create notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: master_directory_entries Authenticated users can search master directory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can search master directory" ON public.master_directory_entries FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: directory_votes Authenticated users can vote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can vote" ON public.directory_votes FOR INSERT WITH CHECK ((auth.uid() = voter_id));


--
-- Name: colleges Colleges are readable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Colleges are readable by everyone" ON public.colleges FOR SELECT USING (true);


--
-- Name: profiles Deny anonymous access to profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Deny anonymous access to profiles" ON public.profiles USING (false) WITH CHECK (false);


--
-- Name: group_members Group creators can manage group members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group creators can manage group members" ON public.group_members USING (public.is_group_creator(group_id, auth.uid())) WITH CHECK (public.is_group_creator(group_id, auth.uid()));


--
-- Name: groups Group creators can manage their groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group creators can manage their groups" ON public.groups USING ((creator_id = auth.uid())) WITH CHECK ((creator_id = auth.uid()));


--
-- Name: groups Group members can view groups they belong to; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group members can view groups they belong to" ON public.groups FOR SELECT USING (((creator_id = auth.uid()) OR public.is_group_member(id, auth.uid())));


--
-- Name: guest_contributions Guests can insert contributions via valid share link; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Guests can insert contributions via valid share link" ON public.guest_contributions FOR INSERT TO authenticated, anon WITH CHECK (((share_link_id IS NOT NULL) AND public.share_link_matches(share_link_id, request_id)));


--
-- Name: list_items Items of public lists are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Items of public lists are viewable by everyone" ON public.list_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.lists l
  WHERE ((l.id = list_items.list_id) AND (l.visibility = 'public'::public.list_visibility)))));


--
-- Name: lists Owners can do everything with their lists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can do everything with their lists" ON public.lists USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));


--
-- Name: list_items Owners can manage items of their lists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage items of their lists" ON public.list_items USING ((EXISTS ( SELECT 1
   FROM public.lists l
  WHERE ((l.id = list_items.list_id) AND (l.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.lists l
  WHERE ((l.id = list_items.list_id) AND (l.owner_id = auth.uid())))));


--
-- Name: directory_entries Public directory entries viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public directory entries viewable by authenticated users" ON public.directory_entries FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: lists Public lists are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public lists are viewable by everyone" ON public.lists FOR SELECT USING ((visibility = 'public'::public.list_visibility));


--
-- Name: master_directory_items Public read items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read items" ON public.master_directory_items FOR SELECT USING (true);


--
-- Name: master_directory_lists Public read lists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read lists" ON public.master_directory_lists FOR SELECT USING (true);


--
-- Name: master_directory_votes Public read votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read votes" ON public.master_directory_votes FOR SELECT USING (true);


--
-- Name: recommendation_clusters Request creators can manage clusters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Request creators can manage clusters" ON public.recommendation_clusters USING ((EXISTS ( SELECT 1
   FROM public.requests r
  WHERE ((r.id = recommendation_clusters.request_id) AND (r.creator_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.requests r
  WHERE ((r.id = recommendation_clusters.request_id) AND (r.creator_id = auth.uid())))));


--
-- Name: guest_contributions Request creators can view guest contributions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Request creators can view guest contributions" ON public.guest_contributions FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.requests r
  WHERE ((r.id = guest_contributions.request_id) AND (r.creator_id = auth.uid()))))));


--
-- Name: search_analytics Restricted search analytics access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Restricted search analytics access" ON public.search_analytics FOR SELECT USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: profiles Secure profile creation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Secure profile creation" ON public.profiles FOR INSERT WITH CHECK (((auth.uid() = id) AND (auth.uid() IS NOT NULL)));


--
-- Name: profiles Secure profile deletion; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Secure profile deletion" ON public.profiles FOR DELETE USING (((auth.uid() = id) AND (auth.uid() IS NOT NULL)));


--
-- Name: profiles Secure profile updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Secure profile updates" ON public.profiles FOR UPDATE USING ((((auth.uid() = id) AND (auth.uid() IS NOT NULL)) OR public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK ((((auth.uid() = id) AND (auth.uid() IS NOT NULL)) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: friend_suggestions System can create friend suggestions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can create friend suggestions" ON public.friend_suggestions FOR INSERT WITH CHECK (false);


--
-- Name: search_analytics System can create search analytics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can create search analytics" ON public.search_analytics FOR INSERT WITH CHECK (true);


--
-- Name: anonymous_handles System can manage anonymous handles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can manage anonymous handles" ON public.anonymous_handles USING (false) WITH CHECK (false);


--
-- Name: directory_entries System can manage directory entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can manage directory entries" ON public.directory_entries USING (false) WITH CHECK (false);


--
-- Name: master_directory_entries System can manage master directory entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can manage master directory entries" ON public.master_directory_entries USING (false) WITH CHECK (false);


--
-- Name: user_expertise System can manage user expertise; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can manage user expertise" ON public.user_expertise USING (false) WITH CHECK (false);


--
-- Name: request_forwards Users can create forwards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create forwards" ON public.request_forwards FOR INSERT WITH CHECK (((forwarded_by_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.requests r
  WHERE ((r.id = request_forwards.request_id) AND (r.allow_forwarding = true)))) AND public.user_in_direct_audience(auth.uid(), request_id)));


--
-- Name: friend_requests Users can create friend requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create friend requests" ON public.friend_requests FOR INSERT WITH CHECK ((auth.uid() = requester_id));


--
-- Name: friendships Users can create friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create friendships" ON public.friendships FOR INSERT WITH CHECK (((auth.uid() = user1_id) OR (auth.uid() = user2_id)));


--
-- Name: response_recommendations Users can create recommendations for their responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create recommendations for their responses" ON public.response_recommendations FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.request_responses rr
  WHERE ((rr.id = response_recommendations.response_id) AND (rr.responder_id = auth.uid())))));


--
-- Name: request_responses Users can create responses to requests they can see; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create responses to requests they can see" ON public.request_responses FOR INSERT WITH CHECK (((responder_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.requests
  WHERE (requests.id = request_responses.request_id)))));


--
-- Name: share_links Users can create share links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create share links" ON public.share_links FOR INSERT TO authenticated WITH CHECK ((generated_by_user_id = auth.uid()));


--
-- Name: requests Users can create their own requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own requests" ON public.requests FOR INSERT WITH CHECK ((creator_id = auth.uid()));


--
-- Name: recommendation_votes Users can create their own votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own votes" ON public.recommendation_votes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: contact_imports Users can delete own contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own contacts" ON public.contact_imports FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: friendships Users can delete their own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own friendships" ON public.friendships FOR DELETE USING (((auth.uid() = user1_id) OR (auth.uid() = user2_id)));


--
-- Name: notifications Users can delete their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: response_recommendations Users can delete their own recommendations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own recommendations" ON public.response_recommendations FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.request_responses rr
  WHERE ((rr.id = response_recommendations.response_id) AND (rr.responder_id = auth.uid())))));


--
-- Name: requests Users can delete their own requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own requests" ON public.requests FOR DELETE USING ((creator_id = auth.uid()));


--
-- Name: request_responses Users can delete their own responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own responses" ON public.request_responses FOR DELETE USING ((responder_id = auth.uid()));


--
-- Name: friend_suggestions Users can delete their own suggestions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own suggestions" ON public.friend_suggestions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: directory_votes Users can delete their own votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own votes" ON public.directory_votes FOR DELETE USING ((auth.uid() = voter_id));


--
-- Name: recommendation_votes Users can delete their own votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own votes" ON public.recommendation_votes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: request_votes Users can delete their own votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own votes" ON public.request_votes FOR DELETE USING ((voter_id = auth.uid()));


--
-- Name: contact_imports Users can insert own contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own contacts" ON public.contact_imports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: contact_imports Users can update own contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own contacts" ON public.contact_imports FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: notifications Users can update their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: response_recommendations Users can update their own recommendations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own recommendations" ON public.response_recommendations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.request_responses rr
  WHERE ((rr.id = response_recommendations.response_id) AND (rr.responder_id = auth.uid())))));


--
-- Name: requests Users can update their own requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own requests" ON public.requests FOR UPDATE USING ((creator_id = auth.uid()));


--
-- Name: request_responses Users can update their own responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own responses" ON public.request_responses FOR UPDATE USING ((responder_id = auth.uid()));


--
-- Name: share_links Users can update their own share links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own share links" ON public.share_links FOR UPDATE TO authenticated USING ((generated_by_user_id = auth.uid()));


--
-- Name: friend_suggestions Users can update their own suggestions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own suggestions" ON public.friend_suggestions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: directory_votes Users can update their own votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own votes" ON public.directory_votes FOR UPDATE USING ((auth.uid() = voter_id));


--
-- Name: request_votes Users can update their own votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own votes" ON public.request_votes FOR UPDATE USING ((voter_id = auth.uid()));


--
-- Name: friend_requests Users can update their received requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their received requests" ON public.friend_requests FOR UPDATE USING ((auth.uid() = addressee_id));


--
-- Name: directory_votes Users can view all directory votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all directory votes" ON public.directory_votes FOR SELECT USING (true);


--
-- Name: recommendation_clusters Users can view clusters for visible requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view clusters for visible requests" ON public.recommendation_clusters FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.requests r
  WHERE (r.id = recommendation_clusters.request_id))));


--
-- Name: contact_imports Users can view own contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own contacts" ON public.contact_imports FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: response_recommendations Users can view recommendations for visible responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view recommendations for visible responses" ON public.response_recommendations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.request_responses rr
  WHERE (rr.id = response_recommendations.response_id))));


--
-- Name: request_forwards Users can view relevant forwards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view relevant forwards" ON public.request_forwards FOR SELECT USING (((forwarded_by_user_id = auth.uid()) OR (auth.uid() = ANY (forwarded_to)) OR (EXISTS ( SELECT 1
   FROM public.requests r
  WHERE ((r.id = request_forwards.request_id) AND (r.creator_id = auth.uid()))))));


--
-- Name: requests Users can view requests sent to them or created by them; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view requests sent to them or created by them" ON public.requests FOR SELECT USING (((creator_id = auth.uid()) OR (('first_network'::text = ANY (audience_types)) AND (EXISTS ( SELECT 1
   FROM public.friendships f
  WHERE (((f.user1_id = auth.uid()) AND (f.user2_id = requests.creator_id)) OR ((f.user2_id = auth.uid()) AND (f.user1_id = requests.creator_id)))))) OR (('group'::text = ANY (audience_types)) AND (group_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.group_members gm
  WHERE ((gm.group_id = requests.group_id) AND (gm.user_id = auth.uid()))))) OR (('specific_people'::text = ANY (audience_types)) AND (selected_users IS NOT NULL) AND (auth.uid() = ANY (selected_users))) OR (('public'::text = ANY (audience_types)) AND (auth.uid() IS NOT NULL)) OR (('anonymous_expertise'::text = ANY (audience_types)) AND public.matches_anonymous_expertise(auth.uid(), id)) OR (EXISTS ( SELECT 1
   FROM public.request_forwards rf
  WHERE ((rf.request_id = requests.id) AND (auth.uid() = ANY (rf.forwarded_to)))))));


--
-- Name: request_responses Users can view responses to requests they can see; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view responses to requests they can see" ON public.request_responses FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.requests
  WHERE (requests.id = request_responses.request_id))));


--
-- Name: anonymous_handles Users can view their own anonymous handle; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own anonymous handle" ON public.anonymous_handles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_expertise Users can view their own expertise; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own expertise" ON public.user_expertise FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: friend_requests Users can view their own friend requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own friend requests" ON public.friend_requests FOR SELECT USING (((auth.uid() = requester_id) OR (auth.uid() = addressee_id)));


--
-- Name: friendships Users can view their own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own friendships" ON public.friendships FOR SELECT USING (((auth.uid() = user1_id) OR (auth.uid() = user2_id)));


--
-- Name: group_members Users can view their own group memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own group memberships" ON public.group_members FOR SELECT USING (((user_id = auth.uid()) OR public.is_group_creator(group_id, auth.uid())));


--
-- Name: notifications Users can view their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: share_links Users can view their own share links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own share links" ON public.share_links FOR SELECT TO authenticated USING ((generated_by_user_id = auth.uid()));


--
-- Name: friend_suggestions Users can view their own suggestions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own suggestions" ON public.friend_suggestions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: request_votes Users can view votes on responses they can see; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view votes on responses they can see" ON public.request_votes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.request_responses
  WHERE (request_responses.id = request_votes.response_id))));


--
-- Name: request_votes Users can vote on responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can vote on responses" ON public.request_votes FOR INSERT WITH CHECK ((voter_id = auth.uid()));


--
-- Name: master_directory_items Verified users can add items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Verified users can add items" ON public.master_directory_items FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'verified'::public.user_type)))));


--
-- Name: master_directory_lists Verified users can add lists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Verified users can add lists" ON public.master_directory_lists FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'verified'::public.user_type)))));


--
-- Name: master_directory_votes Verified users can delete own votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Verified users can delete own votes" ON public.master_directory_votes FOR DELETE USING (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'verified'::public.user_type))))));


--
-- Name: master_directory_votes Verified users can vote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Verified users can vote" ON public.master_directory_votes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'verified'::public.user_type)))));


--
-- Name: profiles View basic profile info only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View basic profile info only" ON public.profiles FOR SELECT USING (((auth.uid() = id) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR ((is_verified = true) AND (full_name IS NOT NULL) AND (handle IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM public.friendships f
  WHERE (((f.user1_id = auth.uid()) AND (f.user2_id = profiles.id)) OR ((f.user2_id = auth.uid()) AND (f.user1_id = profiles.id))))) OR ((EXISTS ( SELECT 1
   FROM public.lists l
  WHERE ((l.owner_id = profiles.id) AND (l.visibility = 'public'::public.list_visibility)))) AND (EXISTS ( SELECT 1
   FROM public.get_extended_network(auth.uid()) en(profile_id, full_name, handle, mutual_friends)
  WHERE (en.profile_id = profiles.id))))))));


--
-- Name: anonymous_handles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.anonymous_handles ENABLE ROW LEVEL SECURITY;

--
-- Name: colleges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_access_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_access_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_imports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_imports ENABLE ROW LEVEL SECURITY;

--
-- Name: request_anonymous_impressions deny all on impressions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deny all on impressions" ON public.request_anonymous_impressions USING (false) WITH CHECK (false);


--
-- Name: directory_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directory_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: directory_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directory_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: friend_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: friend_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friend_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: friendships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

--
-- Name: group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: guest_contributions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guest_contributions ENABLE ROW LEVEL SECURITY;

--
-- Name: guest_recommendation_merges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guest_recommendation_merges ENABLE ROW LEVEL SECURITY;

--
-- Name: list_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;

--
-- Name: lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

--
-- Name: master_directory_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.master_directory_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: master_directory_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.master_directory_items ENABLE ROW LEVEL SECURITY;

--
-- Name: master_directory_lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.master_directory_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: master_directory_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.master_directory_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: recommendation_clusters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recommendation_clusters ENABLE ROW LEVEL SECURITY;

--
-- Name: recommendation_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recommendation_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: request_anonymous_impressions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.request_anonymous_impressions ENABLE ROW LEVEL SECURITY;

--
-- Name: request_forwards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.request_forwards ENABLE ROW LEVEL SECURITY;

--
-- Name: request_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.request_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: request_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.request_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

--
-- Name: response_recommendations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.response_recommendations ENABLE ROW LEVEL SECURITY;

--
-- Name: search_analytics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.search_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: share_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

--
-- Name: temp_waitlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.temp_waitlist ENABLE ROW LEVEL SECURITY;

--
-- Name: user_expertise; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_expertise ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION admin_delete_user(user_id_to_delete uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_delete_user(user_id_to_delete uuid) TO service_role;


--
-- Name: FUNCTION anonymous_active_cap_ok(p_recipient_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.anonymous_active_cap_ok(p_recipient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.anonymous_active_cap_ok(p_recipient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.anonymous_active_cap_ok(p_recipient_id uuid) TO service_role;


--
-- Name: FUNCTION anonymous_creator_cooldown_ok(p_creator_id uuid, p_recipient_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.anonymous_creator_cooldown_ok(p_creator_id uuid, p_recipient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.anonymous_creator_cooldown_ok(p_creator_id uuid, p_recipient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.anonymous_creator_cooldown_ok(p_creator_id uuid, p_recipient_id uuid) TO service_role;


--
-- Name: FUNCTION anonymous_thread_label(p_uid uuid, p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.anonymous_thread_label(p_uid uuid, p_request_id uuid) TO anon;
GRANT ALL ON FUNCTION public.anonymous_thread_label(p_uid uuid, p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.anonymous_thread_label(p_uid uuid, p_request_id uuid) TO service_role;


--
-- Name: FUNCTION audit_contact_access(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_contact_access() TO anon;
GRANT ALL ON FUNCTION public.audit_contact_access() TO authenticated;
GRANT ALL ON FUNCTION public.audit_contact_access() TO service_role;


--
-- Name: FUNCTION build_canonical_signature(p_entity_type text, p_geography text, p_use_case text, p_hard_filter text, p_temporal_scope text, p_ranking_lens text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.build_canonical_signature(p_entity_type text, p_geography text, p_use_case text, p_hard_filter text, p_temporal_scope text, p_ranking_lens text) TO anon;
GRANT ALL ON FUNCTION public.build_canonical_signature(p_entity_type text, p_geography text, p_use_case text, p_hard_filter text, p_temporal_scope text, p_ranking_lens text) TO authenticated;
GRANT ALL ON FUNCTION public.build_canonical_signature(p_entity_type text, p_geography text, p_use_case text, p_hard_filter text, p_temporal_scope text, p_ranking_lens text) TO service_role;


--
-- Name: FUNCTION build_canonical_title(p_entity_type text, p_plural_term text, p_geography text, p_use_case text, p_hard_filter text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.build_canonical_title(p_entity_type text, p_plural_term text, p_geography text, p_use_case text, p_hard_filter text) TO anon;
GRANT ALL ON FUNCTION public.build_canonical_title(p_entity_type text, p_plural_term text, p_geography text, p_use_case text, p_hard_filter text) TO authenticated;
GRANT ALL ON FUNCTION public.build_canonical_title(p_entity_type text, p_plural_term text, p_geography text, p_use_case text, p_hard_filter text) TO service_role;


--
-- Name: FUNCTION calculate_request_relevance(user_id_param uuid, request_id_param uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calculate_request_relevance(user_id_param uuid, request_id_param uuid) TO anon;
GRANT ALL ON FUNCTION public.calculate_request_relevance(user_id_param uuid, request_id_param uuid) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_request_relevance(user_id_param uuid, request_id_param uuid) TO service_role;


--
-- Name: FUNCTION can_reveal_identity(p_viewer_id uuid, p_request_id uuid, p_target_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_reveal_identity(p_viewer_id uuid, p_request_id uuid, p_target_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_reveal_identity(p_viewer_id uuid, p_request_id uuid, p_target_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_reveal_identity(p_viewer_id uuid, p_request_id uuid, p_target_user_id uuid) TO service_role;


--
-- Name: FUNCTION check_rate_limit(_key text, _action text, _limit integer, _window_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_rate_limit(_key text, _action text, _limit integer, _window_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_rate_limit(_key text, _action text, _limit integer, _window_seconds integer) TO anon;
GRANT ALL ON FUNCTION public.check_rate_limit(_key text, _action text, _limit integer, _window_seconds integer) TO authenticated;
GRANT ALL ON FUNCTION public.check_rate_limit(_key text, _action text, _limit integer, _window_seconds integer) TO service_role;


--
-- Name: FUNCTION cleanup_expired_contacts(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_expired_contacts() TO anon;
GRANT ALL ON FUNCTION public.cleanup_expired_contacts() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_expired_contacts() TO service_role;


--
-- Name: FUNCTION compute_request_routing_signal(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.compute_request_routing_signal() TO anon;
GRANT ALL ON FUNCTION public.compute_request_routing_signal() TO authenticated;
GRANT ALL ON FUNCTION public.compute_request_routing_signal() TO service_role;


--
-- Name: FUNCTION create_anonymous_handle_for_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_anonymous_handle_for_user() TO anon;
GRANT ALL ON FUNCTION public.create_anonymous_handle_for_user() TO authenticated;
GRANT ALL ON FUNCTION public.create_anonymous_handle_for_user() TO service_role;


--
-- Name: FUNCTION create_mutual_friend_suggestions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_mutual_friend_suggestions() TO anon;
GRANT ALL ON FUNCTION public.create_mutual_friend_suggestions() TO authenticated;
GRANT ALL ON FUNCTION public.create_mutual_friend_suggestions() TO service_role;


--
-- Name: FUNCTION debug_anonymous_match(p_request_id uuid, p_uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.debug_anonymous_match(p_request_id uuid, p_uid uuid) TO anon;
GRANT ALL ON FUNCTION public.debug_anonymous_match(p_request_id uuid, p_uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.debug_anonymous_match(p_request_id uuid, p_uid uuid) TO service_role;


--
-- Name: FUNCTION debug_phone_match(contact_phone_input text, profile_phone_input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.debug_phone_match(contact_phone_input text, profile_phone_input text) TO anon;
GRANT ALL ON FUNCTION public.debug_phone_match(contact_phone_input text, profile_phone_input text) TO authenticated;
GRANT ALL ON FUNCTION public.debug_phone_match(contact_phone_input text, profile_phone_input text) TO service_role;


--
-- Name: FUNCTION decrement_directory_item_vote_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.decrement_directory_item_vote_count() TO anon;
GRANT ALL ON FUNCTION public.decrement_directory_item_vote_count() TO authenticated;
GRANT ALL ON FUNCTION public.decrement_directory_item_vote_count() TO service_role;


--
-- Name: FUNCTION dismiss_anonymous_impression(p_request_id uuid, p_action text, p_snooze_days integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.dismiss_anonymous_impression(p_request_id uuid, p_action text, p_snooze_days integer) TO anon;
GRANT ALL ON FUNCTION public.dismiss_anonymous_impression(p_request_id uuid, p_action text, p_snooze_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.dismiss_anonymous_impression(p_request_id uuid, p_action text, p_snooze_days integer) TO service_role;


--
-- Name: FUNCTION encrypt_contact_data(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.encrypt_contact_data() TO anon;
GRANT ALL ON FUNCTION public.encrypt_contact_data() TO authenticated;
GRANT ALL ON FUNCTION public.encrypt_contact_data() TO service_role;


--
-- Name: FUNCTION estimate_anonymous_expertise_reach(p_category text, p_location text, p_keywords text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.estimate_anonymous_expertise_reach(p_category text, p_location text, p_keywords text[]) TO anon;
GRANT ALL ON FUNCTION public.estimate_anonymous_expertise_reach(p_category text, p_location text, p_keywords text[]) TO authenticated;
GRANT ALL ON FUNCTION public.estimate_anonymous_expertise_reach(p_category text, p_location text, p_keywords text[]) TO service_role;


--
-- Name: FUNCTION estimate_anonymous_expertise_reach(p_category text, p_location text, p_keywords text[], p_title text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.estimate_anonymous_expertise_reach(p_category text, p_location text, p_keywords text[], p_title text) TO anon;
GRANT ALL ON FUNCTION public.estimate_anonymous_expertise_reach(p_category text, p_location text, p_keywords text[], p_title text) TO authenticated;
GRANT ALL ON FUNCTION public.estimate_anonymous_expertise_reach(p_category text, p_location text, p_keywords text[], p_title text) TO service_role;


--
-- Name: FUNCTION find_network_experts(viewer_id uuid, query_domains text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.find_network_experts(viewer_id uuid, query_domains text[]) TO anon;
GRANT ALL ON FUNCTION public.find_network_experts(viewer_id uuid, query_domains text[]) TO authenticated;
GRANT ALL ON FUNCTION public.find_network_experts(viewer_id uuid, query_domains text[]) TO service_role;


--
-- Name: FUNCTION find_network_experts_all_degrees(viewer_id uuid, domain_filter text, location_filter text, max_depth integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.find_network_experts_all_degrees(viewer_id uuid, domain_filter text, location_filter text, max_depth integer) TO anon;
GRANT ALL ON FUNCTION public.find_network_experts_all_degrees(viewer_id uuid, domain_filter text, location_filter text, max_depth integer) TO authenticated;
GRANT ALL ON FUNCTION public.find_network_experts_all_degrees(viewer_id uuid, domain_filter text, location_filter text, max_depth integer) TO service_role;


--
-- Name: FUNCTION find_profile_by_normalized_phone(input_phone text, exclude_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.find_profile_by_normalized_phone(input_phone text, exclude_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.find_profile_by_normalized_phone(input_phone text, exclude_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.find_profile_by_normalized_phone(input_phone text, exclude_user_id uuid) TO service_role;


--
-- Name: FUNCTION find_similar_directory_lists(p_title text, p_threshold double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.find_similar_directory_lists(p_title text, p_threshold double precision) TO anon;
GRANT ALL ON FUNCTION public.find_similar_directory_lists(p_title text, p_threshold double precision) TO authenticated;
GRANT ALL ON FUNCTION public.find_similar_directory_lists(p_title text, p_threshold double precision) TO service_role;


--
-- Name: FUNCTION find_similar_recommendations_unified(req_id uuid, threshold double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.find_similar_recommendations_unified(req_id uuid, threshold double precision) TO anon;
GRANT ALL ON FUNCTION public.find_similar_recommendations_unified(req_id uuid, threshold double precision) TO authenticated;
GRANT ALL ON FUNCTION public.find_similar_recommendations_unified(req_id uuid, threshold double precision) TO service_role;


--
-- Name: FUNCTION generate_anonymous_handle(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_anonymous_handle() TO anon;
GRANT ALL ON FUNCTION public.generate_anonymous_handle() TO authenticated;
GRANT ALL ON FUNCTION public.generate_anonymous_handle() TO service_role;


--
-- Name: FUNCTION generate_share_token(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_share_token() TO anon;
GRANT ALL ON FUNCTION public.generate_share_token() TO authenticated;
GRANT ALL ON FUNCTION public.generate_share_token() TO service_role;


--
-- Name: FUNCTION get_connection_path(user_a uuid, user_b uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_connection_path(user_a uuid, user_b uuid) TO anon;
GRANT ALL ON FUNCTION public.get_connection_path(user_a uuid, user_b uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_connection_path(user_a uuid, user_b uuid) TO service_role;


--
-- Name: FUNCTION get_current_user_role(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_current_user_role() TO anon;
GRANT ALL ON FUNCTION public.get_current_user_role() TO authenticated;
GRANT ALL ON FUNCTION public.get_current_user_role() TO service_role;


--
-- Name: FUNCTION get_dashboard_summary(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_dashboard_summary() TO anon;
GRANT ALL ON FUNCTION public.get_dashboard_summary() TO authenticated;
GRANT ALL ON FUNCTION public.get_dashboard_summary() TO service_role;


--
-- Name: FUNCTION get_degree_of_separation(user_a uuid, user_b uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_degree_of_separation(user_a uuid, user_b uuid) TO anon;
GRANT ALL ON FUNCTION public.get_degree_of_separation(user_a uuid, user_b uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_degree_of_separation(user_a uuid, user_b uuid) TO service_role;


--
-- Name: FUNCTION get_display_identity(viewer_id uuid, profile_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_display_identity(viewer_id uuid, profile_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_display_identity(viewer_id uuid, profile_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_display_identity(viewer_id uuid, profile_id uuid) TO service_role;


--
-- Name: FUNCTION get_extended_network(user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_extended_network(user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_extended_network(user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_extended_network(user_id uuid) TO service_role;


--
-- Name: FUNCTION get_for_you_requests(p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_for_you_requests(p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_for_you_requests(p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_for_you_requests(p_limit integer) TO service_role;


--
-- Name: FUNCTION get_fyp_latest_surfaced_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_fyp_latest_surfaced_at() TO anon;
GRANT ALL ON FUNCTION public.get_fyp_latest_surfaced_at() TO authenticated;
GRANT ALL ON FUNCTION public.get_fyp_latest_surfaced_at() TO service_role;


--
-- Name: FUNCTION get_guest_page_preview(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_guest_page_preview(p_request_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_guest_page_preview(p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_guest_page_preview(p_request_id uuid) TO service_role;


--
-- Name: FUNCTION get_network_contributors(user_id_param uuid, contributor_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_network_contributors(user_id_param uuid, contributor_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_network_contributors(user_id_param uuid, contributor_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_network_contributors(user_id_param uuid, contributor_ids uuid[]) TO service_role;


--
-- Name: FUNCTION get_request_for_guest(p_request_id uuid, p_token text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_request_for_guest(p_request_id uuid, p_token text) TO anon;
GRANT ALL ON FUNCTION public.get_request_for_guest(p_request_id uuid, p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.get_request_for_guest(p_request_id uuid, p_token text) TO service_role;


--
-- Name: FUNCTION get_response_origin(p_response_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_response_origin(p_response_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_response_origin(p_response_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_response_origin(p_response_id uuid) TO service_role;


--
-- Name: FUNCTION get_response_tree(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_response_tree(p_request_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_response_tree(p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_response_tree(p_request_id uuid) TO service_role;


--
-- Name: FUNCTION get_safe_profile_view(profile_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_safe_profile_view(profile_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_safe_profile_view(profile_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_safe_profile_view(profile_id uuid) TO service_role;


--
-- Name: FUNCTION get_third_plus_network(viewer_id uuid, max_depth integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_third_plus_network(viewer_id uuid, max_depth integer) TO anon;
GRANT ALL ON FUNCTION public.get_third_plus_network(viewer_id uuid, max_depth integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_third_plus_network(viewer_id uuid, max_depth integer) TO service_role;


--
-- Name: FUNCTION handle_user_signup(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_user_signup() TO anon;
GRANT ALL ON FUNCTION public.handle_user_signup() TO authenticated;
GRANT ALL ON FUNCTION public.handle_user_signup() TO service_role;


--
-- Name: FUNCTION has_fyp_unread(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_fyp_unread() TO anon;
GRANT ALL ON FUNCTION public.has_fyp_unread() TO authenticated;
GRANT ALL ON FUNCTION public.has_fyp_unread() TO service_role;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO anon;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;


--
-- Name: FUNCTION hash_contact_info(contact_value text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.hash_contact_info(contact_value text) TO anon;
GRANT ALL ON FUNCTION public.hash_contact_info(contact_value text) TO authenticated;
GRANT ALL ON FUNCTION public.hash_contact_info(contact_value text) TO service_role;


--
-- Name: FUNCTION increment_master_directory_search_count(entry_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_master_directory_search_count(entry_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.increment_master_directory_search_count(entry_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.increment_master_directory_search_count(entry_ids uuid[]) TO service_role;


--
-- Name: FUNCTION increment_search_count(entry_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_search_count(entry_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.increment_search_count(entry_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.increment_search_count(entry_ids uuid[]) TO service_role;


--
-- Name: FUNCTION is_group_creator(group_id uuid, user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_group_creator(group_id uuid, user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_group_creator(group_id uuid, user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_group_creator(group_id uuid, user_id uuid) TO service_role;


--
-- Name: FUNCTION is_group_member(group_id uuid, user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_group_member(group_id uuid, user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_group_member(group_id uuid, user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_group_member(group_id uuid, user_id uuid) TO service_role;


--
-- Name: FUNCTION is_in_network(viewer_id uuid, profile_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_in_network(viewer_id uuid, profile_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_in_network(viewer_id uuid, profile_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_in_network(viewer_id uuid, profile_id uuid) TO service_role;


--
-- Name: FUNCTION log_contact_access(action_type text, contact_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_contact_access(action_type text, contact_id uuid) TO anon;
GRANT ALL ON FUNCTION public.log_contact_access(action_type text, contact_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.log_contact_access(action_type text, contact_id uuid) TO service_role;


--
-- Name: FUNCTION log_contact_access_trigger(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_contact_access_trigger() TO anon;
GRANT ALL ON FUNCTION public.log_contact_access_trigger() TO authenticated;
GRANT ALL ON FUNCTION public.log_contact_access_trigger() TO service_role;


--
-- Name: FUNCTION mark_anonymous_impression_responded(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_anonymous_impression_responded() TO anon;
GRANT ALL ON FUNCTION public.mark_anonymous_impression_responded() TO authenticated;
GRANT ALL ON FUNCTION public.mark_anonymous_impression_responded() TO service_role;


--
-- Name: FUNCTION mark_for_you_visited(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_for_you_visited() TO anon;
GRANT ALL ON FUNCTION public.mark_for_you_visited() TO authenticated;
GRANT ALL ON FUNCTION public.mark_for_you_visited() TO service_role;


--
-- Name: FUNCTION match_contact_on_insert(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.match_contact_on_insert() TO anon;
GRANT ALL ON FUNCTION public.match_contact_on_insert() TO authenticated;
GRANT ALL ON FUNCTION public.match_contact_on_insert() TO service_role;


--
-- Name: FUNCTION match_contacts_by_phone(user_id_input uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.match_contacts_by_phone(user_id_input uuid) TO anon;
GRANT ALL ON FUNCTION public.match_contacts_by_phone(user_id_input uuid) TO authenticated;
GRANT ALL ON FUNCTION public.match_contacts_by_phone(user_id_input uuid) TO service_role;


--
-- Name: FUNCTION match_new_user_to_contacts(new_user_id uuid, new_user_phone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.match_new_user_to_contacts(new_user_id uuid, new_user_phone text) TO anon;
GRANT ALL ON FUNCTION public.match_new_user_to_contacts(new_user_id uuid, new_user_phone text) TO authenticated;
GRANT ALL ON FUNCTION public.match_new_user_to_contacts(new_user_id uuid, new_user_phone text) TO service_role;


--
-- Name: FUNCTION matches_anonymous_expertise(p_uid uuid, p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.matches_anonymous_expertise(p_uid uuid, p_request_id uuid) TO anon;
GRANT ALL ON FUNCTION public.matches_anonymous_expertise(p_uid uuid, p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.matches_anonymous_expertise(p_uid uuid, p_request_id uuid) TO service_role;


--
-- Name: FUNCTION normalize_contact_phone(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_contact_phone() TO anon;
GRANT ALL ON FUNCTION public.normalize_contact_phone() TO authenticated;
GRANT ALL ON FUNCTION public.normalize_contact_phone() TO service_role;


--
-- Name: FUNCTION normalize_directory_text(input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_directory_text(input text) TO anon;
GRANT ALL ON FUNCTION public.normalize_directory_text(input text) TO authenticated;
GRANT ALL ON FUNCTION public.normalize_directory_text(input text) TO service_role;


--
-- Name: FUNCTION normalize_for_canonical(input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_for_canonical(input text) TO anon;
GRANT ALL ON FUNCTION public.normalize_for_canonical(input text) TO authenticated;
GRANT ALL ON FUNCTION public.normalize_for_canonical(input text) TO service_role;


--
-- Name: FUNCTION normalize_phone_number(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_phone_number() TO anon;
GRANT ALL ON FUNCTION public.normalize_phone_number() TO authenticated;
GRANT ALL ON FUNCTION public.normalize_phone_number() TO service_role;


--
-- Name: FUNCTION normalize_phone_number(phone_input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_phone_number(phone_input text) TO anon;
GRANT ALL ON FUNCTION public.normalize_phone_number(phone_input text) TO authenticated;
GRANT ALL ON FUNCTION public.normalize_phone_number(phone_input text) TO service_role;


--
-- Name: FUNCTION normalize_profile_handle(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_profile_handle() TO anon;
GRANT ALL ON FUNCTION public.normalize_profile_handle() TO authenticated;
GRANT ALL ON FUNCTION public.normalize_profile_handle() TO service_role;


--
-- Name: FUNCTION normalize_profile_phone(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_profile_phone() TO anon;
GRANT ALL ON FUNCTION public.normalize_profile_phone() TO authenticated;
GRANT ALL ON FUNCTION public.normalize_profile_phone() TO service_role;


--
-- Name: FUNCTION normalize_token(t text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_token(t text) TO anon;
GRANT ALL ON FUNCTION public.normalize_token(t text) TO authenticated;
GRANT ALL ON FUNCTION public.normalize_token(t text) TO service_role;


--
-- Name: FUNCTION notify_fyp_request(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_fyp_request() TO anon;
GRANT ALL ON FUNCTION public.notify_fyp_request() TO authenticated;
GRANT ALL ON FUNCTION public.notify_fyp_request() TO service_role;


--
-- Name: FUNCTION notify_guest_contribution(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_guest_contribution() TO anon;
GRANT ALL ON FUNCTION public.notify_guest_contribution() TO authenticated;
GRANT ALL ON FUNCTION public.notify_guest_contribution() TO service_role;


--
-- Name: FUNCTION notify_recommendation_vote(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_recommendation_vote() TO anon;
GRANT ALL ON FUNCTION public.notify_recommendation_vote() TO authenticated;
GRANT ALL ON FUNCTION public.notify_recommendation_vote() TO service_role;


--
-- Name: FUNCTION refresh_contact_matches(user_id_param uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_contact_matches(user_id_param uuid) TO anon;
GRANT ALL ON FUNCTION public.refresh_contact_matches(user_id_param uuid) TO authenticated;
GRANT ALL ON FUNCTION public.refresh_contact_matches(user_id_param uuid) TO service_role;


--
-- Name: FUNCTION refresh_master_directory(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_master_directory() TO anon;
GRANT ALL ON FUNCTION public.refresh_master_directory() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_master_directory() TO service_role;


--
-- Name: FUNCTION refresh_master_directory_on_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_master_directory_on_change() TO anon;
GRANT ALL ON FUNCTION public.refresh_master_directory_on_change() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_master_directory_on_change() TO service_role;


--
-- Name: FUNCTION reject_closed_request_contributions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reject_closed_request_contributions() TO anon;
GRANT ALL ON FUNCTION public.reject_closed_request_contributions() TO authenticated;
GRANT ALL ON FUNCTION public.reject_closed_request_contributions() TO service_role;


--
-- Name: FUNCTION request_is_exhausted(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.request_is_exhausted(p_request_id uuid) TO anon;
GRANT ALL ON FUNCTION public.request_is_exhausted(p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.request_is_exhausted(p_request_id uuid) TO service_role;


--
-- Name: FUNCTION request_response_threshold(p_category text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.request_response_threshold(p_category text) TO anon;
GRANT ALL ON FUNCTION public.request_response_threshold(p_category text) TO authenticated;
GRANT ALL ON FUNCTION public.request_response_threshold(p_category text) TO service_role;


--
-- Name: FUNCTION resolve_preferred_term(input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.resolve_preferred_term(input text) TO anon;
GRANT ALL ON FUNCTION public.resolve_preferred_term(input text) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_preferred_term(input text) TO service_role;


--
-- Name: FUNCTION search_directory_pool_items(p_list_id uuid, p_query text, p_threshold double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_directory_pool_items(p_list_id uuid, p_query text, p_threshold double precision) TO anon;
GRANT ALL ON FUNCTION public.search_directory_pool_items(p_list_id uuid, p_query text, p_threshold double precision) TO authenticated;
GRANT ALL ON FUNCTION public.search_directory_pool_items(p_list_id uuid, p_query text, p_threshold double precision) TO service_role;


--
-- Name: FUNCTION search_similar_recommendations(search_term text, req_id uuid, similarity_threshold double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_similar_recommendations(search_term text, req_id uuid, similarity_threshold double precision) TO anon;
GRANT ALL ON FUNCTION public.search_similar_recommendations(search_term text, req_id uuid, similarity_threshold double precision) TO authenticated;
GRANT ALL ON FUNCTION public.search_similar_recommendations(search_term text, req_id uuid, similarity_threshold double precision) TO service_role;


--
-- Name: FUNCTION share_link_matches(p_link_id uuid, p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.share_link_matches(p_link_id uuid, p_request_id uuid) TO anon;
GRANT ALL ON FUNCTION public.share_link_matches(p_link_id uuid, p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.share_link_matches(p_link_id uuid, p_request_id uuid) TO service_role;


--
-- Name: FUNCTION sync_directory_list_edits(p_list_id uuid, p_new_title text, p_new_category text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_directory_list_edits(p_list_id uuid, p_new_title text, p_new_category text) TO anon;
GRANT ALL ON FUNCTION public.sync_directory_list_edits(p_list_id uuid, p_new_title text, p_new_category text) TO authenticated;
GRANT ALL ON FUNCTION public.sync_directory_list_edits(p_list_id uuid, p_new_title text, p_new_category text) TO service_role;


--
-- Name: FUNCTION sync_is_verified_with_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_is_verified_with_status() TO anon;
GRANT ALL ON FUNCTION public.sync_is_verified_with_status() TO authenticated;
GRANT ALL ON FUNCTION public.sync_is_verified_with_status() TO service_role;


--
-- Name: FUNCTION tokenize_text(t text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tokenize_text(t text) TO anon;
GRANT ALL ON FUNCTION public.tokenize_text(t text) TO authenticated;
GRANT ALL ON FUNCTION public.tokenize_text(t text) TO service_role;


--
-- Name: FUNCTION update_directory_item_vote_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_directory_item_vote_count() TO anon;
GRANT ALL ON FUNCTION public.update_directory_item_vote_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_directory_item_vote_count() TO service_role;


--
-- Name: FUNCTION update_guest_recommendation_merge(_guest_contribution_id uuid, _recommendation_id text, _vote_count integer, _merged_into_id text, _merged_into_text text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_guest_recommendation_merge(_guest_contribution_id uuid, _recommendation_id text, _vote_count integer, _merged_into_id text, _merged_into_text text) TO anon;
GRANT ALL ON FUNCTION public.update_guest_recommendation_merge(_guest_contribution_id uuid, _recommendation_id text, _vote_count integer, _merged_into_id text, _merged_into_text text) TO authenticated;
GRANT ALL ON FUNCTION public.update_guest_recommendation_merge(_guest_contribution_id uuid, _recommendation_id text, _vote_count integer, _merged_into_id text, _merged_into_text text) TO service_role;


--
-- Name: FUNCTION update_matched_contacts(user_id_input uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_matched_contacts(user_id_input uuid) TO anon;
GRANT ALL ON FUNCTION public.update_matched_contacts(user_id_input uuid) TO authenticated;
GRANT ALL ON FUNCTION public.update_matched_contacts(user_id_input uuid) TO service_role;


--
-- Name: FUNCTION update_recommendation_vote_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_recommendation_vote_count() TO anon;
GRANT ALL ON FUNCTION public.update_recommendation_vote_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_recommendation_vote_count() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION user_expertise_tokens(p_uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.user_expertise_tokens(p_uid uuid) TO anon;
GRANT ALL ON FUNCTION public.user_expertise_tokens(p_uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_expertise_tokens(p_uid uuid) TO service_role;


--
-- Name: FUNCTION user_in_direct_audience(p_uid uuid, p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.user_in_direct_audience(p_uid uuid, p_request_id uuid) TO anon;
GRANT ALL ON FUNCTION public.user_in_direct_audience(p_uid uuid, p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_in_direct_audience(p_uid uuid, p_request_id uuid) TO service_role;


--
-- Name: FUNCTION user_location_tokens(p_uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.user_location_tokens(p_uid uuid) TO anon;
GRANT ALL ON FUNCTION public.user_location_tokens(p_uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_location_tokens(p_uid uuid) TO service_role;


--
-- Name: FUNCTION validate_authenticated_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_authenticated_user() TO anon;
GRANT ALL ON FUNCTION public.validate_authenticated_user() TO authenticated;
GRANT ALL ON FUNCTION public.validate_authenticated_user() TO service_role;


--
-- Name: FUNCTION validate_contact_data(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_contact_data() TO anon;
GRANT ALL ON FUNCTION public.validate_contact_data() TO authenticated;
GRANT ALL ON FUNCTION public.validate_contact_data() TO service_role;


--
-- Name: TABLE anonymous_handles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.anonymous_handles TO anon;
GRANT ALL ON TABLE public.anonymous_handles TO authenticated;
GRANT ALL ON TABLE public.anonymous_handles TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE recommendation_clusters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recommendation_clusters TO anon;
GRANT ALL ON TABLE public.recommendation_clusters TO authenticated;
GRANT ALL ON TABLE public.recommendation_clusters TO service_role;


--
-- Name: TABLE request_responses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.request_responses TO anon;
GRANT ALL ON TABLE public.request_responses TO authenticated;
GRANT ALL ON TABLE public.request_responses TO service_role;


--
-- Name: TABLE response_recommendations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.response_recommendations TO anon;
GRANT ALL ON TABLE public.response_recommendations TO authenticated;
GRANT ALL ON TABLE public.response_recommendations TO service_role;


--
-- Name: TABLE cluster_details; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cluster_details TO anon;
GRANT ALL ON TABLE public.cluster_details TO authenticated;
GRANT ALL ON TABLE public.cluster_details TO service_role;


--
-- Name: TABLE colleges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.colleges TO anon;
GRANT ALL ON TABLE public.colleges TO authenticated;
GRANT ALL ON TABLE public.colleges TO service_role;


--
-- Name: TABLE contact_access_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contact_access_logs TO anon;
GRANT ALL ON TABLE public.contact_access_logs TO authenticated;
GRANT ALL ON TABLE public.contact_access_logs TO service_role;


--
-- Name: TABLE contact_imports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contact_imports TO anon;
GRANT ALL ON TABLE public.contact_imports TO authenticated;
GRANT ALL ON TABLE public.contact_imports TO service_role;


--
-- Name: TABLE directory_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.directory_entries TO anon;
GRANT ALL ON TABLE public.directory_entries TO authenticated;
GRANT ALL ON TABLE public.directory_entries TO service_role;


--
-- Name: TABLE directory_preferred_terms; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.directory_preferred_terms TO anon;
GRANT ALL ON TABLE public.directory_preferred_terms TO authenticated;
GRANT ALL ON TABLE public.directory_preferred_terms TO service_role;


--
-- Name: TABLE directory_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.directory_votes TO anon;
GRANT ALL ON TABLE public.directory_votes TO authenticated;
GRANT ALL ON TABLE public.directory_votes TO service_role;


--
-- Name: TABLE friend_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.friend_requests TO anon;
GRANT ALL ON TABLE public.friend_requests TO authenticated;
GRANT ALL ON TABLE public.friend_requests TO service_role;


--
-- Name: TABLE friend_suggestions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.friend_suggestions TO anon;
GRANT ALL ON TABLE public.friend_suggestions TO authenticated;
GRANT ALL ON TABLE public.friend_suggestions TO service_role;


--
-- Name: TABLE friendships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.friendships TO anon;
GRANT ALL ON TABLE public.friendships TO authenticated;
GRANT ALL ON TABLE public.friendships TO service_role;


--
-- Name: TABLE group_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_members TO anon;
GRANT ALL ON TABLE public.group_members TO authenticated;
GRANT ALL ON TABLE public.group_members TO service_role;


--
-- Name: TABLE groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.groups TO anon;
GRANT ALL ON TABLE public.groups TO authenticated;
GRANT ALL ON TABLE public.groups TO service_role;


--
-- Name: TABLE guest_contributions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.guest_contributions TO anon;
GRANT ALL ON TABLE public.guest_contributions TO authenticated;
GRANT ALL ON TABLE public.guest_contributions TO service_role;


--
-- Name: TABLE guest_recommendation_merges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.guest_recommendation_merges TO anon;
GRANT ALL ON TABLE public.guest_recommendation_merges TO authenticated;
GRANT ALL ON TABLE public.guest_recommendation_merges TO service_role;


--
-- Name: TABLE list_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.list_items TO anon;
GRANT ALL ON TABLE public.list_items TO authenticated;
GRANT ALL ON TABLE public.list_items TO service_role;


--
-- Name: TABLE lists; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lists TO anon;
GRANT ALL ON TABLE public.lists TO authenticated;
GRANT ALL ON TABLE public.lists TO service_role;


--
-- Name: TABLE master_directory_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.master_directory_entries TO anon;
GRANT ALL ON TABLE public.master_directory_entries TO authenticated;
GRANT ALL ON TABLE public.master_directory_entries TO service_role;


--
-- Name: TABLE master_directory_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.master_directory_items TO anon;
GRANT ALL ON TABLE public.master_directory_items TO authenticated;
GRANT ALL ON TABLE public.master_directory_items TO service_role;


--
-- Name: TABLE master_directory_lists; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.master_directory_lists TO anon;
GRANT ALL ON TABLE public.master_directory_lists TO authenticated;
GRANT ALL ON TABLE public.master_directory_lists TO service_role;


--
-- Name: TABLE master_directory_lists_view; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.master_directory_lists_view TO anon;
GRANT ALL ON TABLE public.master_directory_lists_view TO authenticated;
GRANT ALL ON TABLE public.master_directory_lists_view TO service_role;


--
-- Name: TABLE master_directory_view; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.master_directory_view TO anon;
GRANT ALL ON TABLE public.master_directory_view TO authenticated;
GRANT ALL ON TABLE public.master_directory_view TO service_role;


--
-- Name: TABLE master_directory_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.master_directory_votes TO anon;
GRANT ALL ON TABLE public.master_directory_votes TO authenticated;
GRANT ALL ON TABLE public.master_directory_votes TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE rate_limit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rate_limit_log TO anon;
GRANT ALL ON TABLE public.rate_limit_log TO authenticated;
GRANT ALL ON TABLE public.rate_limit_log TO service_role;


--
-- Name: TABLE recommendation_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recommendation_votes TO anon;
GRANT ALL ON TABLE public.recommendation_votes TO authenticated;
GRANT ALL ON TABLE public.recommendation_votes TO service_role;


--
-- Name: TABLE request_anonymous_impressions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.request_anonymous_impressions TO anon;
GRANT ALL ON TABLE public.request_anonymous_impressions TO authenticated;
GRANT ALL ON TABLE public.request_anonymous_impressions TO service_role;


--
-- Name: TABLE request_forwards; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.request_forwards TO anon;
GRANT ALL ON TABLE public.request_forwards TO authenticated;
GRANT ALL ON TABLE public.request_forwards TO service_role;


--
-- Name: TABLE request_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.request_votes TO anon;
GRANT ALL ON TABLE public.request_votes TO authenticated;
GRANT ALL ON TABLE public.request_votes TO service_role;


--
-- Name: TABLE requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.requests TO anon;
GRANT ALL ON TABLE public.requests TO authenticated;
GRANT ALL ON TABLE public.requests TO service_role;


--
-- Name: TABLE search_analytics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.search_analytics TO anon;
GRANT ALL ON TABLE public.search_analytics TO authenticated;
GRANT ALL ON TABLE public.search_analytics TO service_role;


--
-- Name: TABLE share_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.share_links TO anon;
GRANT ALL ON TABLE public.share_links TO authenticated;
GRANT ALL ON TABLE public.share_links TO service_role;


--
-- Name: TABLE temp_waitlist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.temp_waitlist TO anon;
GRANT ALL ON TABLE public.temp_waitlist TO authenticated;
GRANT ALL ON TABLE public.temp_waitlist TO service_role;


--
-- Name: TABLE user_expertise; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_expertise TO anon;
GRANT ALL ON TABLE public.user_expertise TO authenticated;
GRANT ALL ON TABLE public.user_expertise TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict eUqkptkGqFkVSm7gdVaDLPGAgJDuNl40PKtkbchshPAlNfJ9w31Ehb1oryzyVxK

