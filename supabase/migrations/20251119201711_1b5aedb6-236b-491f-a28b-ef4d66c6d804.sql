-- Add detailed debug logging to refresh_contact_matches function
CREATE OR REPLACE FUNCTION public.refresh_contact_matches(user_id_param uuid DEFAULT NULL::uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Starting contact matching for user: %', target_user_id;
  RAISE NOTICE '========================================';
  
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
    
    RAISE NOTICE '----------------------------------------';
    RAISE NOTICE 'Checking contact: "%"', contact_record.contact_name;
    RAISE NOTICE '  Original phone: %', contact_record.contact_phone;
    RAISE NOTICE '  Normalized phone: %', normalized_contact_phone;
    RAISE NOTICE '  Currently matched: %', contact_record.is_matched;
    RAISE NOTICE '  Current matched_user_id: %', contact_record.matched_user_id;
    
    -- Try to find matching profile
    FOR profile_record IN
      SELECT p.id, p.phone_number, p.handle, p.full_name
      FROM profiles p
      WHERE p.phone_number IS NOT NULL
      AND p.id != target_user_id  -- Don't match with self
      AND p.full_name IS NOT NULL
      AND p.handle IS NOT NULL
      ORDER BY p.handle
    LOOP
      -- Normalize profile phone
      normalized_profile_phone := public.normalize_phone_number(profile_record.phone_number);
      
      RAISE NOTICE '  Comparing with profile: @% (%)', profile_record.handle, profile_record.full_name;
      RAISE NOTICE '    Profile original phone: %', profile_record.phone_number;
      RAISE NOTICE '    Profile normalized phone: %', normalized_profile_phone;
      RAISE NOTICE '    Comparison: "%" = "%" ? %', 
        normalized_contact_phone, 
        normalized_profile_phone, 
        (normalized_contact_phone = normalized_profile_phone);
      
      -- Check if phones match
      IF normalized_contact_phone = normalized_profile_phone THEN
        RAISE NOTICE '  ✓ MATCH FOUND! Contact "%" matches profile @% (ID: %)', 
          contact_record.contact_name, profile_record.handle, profile_record.id;
        
        -- Update contact with match
        UPDATE contact_imports
        SET is_matched = true,
            matched_user_id = profile_record.id,
            updated_at = now()
        WHERE id = contact_record.id;
        
        RAISE NOTICE '  Database updated: is_matched=true, matched_user_id=%', profile_record.id;
        
        matches_found := matches_found + 1;
        EXIT; -- Found match, stop checking other profiles
      END IF;
    END LOOP;
    
    -- If no match found and was previously matched, clear it
    IF NOT FOUND AND contact_record.is_matched THEN
      RAISE NOTICE '  ✗ No match found, clearing previous match for: %', contact_record.contact_name;
      
      UPDATE contact_imports
      SET is_matched = false,
          matched_user_id = NULL,
          updated_at = now()
      WHERE id = contact_record.id;
      
      RAISE NOTICE '  Database updated: is_matched=false, matched_user_id=NULL';
    ELSIF NOT FOUND THEN
      RAISE NOTICE '  ✗ No match found for: %', contact_record.contact_name;
    END IF;
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Contact matching complete';
  RAISE NOTICE '  Contacts processed: %', contacts_processed;
  RAISE NOTICE '  Matches found: %', matches_found;
  RAISE NOTICE '========================================';
  
  RETURN json_build_object(
    'success', true,
    'contacts_processed', contacts_processed,
    'matches_found', matches_found
  );
END;
$function$;