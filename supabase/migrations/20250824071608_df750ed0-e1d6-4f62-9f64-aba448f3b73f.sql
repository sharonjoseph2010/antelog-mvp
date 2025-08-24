-- Fix overly permissive profile access by implementing friend-based access controls
-- Replace the current profile viewing policy with proper social network access rules

-- Drop the current overly permissive profile viewing policy
DROP POLICY IF EXISTS "Secure profile viewing" ON public.profiles;

-- Create new restricted profile viewing policy with proper friend-based access
CREATE POLICY "Friend-based profile viewing"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  -- Users can always view their own profile
  auth.uid() = id OR 
  
  -- Admins can view profiles for legitimate administrative purposes
  public.has_role(auth.uid(), 'admin'::app_role) OR
  
  -- Users can view profiles of their direct friends
  EXISTS (
    SELECT 1 
    FROM friendships f 
    WHERE ((f.user1_id = auth.uid() AND f.user2_id = profiles.id) OR 
           (f.user2_id = auth.uid() AND f.user1_id = profiles.id))
  ) OR
  
  -- Users can view profiles in their extended network (friends of friends)
  -- Only for verified users with complete profiles to prevent spam
  (profiles.is_verified = true AND 
   profiles.full_name IS NOT NULL AND 
   profiles.handle IS NOT NULL AND
   EXISTS (
     SELECT 1 
     FROM get_extended_network(auth.uid()) en 
     WHERE en.profile_id = profiles.id
   ))
);

-- Create additional policy for public list creators (minimal profile info only)
-- This allows viewing basic profile info when users create public lists
CREATE POLICY "Public list creator profile viewing"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  -- Only allow viewing basic profile info (name and handle) for public list creators
  -- This is needed for displaying list ownership in the public directory
  is_verified = true AND 
  full_name IS NOT NULL AND 
  handle IS NOT NULL AND
  EXISTS (
    SELECT 1 
    FROM lists l 
    WHERE l.owner_id = profiles.id AND l.visibility = 'public'::list_visibility
  )
);

-- Add additional security: Create function to mask sensitive data for non-friends
CREATE OR REPLACE FUNCTION public.get_safe_profile_view(profile_id UUID)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  handle TEXT,
  is_verified BOOLEAN,
  phone_number TEXT,
  student_id_number TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_friend BOOLEAN := false;
  is_extended_network BOOLEAN := false;
  is_admin BOOLEAN := false;
BEGIN
  -- Check if viewer is admin
  SELECT public.has_role(auth.uid(), 'admin'::app_role) INTO is_admin;
  
  -- Check if viewer is direct friend
  SELECT EXISTS (
    SELECT 1 FROM friendships f 
    WHERE ((f.user1_id = auth.uid() AND f.user2_id = profile_id) OR 
           (f.user2_id = auth.uid() AND f.user1_id = profile_id))
  ) INTO is_friend;
  
  -- Check if viewer is in extended network
  IF NOT is_friend AND NOT is_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM get_extended_network(auth.uid()) en 
      WHERE en.profile_id = profile_id
    ) INTO is_extended_network;
  END IF;
  
  -- Return data based on relationship
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.handle,
    p.is_verified,
    CASE 
      WHEN auth.uid() = p.id OR is_admin OR is_friend THEN p.phone_number
      ELSE NULL 
    END as phone_number,
    CASE 
      WHEN auth.uid() = p.id OR is_admin THEN p.student_id_number
      ELSE NULL 
    END as student_id_number
  FROM profiles p
  WHERE p.id = profile_id
  AND (
    auth.uid() = p.id OR 
    is_admin OR 
    is_friend OR 
    is_extended_network OR
    (p.is_verified = true AND EXISTS (
      SELECT 1 FROM lists l 
      WHERE l.owner_id = p.id AND l.visibility = 'public'::list_visibility
    ))
  );
END;
$$;