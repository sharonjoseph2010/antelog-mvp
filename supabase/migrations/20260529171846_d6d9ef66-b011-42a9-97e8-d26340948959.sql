ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_for_you_visit TIMESTAMP WITH TIME ZONE;

CREATE OR REPLACE FUNCTION public.has_fyp_unread()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.request_anonymous_impressions i
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE i.recipient_id = auth.uid()
      AND (p.last_for_you_visit IS NULL OR i.surfaced_at > p.last_for_you_visit)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_fyp_unread() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_for_you_visited()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET last_for_you_visit = now() WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.mark_for_you_visited() TO authenticated;