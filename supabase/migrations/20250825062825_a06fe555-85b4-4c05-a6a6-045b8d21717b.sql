-- Fix search path security warning for the audit function
-- Update the audit function to have a secure search path

DROP FUNCTION IF EXISTS public.audit_contact_access();

CREATE OR REPLACE FUNCTION public.audit_contact_access()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log all contact access for security monitoring
  PERFORM public.log_contact_access(
    TG_OP || '_CONTACT',
    COALESCE(NEW.id, OLD.id)
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;