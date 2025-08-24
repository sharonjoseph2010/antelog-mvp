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
CREATE POLICY "Secure profile updates"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  (auth.uid() = id AND auth.uid() IS NOT NULL) OR 
  public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  (auth.uid() = id AND auth.uid() IS NOT NULL) OR 
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- DELETE: Only allow users to delete their own profile
CREATE POLICY "Secure profile deletion"
ON public.profiles
FOR DELETE
TO authenticated
USING (
  auth.uid() = id AND 
  auth.uid() IS NOT NULL
);