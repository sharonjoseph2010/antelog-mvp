-- Fix the contact matching trigger to properly set matched_user_id
-- Drop the existing trigger and function with CASCADE
DROP TRIGGER IF EXISTS trigger_check_new_contact_matches ON contact_imports CASCADE;
DROP FUNCTION IF EXISTS check_new_contact_matches() CASCADE;

-- Create improved contact matching function
CREATE OR REPLACE FUNCTION match_contact_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matching_profile RECORD;
BEGIN
  -- Only proceed if contact has a phone number
  IF NEW.contact_phone IS NOT NULL AND NEW.contact_phone != '' THEN
    
    -- Find profile with matching phone number (excluding the contact owner)
    SELECT p.id, p.full_name, p.handle, p.phone_number
    INTO matching_profile
    FROM profiles p
    WHERE p.phone_number = NEW.contact_phone 
    AND p.id != NEW.user_id  -- Don't match with self
    AND p.full_name IS NOT NULL 
    AND p.handle IS NOT NULL
    LIMIT 1;
    
    -- If match found, update the contact record
    IF matching_profile.id IS NOT NULL THEN
      NEW.is_matched := true;
      NEW.matched_user_id := matching_profile.id;
      
      RAISE NOTICE 'Contact matched: contact_phone=%, matched_user_id=%', NEW.contact_phone, matching_profile.id;
    ELSE
      NEW.is_matched := false;
      NEW.matched_user_id := NULL;
      
      RAISE NOTICE 'No match found for contact_phone=%', NEW.contact_phone;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for new contact inserts
CREATE TRIGGER match_contact_on_insert_trigger
BEFORE INSERT ON contact_imports
FOR EACH ROW
EXECUTE FUNCTION match_contact_on_insert();

-- Also create trigger for updates (in case phone number is added later)
CREATE TRIGGER match_contact_on_update_trigger
BEFORE UPDATE ON contact_imports
FOR EACH ROW
WHEN (OLD.contact_phone IS DISTINCT FROM NEW.contact_phone)
EXECUTE FUNCTION match_contact_on_insert();