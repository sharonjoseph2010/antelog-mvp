-- Fix security warnings by setting proper search_path

-- Update the normalize_phone_number function
CREATE OR REPLACE FUNCTION normalize_phone_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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