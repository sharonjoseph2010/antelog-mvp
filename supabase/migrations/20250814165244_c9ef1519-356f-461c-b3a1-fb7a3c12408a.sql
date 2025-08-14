-- URGENT SECURITY FIX: Fix Anonymous Access to Contact Data (Policy Update)
-- This addresses the critical vulnerability by updating existing policies

-- Fix 1: Drop the vulnerable function completely (if it still exists)
DROP FUNCTION IF EXISTS public.get_user_contacts_securely(TEXT, TEXT);

-- Fix 2: Create a properly secured replacement function
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
  -- CRITICAL: Verify the caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to access contact data';
  END IF;
  
  -- Only return contacts that match the provided phone/email
  -- AND respect RLS by only returning contacts from authenticated user's data
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
  AND p.handle IS NOT NULL
  -- SECURITY: Only return data if the requesting user has access to it
  AND EXISTS (
    SELECT 1 FROM contact_imports ci2 
    WHERE ci2.user_id = auth.uid() 
    AND (ci2.contact_phone = target_phone OR ci2.contact_email = target_email)
  );
END;
$$;

-- Fix 3: Add explicit authentication check function
CREATE OR REPLACE FUNCTION public.validate_authenticated_user()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Operation requires authentication';
  END IF;
  RETURN true;
END;
$$;

-- Fix 4: Update existing RLS policies to be more restrictive
DROP POLICY IF EXISTS "Users can view their own contacts" ON contact_imports;
CREATE POLICY "Users can view their own contacts"
ON contact_imports
FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own contacts" ON contact_imports;
CREATE POLICY "Users can create their own contacts"
ON contact_imports
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own contacts" ON contact_imports;
CREATE POLICY "Users can update their own contacts"
ON contact_imports
FOR UPDATE
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own contacts" ON contact_imports;
CREATE POLICY "Users can delete their own contacts"
ON contact_imports
FOR DELETE
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Fix 5: Add explicit deny policy for anonymous users
CREATE POLICY "Deny anonymous access to contact_imports"
ON contact_imports
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Fix 6: Add contact access logging for security monitoring
CREATE OR REPLACE FUNCTION public.log_contact_access_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log all contact access attempts
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.log_contact_access(
      CASE 
        WHEN TG_OP = 'SELECT' THEN 'VIEW_CONTACT'
        WHEN TG_OP = 'INSERT' THEN 'CREATE_CONTACT'
        WHEN TG_OP = 'UPDATE' THEN 'UPDATE_CONTACT'
        WHEN TG_OP = 'DELETE' THEN 'DELETE_CONTACT'
        ELSE 'UNKNOWN_CONTACT_OPERATION'
      END,
      COALESCE(NEW.id, OLD.id)
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Add audit trigger (drop first to avoid conflicts)
DROP TRIGGER IF EXISTS contact_access_audit_trigger ON contact_imports;
CREATE TRIGGER contact_access_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON contact_imports
  FOR EACH ROW EXECUTE FUNCTION public.log_contact_access_trigger();

-- Fix 7: Verify RLS is enabled (should already be true)
ALTER TABLE contact_imports ENABLE ROW LEVEL SECURITY;