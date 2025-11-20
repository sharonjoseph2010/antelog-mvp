-- Create function to match new users to existing contacts (reverse matching)
CREATE OR REPLACE FUNCTION match_new_user_to_contacts(
  new_user_id UUID,
  new_user_phone TEXT
)
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
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