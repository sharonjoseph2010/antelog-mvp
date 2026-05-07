-- Centralized identity visibility helper for anonymous expertise sealing.
-- Reveal identity only when viewer and target share a direct trust relationship
-- in the context of the given request.
CREATE OR REPLACE FUNCTION public.can_reveal_identity(
  p_viewer_id uuid,
  p_request_id uuid,
  p_target_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

GRANT EXECUTE ON FUNCTION public.can_reveal_identity(uuid, uuid, uuid) TO authenticated, anon;