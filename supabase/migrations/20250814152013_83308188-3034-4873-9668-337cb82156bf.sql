-- Clean up friend suggestions for users without profiles
DELETE FROM friend_suggestions 
WHERE user_id NOT IN (SELECT id FROM profiles);

-- Also clean up suggestions pointing to users without profiles
DELETE FROM friend_suggestions 
WHERE suggested_user_id NOT IN (SELECT id FROM profiles);

-- Update the mutual friend suggestions function to only create suggestions for users with complete profiles
CREATE OR REPLACE FUNCTION public.create_mutual_friend_suggestions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  contact_rec RECORD;
  suggestion_exists BOOLEAN;
  user_email TEXT;
BEGIN
  -- Only proceed if the user has a complete profile
  IF NEW.full_name IS NULL OR NEW.handle IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- When a new profile is created or phone number is updated
  IF NEW.phone_number IS NOT NULL AND NEW.phone_number != '' THEN
    -- Find contacts who have this phone number (excluding self)
    FOR contact_rec IN 
      SELECT ci.user_id, ci.contact_name, ci.contact_email
      FROM contact_imports ci
      JOIN profiles p ON ci.user_id = p.id  -- Only users with complete profiles
      WHERE ci.contact_phone = NEW.phone_number 
      AND ci.user_id != NEW.id  -- CRITICAL: Don't match with self
      AND NOT ci.is_matched
      AND p.full_name IS NOT NULL 
      AND p.handle IS NOT NULL
    LOOP
      -- Check if suggestion already exists
      SELECT EXISTS(
        SELECT 1 FROM friend_suggestions 
        WHERE user_id = contact_rec.user_id 
        AND suggested_user_id = NEW.id
      ) INTO suggestion_exists;
      
      -- Create mutual suggestions if they don't exist
      IF NOT suggestion_exists THEN
        -- Suggestion for contact owner about new user
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (contact_rec.user_id, NEW.id, 'phone', NEW.phone_number);
        
        -- Suggestion for new user about contact owner (reverse suggestion)
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (NEW.id, contact_rec.user_id, 'phone', NEW.phone_number);
        
        -- Create notifications for BOTH users
        INSERT INTO notifications (user_id, type, title, message, related_user_id)
        VALUES 
        (contact_rec.user_id, 'contact_joined', 'Someone from your contacts joined!', 
         CONCAT(COALESCE(contact_rec.contact_name, NEW.full_name, 'A contact'), ' just joined Antelog'), NEW.id),
        (NEW.id, 'contact_joined', 'Found a connection!', 
         'Someone who has your contact just connected on Antelog', contact_rec.user_id);
      END IF;
      
      -- Mark contact as matched
      UPDATE contact_imports 
      SET is_matched = true, matched_user_id = NEW.id
      WHERE user_id = contact_rec.user_id AND contact_phone = NEW.phone_number;
    END LOOP;
  END IF;
  
  -- Also check email matches (get email from auth.users)
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;
  
  IF user_email IS NOT NULL THEN
    FOR contact_rec IN 
      SELECT ci.user_id, ci.contact_name, ci.contact_email
      FROM contact_imports ci
      JOIN profiles p ON ci.user_id = p.id  -- Only users with complete profiles
      WHERE ci.contact_email = user_email
      AND ci.user_id != NEW.id  -- CRITICAL: Don't match with self
      AND NOT ci.is_matched
      AND p.full_name IS NOT NULL 
      AND p.handle IS NOT NULL
    LOOP
      -- Check if suggestion already exists
      SELECT EXISTS(
        SELECT 1 FROM friend_suggestions 
        WHERE user_id = contact_rec.user_id 
        AND suggested_user_id = NEW.id
      ) INTO suggestion_exists;
      
      -- Create mutual suggestions if they don't exist
      IF NOT suggestion_exists THEN
        -- Suggestion for contact owner about new user
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (contact_rec.user_id, NEW.id, 'email', user_email);
        
        -- Suggestion for new user about contact owner
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (NEW.id, contact_rec.user_id, 'email', user_email);
        
        -- Create notifications for BOTH users
        INSERT INTO notifications (user_id, type, title, message, related_user_id)
        VALUES 
        (contact_rec.user_id, 'contact_joined', 'Someone from your contacts joined!', 
         CONCAT(COALESCE(contact_rec.contact_name, NEW.full_name, 'A contact'), ' just joined Antelog'), NEW.id),
        (NEW.id, 'contact_joined', 'Found a connection!', 
         'Someone who has your contact just connected on Antelog', contact_rec.user_id);
      END IF;
      
      -- Mark contact as matched
      UPDATE contact_imports 
      SET is_matched = true, matched_user_id = NEW.id
      WHERE user_id = contact_rec.user_id AND contact_email = user_email;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;