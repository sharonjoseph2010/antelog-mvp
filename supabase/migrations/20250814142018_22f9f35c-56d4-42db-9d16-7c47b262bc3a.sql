-- Fix viral matching issues

-- First, let's normalize phone numbers in existing contacts
UPDATE contact_imports 
SET contact_phone = CASE 
  WHEN contact_phone IS NOT NULL AND contact_phone != '' THEN
    CASE 
      WHEN contact_phone ~ '^\+' THEN contact_phone
      WHEN contact_phone ~ '^91' THEN '+' || contact_phone
      WHEN contact_phone ~ '^[0-9]{10}$' THEN '+91' || contact_phone
      ELSE '+91' || REGEXP_REPLACE(contact_phone, '[^0-9]', '', 'g')
    END
  ELSE contact_phone
END
WHERE contact_phone IS NOT NULL AND contact_phone != '';

-- Normalize phone numbers in profiles
UPDATE profiles 
SET phone_number = CASE 
  WHEN phone_number IS NOT NULL AND phone_number != '' THEN
    CASE 
      WHEN phone_number ~ '^\+' THEN phone_number
      WHEN phone_number ~ '^91' THEN '+' || phone_number
      WHEN phone_number ~ '^[0-9]{10}$' THEN '+91' || phone_number
      ELSE '+91' || REGEXP_REPLACE(phone_number, '[^0-9]', '', 'g')
    END
  ELSE phone_number
END
WHERE phone_number IS NOT NULL AND phone_number != '';

-- Drop existing trigger
DROP TRIGGER IF EXISTS trigger_create_mutual_friend_suggestions ON profiles;
DROP TRIGGER IF EXISTS trigger_mutual_friend_suggestions ON profiles;

-- Recreate the function with better logic
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
  -- When a new profile is created or phone number is updated
  IF NEW.phone_number IS NOT NULL AND NEW.phone_number != '' THEN
    -- Find contacts who have this phone number (excluding self)
    FOR contact_rec IN 
      SELECT ci.user_id, ci.contact_name, ci.contact_email
      FROM contact_imports ci
      WHERE ci.contact_phone = NEW.phone_number 
      AND ci.user_id != NEW.id  -- CRITICAL: Don't match with self
      AND NOT ci.is_matched
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
         CONCAT(COALESCE(contact_rec.contact_name, 'A contact'), ' just joined Antelog'), NEW.id),
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
      WHERE ci.contact_email = user_email
      AND ci.user_id != NEW.id  -- CRITICAL: Don't match with self
      AND NOT ci.is_matched
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
         CONCAT(COALESCE(contact_rec.contact_name, 'A contact'), ' just joined Antelog'), NEW.id),
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

-- Create the trigger for INSERT and UPDATE on phone_number
CREATE TRIGGER trigger_create_mutual_friend_suggestions
  AFTER INSERT OR UPDATE OF phone_number ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_mutual_friend_suggestions();

-- Clean up any existing self-suggestions (where user suggests themselves)
DELETE FROM friend_suggestions 
WHERE user_id = suggested_user_id;

-- Add phone number normalization trigger for new contact imports
CREATE OR REPLACE FUNCTION normalize_phone_number()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.contact_phone IS NOT NULL AND NEW.contact_phone != '' THEN
    NEW.contact_phone := CASE 
      WHEN NEW.contact_phone ~ '^\+' THEN NEW.contact_phone
      WHEN NEW.contact_phone ~ '^91' THEN '+' || NEW.contact_phone
      WHEN NEW.contact_phone ~ '^[0-9]{10}$' THEN '+91' || NEW.contact_phone
      ELSE '+91' || REGEXP_REPLACE(NEW.contact_phone, '[^0-9]', '', 'g')
    END;
  END IF;
  RETURN NEW;
END;
$function$;

-- Add trigger to normalize phone numbers on contact imports
CREATE TRIGGER normalize_contact_phone
  BEFORE INSERT OR UPDATE ON contact_imports
  FOR EACH ROW
  EXECUTE FUNCTION normalize_phone_number();