-- Fix security gaps in profiles table RLS policies
-- Replace multiple permissive policies with stricter, consolidated ones

-- 1. Drop all existing policies on profiles table
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- 2. Create secure, consolidated policies that prevent unauthorized access

-- Explicitly deny anonymous access to all operations
CREATE POLICY "Deny anonymous access to profiles"
ON public.profiles
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- SELECT: Only allow users to view their own profile OR admins to view any profile
CREATE POLICY "Secure profile viewing"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id OR 
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- INSERT: Only allow users to create their own profile with their auth.uid()
CREATE POLICY "Secure profile creation"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id AND
  auth.uid() IS NOT NULL
);

-- UPDATE: Only allow users to update their own profile OR admins to update any profile
-- Additional security: prevent users from changing their own id
CREATE POLICY "Secure profile updates"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  (auth.uid() = id AND auth.uid() IS NOT NULL) OR 
  public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  -- Prevent changing the id field for non-admins
  (auth.uid() = id AND auth.uid() IS NOT NULL AND id = OLD.id) OR 
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- DELETE: Only allow users to delete their own profile (no admin delete to prevent accidental data loss)
CREATE POLICY "Secure profile deletion"
ON public.profiles
FOR DELETE
TO authenticated
USING (
  auth.uid() = id AND 
  auth.uid() IS NOT NULL
);

-- 3. Additional security: Create function to log sensitive data access
CREATE OR REPLACE FUNCTION public.log_profile_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log admin access to other users' profiles
  IF public.has_role(auth.uid(), 'admin'::app_role) AND 
     auth.uid() != COALESCE(NEW.id, OLD.id) THEN
    
    INSERT INTO contact_access_logs (
      user_id, 
      action, 
      created_at
    ) VALUES (
      auth.uid(),
      CASE 
        WHEN TG_OP = 'SELECT' THEN 'ADMIN_VIEW_PROFILE'
        WHEN TG_OP = 'UPDATE' THEN 'ADMIN_UPDATE_PROFILE'
        WHEN TG_OP = 'DELETE' THEN 'ADMIN_DELETE_PROFILE'
        ELSE 'ADMIN_PROFILE_ACCESS'
      END,
      now()
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger for logging (only for admin access)
DROP TRIGGER IF EXISTS log_profile_access_trigger ON public.profiles;
CREATE TRIGGER log_profile_access_trigger
  AFTER SELECT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_profile_access();