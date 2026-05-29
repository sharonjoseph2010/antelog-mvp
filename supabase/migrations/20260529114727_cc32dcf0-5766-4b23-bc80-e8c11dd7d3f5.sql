
-- 1) Trigger to create an anonymous notification when a request is routed to a user's FYP
CREATE OR REPLACE FUNCTION public.notify_fyp_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_notify_fyp_request ON public.request_anonymous_impressions;
CREATE TRIGGER trg_notify_fyp_request
AFTER INSERT ON public.request_anonymous_impressions
FOR EACH ROW
EXECUTE FUNCTION public.notify_fyp_request();

-- 2) RPC for clients to learn the newest surfaced_at timestamp of pending FYP impressions
CREATE OR REPLACE FUNCTION public.get_fyp_latest_surfaced_at()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT max(rai.surfaced_at)
  FROM public.request_anonymous_impressions rai
  WHERE rai.recipient_id = auth.uid()
    AND rai.responded = false
    AND rai.dismissed_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_fyp_latest_surfaced_at() TO authenticated;
