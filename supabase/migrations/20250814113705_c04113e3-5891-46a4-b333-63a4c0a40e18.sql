-- Enhanced trigger function for viral matching
CREATE OR REPLACE FUNCTION public.create_mutual_friend_suggestions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  contact_rec RECORD;
  suggestion_exists BOOLEAN;
BEGIN
  -- When a new profile is created or phone number is updated
  IF NEW.phone_number IS NOT NULL THEN
    -- Find contacts who have this phone number
    FOR contact_rec IN 
      SELECT ci.user_id, ci.contact_name, ci.contact_email
      FROM public.contact_imports ci
      WHERE ci.contact_phone = NEW.phone_number 
      AND ci.user_id != NEW.id
      AND NOT ci.is_matched
    LOOP
      -- Check if suggestion already exists
      SELECT EXISTS(
        SELECT 1 FROM public.friend_suggestions 
        WHERE user_id = contact_rec.user_id 
        AND suggested_user_id = NEW.id
      ) INTO suggestion_exists;
      
      -- Create mutual suggestions if they don't exist
      IF NOT suggestion_exists THEN
        -- Suggestion for contact owner about new user
        INSERT INTO public.friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (contact_rec.user_id, NEW.id, 'phone', NEW.phone_number);
        
        -- Suggestion for new user about contact owner (reverse suggestion)
        INSERT INTO public.friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (NEW.id, contact_rec.user_id, 'phone', NEW.phone_number);
        
        -- Create notifications for BOTH users
        INSERT INTO public.notifications (user_id, type, title, message, related_user_id)
        VALUES 
        (contact_rec.user_id, 'contact_joined', 'Someone from your contacts joined!', 
         CONCAT(contact_rec.contact_name, ' just joined Antelog'), NEW.id),
        (NEW.id, 'contact_joined', 'Found a connection!', 
         'Someone who has your contact just connected on Antelog', contact_rec.user_id);
      END IF;
      
      -- Mark contact as matched
      UPDATE public.contact_imports 
      SET is_matched = true, matched_user_id = NEW.id
      WHERE user_id = contact_rec.user_id AND contact_phone = NEW.phone_number;
    END LOOP;
  END IF;
  
  -- Also check email matches
  IF NEW.id IN (SELECT id FROM auth.users) THEN
    -- Get user's email from auth.users
    FOR contact_rec IN 
      SELECT ci.user_id, ci.contact_name, ci.contact_email
      FROM public.contact_imports ci
      WHERE ci.contact_email = (SELECT email FROM auth.users WHERE id = NEW.id)
      AND ci.user_id != NEW.id
      AND NOT ci.is_matched
    LOOP
      -- Check if suggestion already exists
      SELECT EXISTS(
        SELECT 1 FROM public.friend_suggestions 
        WHERE user_id = contact_rec.user_id 
        AND suggested_user_id = NEW.id
      ) INTO suggestion_exists;
      
      -- Create mutual suggestions if they don't exist
      IF NOT suggestion_exists THEN
        -- Suggestion for contact owner about new user
        INSERT INTO public.friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (contact_rec.user_id, NEW.id, 'email', contact_rec.contact_email);
        
        -- Suggestion for new user about contact owner
        INSERT INTO public.friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (NEW.id, contact_rec.user_id, 'email', contact_rec.contact_email);
        
        -- Create notifications for BOTH users
        INSERT INTO public.notifications (user_id, type, title, message, related_user_id)
        VALUES 
        (contact_rec.user_id, 'contact_joined', 'Someone from your contacts joined!', 
         CONCAT(contact_rec.contact_name, ' just joined Antelog'), NEW.id),
        (NEW.id, 'contact_joined', 'Found a connection!', 
         'Someone who has your contact just connected on Antelog', contact_rec.user_id);
      END IF;
      
      -- Mark contact as matched
      UPDATE public.contact_imports 
      SET is_matched = true, matched_user_id = NEW.id
      WHERE user_id = contact_rec.user_id AND contact_email = contact_rec.contact_email;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for profiles table (fires on INSERT and UPDATE)
DROP TRIGGER IF EXISTS trigger_create_mutual_friend_suggestions ON public.profiles;
CREATE TRIGGER trigger_create_mutual_friend_suggestions
  AFTER INSERT OR UPDATE OF phone_number ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_mutual_friend_suggestions();