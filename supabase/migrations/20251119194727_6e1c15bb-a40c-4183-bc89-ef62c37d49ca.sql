-- Create RPC function for contact matching with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.refresh_contact_matches(user_id_param UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contact_record RECORD;
  profile_record RECORD;
  matches_found INTEGER := 0;
  contacts_processed INTEGER := 0;
  normalized_contact_phone TEXT;
  normalized_profile_phone TEXT;
  target_user_id UUID;
BEGIN
  -- Use provided user_id or fall back to auth.uid()
  target_user_id := COALESCE(user_id_param, auth.uid());
  
  -- Validate authenticated user
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;
  
  -- Process each contact for the user
  FOR contact_record IN 
    SELECT id, user_id, contact_name, contact_phone, is_matched, matched_user_id
    FROM contact_imports
    WHERE user_id = target_user_id
    AND contact_phone IS NOT NULL
    AND contact_phone != ''
  LOOP
    contacts_processed := contacts_processed + 1;
    
    -- Normalize the contact phone
    normalized_contact_phone := public.normalize_phone_number(contact_record.contact_phone);
    
    RAISE NOTICE 'Processing contact: %, phone: %, normalized: %', 
      contact_record.contact_name, contact_record.contact_phone, normalized_contact_phone;
    
    -- Try to find matching profile
    FOR profile_record IN
      SELECT p.id, p.phone_number, p.handle, p.full_name
      FROM profiles p
      WHERE p.phone_number IS NOT NULL
      AND p.id != target_user_id  -- Don't match with self
      AND p.full_name IS NOT NULL
      AND p.handle IS NOT NULL
    LOOP
      -- Normalize profile phone
      normalized_profile_phone := public.normalize_phone_number(profile_record.phone_number);
      
      -- Check if phones match
      IF normalized_contact_phone = normalized_profile_phone THEN
        RAISE NOTICE 'Match found! Contact: % -> Profile: % (@%)', 
          contact_record.contact_name, profile_record.full_name, profile_record.handle;
        
        -- Update contact with match
        UPDATE contact_imports
        SET is_matched = true,
            matched_user_id = profile_record.id,
            updated_at = now()
        WHERE id = contact_record.id;
        
        matches_found := matches_found + 1;
        EXIT; -- Found match, stop checking other profiles
      END IF;
    END LOOP;
    
    -- If no match found and was previously matched, clear it
    IF NOT FOUND AND contact_record.is_matched THEN
      RAISE NOTICE 'No match found, clearing previous match for: %', contact_record.contact_name;
      
      UPDATE contact_imports
      SET is_matched = false,
          matched_user_id = NULL,
          updated_at = now()
      WHERE id = contact_record.id;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Contact matching complete: % processed, % matches found', contacts_processed, matches_found;
  
  RETURN json_build_object(
    'success', true,
    'contacts_processed', contacts_processed,
    'matches_found', matches_found
  );
END;
$$;