
-- Backfill stable UUIDs into existing guest recommendations that don't have an 'id' field
UPDATE guest_contributions
SET recommendations = (
  SELECT jsonb_agg(
    CASE 
      WHEN item->>'id' IS NULL 
      THEN item || jsonb_build_object('id', gen_random_uuid()::text)
      ELSE item
    END
  )
  FROM jsonb_array_elements(recommendations) AS item
)
WHERE recommendations IS NOT NULL
  AND recommendations != '[]'::jsonb;
