-- Security Enhancement: Improve Contact Data Protection
-- Fix 1: Add missing RLS policies for friend_suggestions and notifications

-- Add INSERT policy for friend_suggestions (system-only creation)
CREATE POLICY "System can create friend suggestions" 
ON public.friend_suggestions 
FOR INSERT 
WITH CHECK (false); -- Only allow through triggers/functions

-- Add INSERT policy for notifications (system-only creation)  
CREATE POLICY "System can create notifications"
ON public.notifications
FOR INSERT 
WITH CHECK (false); -- Only allow through triggers/functions

-- Add DELETE policy for notifications (users can delete their own)
CREATE POLICY "Users can delete their own notifications"
ON public.notifications
FOR DELETE
USING (auth.uid() = user_id);

-- Fix 2: Create security definer functions to protect contact data access
CREATE OR REPLACE FUNCTION public.get_user_contacts_securely(target_phone TEXT, target_email TEXT DEFAULT NULL)
RETURNS TABLE(
  user_id UUID,
  contact_name TEXT,
  contact_email TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only return contacts that match the provided phone/email
  -- This prevents broad contact data exposure
  RETURN QUERY
  SELECT 
    ci.user_id,
    ci.contact_name,
    ci.contact_email
  FROM contact_imports ci
  JOIN profiles p ON ci.user_id = p.id
  WHERE (ci.contact_phone = target_phone OR ci.contact_email = target_email)
  AND NOT ci.is_matched
  AND p.full_name IS NOT NULL 
  AND p.handle IS NOT NULL;
END;
$$;

-- Fix 3: Create function to hash/anonymize match values
CREATE OR REPLACE FUNCTION public.hash_contact_info(contact_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return a hash instead of the actual contact info for privacy
  RETURN encode(digest(contact_value, 'sha256'), 'hex');
END;
$$;

-- Fix 4: Update contact matching functions to use secure methods
CREATE OR REPLACE FUNCTION public.check_new_contact_matches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matching_profile RECORD;
  suggestion_exists BOOLEAN;
  hashed_match_value TEXT;
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
        -- Hash the phone number for privacy
        hashed_match_value := public.hash_contact_info(NEW.contact_phone);
        
        -- Temporarily allow inserts for system operations
        SET LOCAL row_security = off;
        
        -- Suggestion for contact owner about the matched user
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (NEW.user_id, matching_profile.id, 'phone', hashed_match_value);
        
        -- Suggestion for matched user about contact owner
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (matching_profile.id, NEW.user_id, 'phone', hashed_match_value);
        
        -- Create notifications for both users
        INSERT INTO notifications (user_id, type, title, message, related_user_id)
        VALUES 
        (NEW.user_id, 'contact_joined', 'Found a connection!', 
         CONCAT(COALESCE(matching_profile.full_name, 'Someone'), ' from your contacts is on Antelog'), matching_profile.id),
        (matching_profile.id, 'contact_joined', 'Someone from your contacts joined!', 
         CONCAT(COALESCE(NEW.contact_name, 'A contact'), ' just joined Antelog'), NEW.user_id);
        
        -- Reset row security
        SET LOCAL row_security = on;
      END IF;
      
      -- Mark contact as matched
      NEW.is_matched := true;
      NEW.matched_user_id := matching_profile.id;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix 5: Update mutual friend suggestions function with enhanced security
CREATE OR REPLACE FUNCTION public.create_mutual_friend_suggestions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contact_rec RECORD;
  suggestion_exists BOOLEAN;
  user_email TEXT;
  hashed_match_value TEXT;
BEGIN
  -- Only proceed if the user has a complete profile
  IF NEW.full_name IS NULL OR NEW.handle IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- When a new profile is created or phone number is updated
  IF NEW.phone_number IS NOT NULL AND NEW.phone_number != '' THEN
    -- Use secure function to find matching contacts
    FOR contact_rec IN 
      SELECT * FROM public.get_user_contacts_securely(NEW.phone_number)
      WHERE user_id != NEW.id  -- CRITICAL: Don't match with self
    LOOP
      -- Check if suggestion already exists
      SELECT EXISTS(
        SELECT 1 FROM friend_suggestions 
        WHERE user_id = contact_rec.user_id 
        AND suggested_user_id = NEW.id
      ) INTO suggestion_exists;
      
      -- Create mutual suggestions if they don't exist
      IF NOT suggestion_exists THEN
        -- Hash the phone number for privacy
        hashed_match_value := public.hash_contact_info(NEW.phone_number);
        
        -- Temporarily allow inserts for system operations
        SET LOCAL row_security = off;
        
        -- Suggestion for contact owner about new user
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (contact_rec.user_id, NEW.id, 'phone', hashed_match_value);
        
        -- Suggestion for new user about contact owner (reverse suggestion)
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (NEW.id, contact_rec.user_id, 'phone', hashed_match_value);
        
        -- Create notifications for BOTH users
        INSERT INTO notifications (user_id, type, title, message, related_user_id)
        VALUES 
        (contact_rec.user_id, 'contact_joined', 'Someone from your contacts joined!', 
         CONCAT(COALESCE(contact_rec.contact_name, NEW.full_name, 'A contact'), ' just joined Antelog'), NEW.id),
        (NEW.id, 'contact_joined', 'Found a connection!', 
         'Someone who has your contact just connected on Antelog', contact_rec.user_id);
        
        -- Reset row security
        SET LOCAL row_security = on;
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
      SELECT * FROM public.get_user_contacts_securely('', user_email)
      WHERE user_id != NEW.id  -- CRITICAL: Don't match with self
    LOOP
      -- Check if suggestion already exists
      SELECT EXISTS(
        SELECT 1 FROM friend_suggestions 
        WHERE user_id = contact_rec.user_id 
        AND suggested_user_id = NEW.id
      ) INTO suggestion_exists;
      
      -- Create mutual suggestions if they don't exist
      IF NOT suggestion_exists THEN
        -- Hash the email for privacy
        hashed_match_value := public.hash_contact_info(user_email);
        
        -- Temporarily allow inserts for system operations
        SET LOCAL row_security = off;
        
        -- Suggestion for contact owner about new user
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (contact_rec.user_id, NEW.id, 'email', hashed_match_value);
        
        -- Suggestion for new user about contact owner
        INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (NEW.id, contact_rec.user_id, 'email', hashed_match_value);
        
        -- Create notifications for BOTH users
        INSERT INTO notifications (user_id, type, title, message, related_user_id)
        VALUES 
        (contact_rec.user_id, 'contact_joined', 'Someone from your contacts joined!', 
         CONCAT(COALESCE(contact_rec.contact_name, NEW.full_name, 'A contact'), ' just joined Antelog'), NEW.id),
        (NEW.id, 'contact_joined', 'Found a connection!', 
         'Someone who has your contact just connected on Antelog', contact_rec.user_id);
        
        -- Reset row security  
        SET LOCAL row_security = on;
      END IF;
      
      -- Mark contact as matched
      UPDATE contact_imports 
      SET is_matched = true, matched_user_id = NEW.id
      WHERE user_id = contact_rec.user_id AND contact_email = user_email;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix 6: Add additional contact data validation
CREATE OR REPLACE FUNCTION public.validate_contact_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate contact data before insertion
  
  -- Ensure user_id is set and matches auth.uid()
  IF NEW.user_id IS NULL OR NEW.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Invalid user_id for contact import';
  END IF;
  
  -- Sanitize contact name (remove potentially dangerous characters)
  IF NEW.contact_name IS NOT NULL THEN
    NEW.contact_name := regexp_replace(NEW.contact_name, '[<>&"'']', '', 'g');
    NEW.contact_name := trim(NEW.contact_name);
  END IF;
  
  -- Validate email format if provided
  IF NEW.contact_email IS NOT NULL AND NEW.contact_email != '' THEN
    IF NEW.contact_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'Invalid email format';
    END IF;
  END IF;
  
  -- Validate phone format if provided
  IF NEW.contact_phone IS NOT NULL AND NEW.contact_phone != '' THEN
    -- Allow only digits, +, -, spaces, and parentheses
    NEW.contact_phone := regexp_replace(NEW.contact_phone, '[^0-9+\-\s()]', '', 'g');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for contact data validation
DROP TRIGGER IF EXISTS validate_contact_data_trigger ON contact_imports;
CREATE TRIGGER validate_contact_data_trigger
  BEFORE INSERT OR UPDATE ON contact_imports
  FOR EACH ROW EXECUTE FUNCTION public.validate_contact_data();

-- Fix 7: Add audit logging for contact access
CREATE TABLE IF NOT EXISTS public.contact_access_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  contact_id UUID,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.contact_access_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view contact access logs"
ON public.contact_access_logs
FOR SELECT
USING ((auth.jwt() ->> 'email'::text) = 'sharonjoseph2010@gmail.com'::text);

-- Function to log contact access
CREATE OR REPLACE FUNCTION public.log_contact_access(
  action_type TEXT,
  contact_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO contact_access_logs (user_id, action, contact_id, created_at)
  VALUES (auth.uid(), action_type, contact_id, now());
END;
$$;