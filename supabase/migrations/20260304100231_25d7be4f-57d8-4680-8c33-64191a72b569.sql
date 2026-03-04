
CREATE OR REPLACE FUNCTION public.notify_recommendation_vote()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
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
    INSERT INTO notifications (user_id, type, title, message, related_user_id)
    VALUES (
      v_responder_id,
      'recommendation_voted',
      'Your recommendation was upvoted',
      COALESCE(v_voter_handle, 'Someone') || ' upvoted your recommendation "' || left(v_rec_text, 50) || '" in request "' || left(v_request_title, 50) || '"',
      NEW.user_id
    );
  END IF;

  -- 5. Notify requester (skip if voter=requester or requester=recommender to avoid duplicate)
  IF v_creator_id IS NOT NULL
     AND NEW.user_id != v_creator_id
     AND v_creator_id != v_responder_id THEN
    INSERT INTO notifications (user_id, type, title, message, related_user_id)
    VALUES (
      v_creator_id,
      'recommendation_voted',
      'Vote on your request',
      'Someone voted on a response to your request "' || left(v_request_title, 50) || '"',
      NEW.user_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_notify_recommendation_vote ON recommendation_votes;
CREATE TRIGGER trg_notify_recommendation_vote
  AFTER INSERT ON recommendation_votes
  FOR EACH ROW
  EXECUTE FUNCTION notify_recommendation_vote();
