-- Create a SECURITY DEFINER function to match contacts by phone number
-- This bypasses RLS to allow contact matching across all profiles
CREATE OR REPLACE FUNCTION match_contacts_by_phone(user_id_input UUID)
RETURNS TABLE (
  contact_id UUID,
  contact_phone TEXT,
  matched_user_id UUID,
  matched_profile_name TEXT,
  matched_profile_handle TEXT,
  matched_phone TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ci.id as contact_id,
    ci.contact_phone as contact_phone,
    p.id as matched_user_id,
    p.full_name as matched_profile_name,
    p.handle as matched_profile_handle,
    p.phone_number as matched_phone
  FROM contact_imports ci
  CROSS JOIN profiles p
  WHERE ci.user_id = user_id_input
    AND p.id != user_id_input  -- Don't match with self
    AND p.phone_number IS NOT NULL
    AND ci.contact_phone IS NOT NULL
    AND RIGHT(REGEXP_REPLACE(ci.contact_phone, '[^0-9]', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(p.phone_number, '[^0-9]', '', 'g'), 10);
END;
$$;