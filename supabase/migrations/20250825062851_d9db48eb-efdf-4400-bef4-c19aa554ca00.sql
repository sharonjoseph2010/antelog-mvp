-- Fix search path security warning for the audit function
-- Drop trigger first, then function, then recreate both with secure search path

DROP TRIGGER IF EXISTS audit_contact_access_trigger ON public.contact_imports;
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

-- Recreate the trigger
CREATE TRIGGER audit_contact_access_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.contact_imports
  FOR EACH ROW EXECUTE FUNCTION public.audit_contact_access();