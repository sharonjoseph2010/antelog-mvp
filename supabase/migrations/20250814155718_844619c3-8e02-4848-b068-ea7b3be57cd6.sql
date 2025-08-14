-- Create trigger to call the mutual friend suggestions function
-- This trigger will fire when profiles are inserted or updated

CREATE TRIGGER trigger_create_mutual_friend_suggestions
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_mutual_friend_suggestions();

-- Also create a trigger for when contacts are imported
-- This will help create suggestions when new contacts are added for existing users

CREATE OR REPLACE FUNCTION public.check_new_contact_matches()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  matching_profile RECORD;
  suggestion_exists BOOLEAN;
BEGIN
  -- Only proceed if this contact has a phone number and isn't already matched
  IF NEW.contact_phone IS NOT NULL AND NEW.contact_phone != '' AND NOT NEW.is_matched THEN
    
    -- Find profiles with matching phone numbers (excluding the contact owner)
    FOR matching_profile IN 
      SELECT p.id, p.full_name, p.handle
      FROM profiles p
      WHERE p.phone_number = NEW.contact_phone 
      AND p.id != NEW.user_id  -- Don't match with self
      AND p.full_name IS NOT NULL 
      AND p.handle IS NOT NULL
    LOOP
      -- Check if suggestion already exists
      SELECT EXISTS(
        SELECT 1 FROM friend_suggestions 
        WHERE user_id = NEW.user_id 
        AND suggested_user_id = matching_profile.id
      ) INTO suggestion_exists;
      
      -- Create mutual suggestions if they don't exist
      IF NOT suggestion_exists THEN
        -- Suggestion for contact owner about the matched user
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (NEW.user_id, matching_profile.id, 'phone', NEW.contact_phone);
        
        -- Suggestion for matched user about contact owner
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (matching_profile.id, NEW.user_id, 'phone', NEW.contact_phone);
        
        -- Create notifications for both users
        INSERT INTO notifications (user_id, type, title, message, related_user_id)
        VALUES 
        (NEW.user_id, 'contact_joined', 'Found a connection!', 
         CONCAT(COALESCE(matching_profile.full_name, 'Someone'), ' from your contacts is on Antelog'), matching_profile.id),
        (matching_profile.id, 'contact_joined', 'Someone from your contacts joined!', 
         CONCAT(COALESCE(NEW.contact_name, 'A contact'), ' just joined Antelog'), NEW.user_id);
      END IF;
      
      -- Mark contact as matched
      NEW.is_matched := true;
      NEW.matched_user_id := matching_profile.id;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for contact imports
CREATE TRIGGER trigger_check_new_contact_matches
  BEFORE INSERT ON public.contact_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.check_new_contact_matches();