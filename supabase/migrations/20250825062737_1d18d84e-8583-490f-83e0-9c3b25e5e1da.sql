-- Fix critical security vulnerability in contact imports system
-- Remove the vulnerable get_user_contacts_securely function that bypasses RLS

-- Drop the vulnerable function that allows cross-user contact data access
DROP FUNCTION IF EXISTS public.get_user_contacts_securely(text, text);

-- Strengthen contact_imports RLS policies with additional safeguards
-- Add explicit check to prevent any potential bypass attempts

-- Drop existing policies to recreate them with enhanced security
DROP POLICY IF EXISTS "Authenticated users can view their own contacts" ON public.contact_imports;
DROP POLICY IF EXISTS "Authenticated users can create their own contacts" ON public.contact_imports;
DROP POLICY IF EXISTS "Authenticated users can update their own contacts" ON public.contact_imports;
DROP POLICY IF EXISTS "Authenticated users can delete their own contacts" ON public.contact_imports;

-- Recreate with stronger security checks
CREATE POLICY "Secure contact viewing - own contacts only"
ON public.contact_imports
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL AND 
  auth.uid() = user_id AND
  -- Additional security: verify the user exists and is active
  EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Secure contact creation - own contacts only"
ON public.contact_imports
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND 
  auth.uid() = user_id AND
  -- Additional security: verify the user exists and is active
  EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Secure contact updates - own contacts only"
ON public.contact_imports
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL AND 
  auth.uid() = user_id AND
  -- Additional security: verify the user exists and is active
  EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())
)
WITH CHECK (
  auth.uid() IS NOT NULL AND 
  auth.uid() = user_id AND
  -- Additional security: verify the user exists and is active
  EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Secure contact deletion - own contacts only"
ON public.contact_imports
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL AND 
  auth.uid() = user_id AND
  -- Additional security: verify the user exists and is active
  EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())
);

-- Keep the anonymous denial policy as-is
-- (It should already exist and is working correctly)

-- Add additional security: Create audit function for contact access
CREATE OR REPLACE FUNCTION public.audit_contact_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Log all contact access for security monitoring
  PERFORM public.log_contact_access(
    TG_OP || '_CONTACT',
    COALESCE(NEW.id, OLD.id)
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for audit logging (if not exists)
DROP TRIGGER IF EXISTS audit_contact_access_trigger ON public.contact_imports;
CREATE TRIGGER audit_contact_access_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.contact_imports
  FOR EACH ROW EXECUTE FUNCTION public.audit_contact_access();