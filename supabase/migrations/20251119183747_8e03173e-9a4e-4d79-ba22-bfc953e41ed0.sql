-- Create helper function for edge function to find profiles by normalized phone
CREATE OR REPLACE FUNCTION public.find_profile_by_normalized_phone(
  input_phone TEXT,
  exclude_user_id UUID
)
RETURNS TABLE(id UUID, full_name TEXT, handle TEXT, phone_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name, p.handle, p.phone_number
  FROM profiles p
  WHERE public.normalize_phone_number(p.phone_number) = public.normalize_phone_number(input_phone)
    AND p.id != exclude_user_id
    AND p.full_name IS NOT NULL
    AND p.handle IS NOT NULL
  LIMIT 1;
END;
$$;