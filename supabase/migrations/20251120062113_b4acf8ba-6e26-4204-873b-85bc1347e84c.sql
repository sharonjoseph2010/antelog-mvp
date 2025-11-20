-- Drop the previous version and create refined functions
DROP FUNCTION IF EXISTS match_contacts_by_phone(UUID);

-- Function to match contacts by phone (bypasses RLS) - returns just IDs
CREATE OR REPLACE FUNCTION match_contacts_by_phone(user_id_input UUID)
RETURNS TABLE (
  contact_id UUID,
  matched_user_id UUID
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
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

-- Function to update matched contacts (does UPDATE server-side)
CREATE OR REPLACE FUNCTION update_matched_contacts(user_id_input UUID)
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
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