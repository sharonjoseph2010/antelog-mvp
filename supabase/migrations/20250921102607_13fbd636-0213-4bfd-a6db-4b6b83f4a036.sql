-- CRITICAL FIX: Contact Data Privacy Protection
-- Add encryption and consent for contact information

-- Add consent and encryption fields to contact_imports table
ALTER TABLE contact_imports 
ADD COLUMN IF NOT EXISTS consent_given boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS consent_timestamp timestamp with time zone,
ADD COLUMN IF NOT EXISTS encrypted_phone text,
ADD COLUMN IF NOT EXISTS encrypted_email text,
ADD COLUMN IF NOT EXISTS data_retention_expires_at timestamp with time zone DEFAULT (now() + interval '1 year');

-- Create function to encrypt contact data (basic hashing for privacy)
CREATE OR REPLACE FUNCTION public.encrypt_contact_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only encrypt if consent is given
  IF NEW.consent_given = true THEN
    -- Hash the phone and email for privacy (using existing hash function)
    IF NEW.contact_phone IS NOT NULL AND NEW.contact_phone != '' THEN
      NEW.encrypted_phone := public.hash_contact_info(NEW.contact_phone);
    END IF;
    
    IF NEW.contact_email IS NOT NULL AND NEW.contact_email != '' THEN
      NEW.encrypted_email := public.hash_contact_info(NEW.contact_email);
    END IF;
    
    NEW.consent_timestamp := now();
  ELSE
    -- Clear encrypted data if consent is revoked
    NEW.encrypted_phone := NULL;
    NEW.encrypted_email := NULL;
    NEW.consent_timestamp := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for contact data encryption
DROP TRIGGER IF EXISTS encrypt_contact_data_trigger ON contact_imports;
CREATE TRIGGER encrypt_contact_data_trigger
  BEFORE INSERT OR UPDATE ON contact_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_contact_data();

-- Create function to clean up expired contact data
CREATE OR REPLACE FUNCTION public.cleanup_expired_contacts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete contacts past retention period (1 year)
  DELETE FROM contact_imports 
  WHERE data_retention_expires_at < now()
  AND consent_given = false;
  
  -- For consented contacts, anonymize after retention period
  UPDATE contact_imports 
  SET 
    contact_name = 'ANONYMIZED',
    contact_phone = NULL,
    contact_email = NULL,
    encrypted_phone = NULL,
    encrypted_email = NULL
  WHERE data_retention_expires_at < now()
  AND consent_given = true
  AND contact_name != 'ANONYMIZED';
END;
$$;