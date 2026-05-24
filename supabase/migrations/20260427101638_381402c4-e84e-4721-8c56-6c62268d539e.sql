CREATE OR REPLACE FUNCTION public.update_guest_recommendation_merge(
  _guest_contribution_id uuid,
  _recommendation_id text,
  _vote_count integer,
  _merged_into_id text DEFAULT NULL,
  _merged_into_text text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_id uuid;
BEGIN
  SELECT gc.request_id
  INTO _request_id
  FROM public.guest_contributions gc
  WHERE gc.id = _guest_contribution_id;

  IF _request_id IS NULL THEN
    RAISE EXCEPTION 'Guest contribution not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.id = _request_id
      AND r.creator_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the request creator can merge guest recommendations';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.guest_contributions gc,
      jsonb_array_elements(gc.recommendations) AS item
    WHERE gc.id = _guest_contribution_id
      AND item->>'id' = _recommendation_id
  ) THEN
    RAISE EXCEPTION 'Guest recommendation not found';
  END IF;

  UPDATE public.guest_contributions gc
  SET recommendations = COALESCE((
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id' = _recommendation_id THEN
          jsonb_set(
            jsonb_set(
              jsonb_set(
                item,
                '{vote_count}',
                to_jsonb(GREATEST(_vote_count, 0)),
                true
              ),
              '{merged_into_id}',
              to_jsonb(_merged_into_id),
              true
            ),
            '{merged_into_text}',
            to_jsonb(_merged_into_text),
            true
          )
        ELSE item
      END
      ORDER BY ordinality
    )
    FROM jsonb_array_elements(gc.recommendations) WITH ORDINALITY AS rec(item, ordinality)
  ), '[]'::jsonb)
  WHERE gc.id = _guest_contribution_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest recommendation update failed';
  END IF;
END;
$$;