-- ============================================================================
-- SECURITY: rate limiting infrastructure (finding #10)
-- Backs the _shared/rateLimit.ts helper used by the edge functions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,          -- usually the caller's user id
  action text NOT NULL,       -- function / operation name
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_log_lookup
  ON public.rate_limit_log (key, action, created_at DESC);

-- Locked down: only the service role (edge functions) touches this table.
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Sliding-window check + record. Returns TRUE if the call is allowed.
-- SECURITY DEFINER so it works under RLS; only granted to service_role.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key text,
  _action text,
  _limit int,
  _window_seconds int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.check_rate_limit(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) TO service_role;
