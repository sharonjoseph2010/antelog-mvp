-- Create aggressive phone normalization function
CREATE OR REPLACE FUNCTION public.normalize_phone_number(phone_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF phone_input IS NULL OR phone_input = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove all non-digit characters except +
  phone_input := REGEXP_REPLACE(phone_input, '[^0-9+]', '', 'g');
  
  -- Remove leading zeros
  phone_input := REGEXP_REPLACE(phone_input, '^0+', '');
  
  -- If no + at start, add +91 (India default)
  IF phone_input NOT LIKE '+%' THEN
    -- If starts with 91 and has 12 digits total, just add +
    IF phone_input LIKE '91%' AND LENGTH(phone_input) = 12 THEN
      phone_input := '+' || phone_input;
    -- If 10 digits, add +91
    ELSIF LENGTH(phone_input) = 10 THEN
      phone_input := '+91' || phone_input;
    -- Otherwise just add +
    ELSE
      phone_input := '+' || phone_input;
    END IF;
  END IF;
  
  RETURN phone_input;
END;
$$;

-- Create trigger function to normalize phone on insert/update for profiles
CREATE OR REPLACE FUNCTION public.normalize_profile_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.phone_number IS NOT NULL AND NEW.phone_number != '' THEN
    NEW.phone_number := public.normalize_phone_number(NEW.phone_number);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for profiles table
DROP TRIGGER IF EXISTS normalize_phone_before_insert ON public.profiles;
CREATE TRIGGER normalize_phone_before_insert
  BEFORE INSERT OR UPDATE OF phone_number ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_profile_phone();

-- Create trigger function to normalize phone on insert/update for contact_imports
CREATE OR REPLACE FUNCTION public.normalize_contact_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_phone IS NOT NULL AND NEW.contact_phone != '' THEN
    NEW.contact_phone := public.normalize_phone_number(NEW.contact_phone);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for contact_imports table
DROP TRIGGER IF EXISTS normalize_phone_before_contact_insert ON public.contact_imports;
CREATE TRIGGER normalize_phone_before_contact_insert
  BEFORE INSERT OR UPDATE OF contact_phone ON public.contact_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_contact_phone();

-- Update match_contact_on_insert to use normalization function
CREATE OR REPLACE FUNCTION public.match_contact_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matching_profile RECORD;
  normalized_contact_phone TEXT;
BEGIN
  -- Only proceed if contact has a phone number
  IF NEW.contact_phone IS NOT NULL AND NEW.contact_phone != '' THEN
    
    -- Normalize the contact phone for matching
    normalized_contact_phone := public.normalize_phone_number(NEW.contact_phone);
    
    -- Find profile with matching phone number (excluding the contact owner)
    SELECT p.id, p.full_name, p.handle, p.phone_number
    INTO matching_profile
    FROM profiles p
    WHERE public.normalize_phone_number(p.phone_number) = normalized_contact_phone
    AND p.id != NEW.user_id  -- Don't match with self
    AND p.full_name IS NOT NULL 
    AND p.handle IS NOT NULL
    LIMIT 1;
    
    -- If match found, update the contact record
    IF matching_profile.id IS NOT NULL THEN
      NEW.is_matched := true;
      NEW.matched_user_id := matching_profile.id;
      
      RAISE NOTICE 'Contact matched: contact_phone=%, normalized=%, matched_user_id=%', 
        NEW.contact_phone, normalized_contact_phone, matching_profile.id;
    ELSE
      NEW.is_matched := false;
      NEW.matched_user_id := NULL;
      
      RAISE NOTICE 'No match found for contact_phone=%, normalized=%', 
        NEW.contact_phone, normalized_contact_phone;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Temporarily disable audit trigger for bulk update
ALTER TABLE public.contact_imports DISABLE TRIGGER audit_contact_access_trigger;

-- Normalize all existing phone numbers in profiles
UPDATE public.profiles
SET phone_number = public.normalize_phone_number(phone_number)
WHERE phone_number IS NOT NULL AND phone_number != '';

-- Normalize all existing phone numbers in contact_imports
UPDATE public.contact_imports
SET contact_phone = public.normalize_phone_number(contact_phone)
WHERE contact_phone IS NOT NULL AND contact_phone != '';

-- Re-enable audit trigger
ALTER TABLE public.contact_imports ENABLE TRIGGER audit_contact_access_trigger;