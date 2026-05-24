-- Fix search_path security warning for normalize_phone_number
DROP FUNCTION IF EXISTS public.normalize_phone_number(text);

CREATE OR REPLACE FUNCTION public.normalize_phone_number(phone_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF phone_input IS NULL OR phone_input = '' THEN
    RETURN NULL;
  END IF;
  
  -- AGGRESSIVE NORMALIZATION: Remove ALL non-digit characters except +
  phone_input := REGEXP_REPLACE(phone_input, '[^0-9+]', '', 'g');
  
  -- Remove ALL leading zeros
  phone_input := REGEXP_REPLACE(phone_input, '^0+', '');
  
  -- If already has +, ensure format is correct
  IF phone_input LIKE '+%' THEN
    phone_input := '+' || REGEXP_REPLACE(SUBSTRING(phone_input FROM 2), '[^0-9]', '', 'g');
  ELSE
    -- No + prefix, add country code logic
    IF phone_input LIKE '91%' AND LENGTH(phone_input) = 12 THEN
      phone_input := '+' || phone_input;
    ELSIF LENGTH(phone_input) = 10 THEN
      phone_input := '+91' || phone_input;
    ELSIF LENGTH(phone_input) = 11 AND phone_input LIKE '1%' THEN
      phone_input := '+' || phone_input;
    ELSE
      phone_input := '+' || phone_input;
    END IF;
  END IF;
  
  -- Final cleanup
  phone_input := REGEXP_REPLACE(phone_input, '[^0-9+]', '', 'g');
  
  RETURN phone_input;
END;
$$;

-- Fix search_path for debug function
DROP FUNCTION IF EXISTS public.debug_phone_match(text, text);

CREATE OR REPLACE FUNCTION public.debug_phone_match(
  contact_phone_input TEXT,
  profile_phone_input TEXT
)
RETURNS TABLE(
  contact_original TEXT,
  contact_normalized TEXT,
  profile_original TEXT,
  profile_normalized TEXT,
  matches BOOLEAN
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  contact_norm TEXT;
  profile_norm TEXT;
BEGIN
  contact_norm := public.normalize_phone_number(contact_phone_input);
  profile_norm := public.normalize_phone_number(profile_phone_input);
  
  RETURN QUERY
  SELECT 
    contact_phone_input,
    contact_norm,
    profile_phone_input,
    profile_norm,
    (contact_norm = profile_norm);
END;
$$;