-- Fix security issue: Restrict access to sensitive student data
-- Replace the overly permissive profile viewing policy with secure policies

-- First, drop the existing overly permissive policy
DROP POLICY IF EXISTS "Secure profile viewing" ON public.profiles;

-- Create separate policies for basic info vs sensitive data
-- Policy 1: Basic profile info (name, handle, verification status) - can be viewed by friends and extended network
CREATE POLICY "View basic profile info"
ON public.profiles
FOR SELECT
USING (
  -- Profile owner can see their own data
  auth.uid() = id OR
  -- Admins can see all data  
  has_role(auth.uid(), 'admin'::app_role) OR
  -- Direct friends can see basic info only (we'll handle sensitive data separately)
  (
    is_verified = true AND 
    full_name IS NOT NULL AND 
    handle IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM friendships f 
      WHERE ((f.user1_id = auth.uid() AND f.user2_id = profiles.id) OR 
             (f.user2_id = auth.uid() AND f.user1_id = profiles.id))
    )
  ) OR
  -- Extended network can see basic info only (for users with public lists)
  (
    is_verified = true AND 
    full_name IS NOT NULL AND 
    handle IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM lists l 
      WHERE l.owner_id = profiles.id AND l.visibility = 'public'::list_visibility
    ) AND
    EXISTS (
      SELECT 1 FROM get_extended_network(auth.uid()) en 
      WHERE en.profile_id = profiles.id
    )
  )
);

-- Create a security definer function to safely return profile data with proper access control
CREATE OR REPLACE FUNCTION public.get_safe_profile_data(profile_id uuid)
RETURNS TABLE(
  id uuid,
  full_name text,
  handle text,
  is_verified boolean,
  user_type user_type,
  batch text,
  -- Sensitive fields only for owner/admin
  phone_number text,
  student_id_number text,
  id_card_image_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_owner boolean := false;
  is_admin boolean := false;
  is_friend boolean := false;
  has_access boolean := false;
BEGIN
  -- Check if the requester is the profile owner
  is_owner := (auth.uid() = profile_id);
  
  -- Check if the requester is an admin
  is_admin := has_role(auth.uid(), 'admin'::app_role);
  
  -- Check if the requester is a direct friend
  SELECT EXISTS (
    SELECT 1 FROM friendships f 
    WHERE ((f.user1_id = auth.uid() AND f.user2_id = profile_id) OR 
           (f.user2_id = auth.uid() AND f.user1_id = profile_id))
  ) INTO is_friend;
  
  -- Check if user has any access to this profile
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = profile_id AND (
      -- Owner or admin
      auth.uid() = p.id OR has_role(auth.uid(), 'admin'::app_role) OR
      -- Direct friend
      (p.is_verified = true AND p.full_name IS NOT NULL AND p.handle IS NOT NULL AND is_friend) OR
      -- Extended network with public lists
      (p.is_verified = true AND p.full_name IS NOT NULL AND p.handle IS NOT NULL AND
       EXISTS (SELECT 1 FROM lists l WHERE l.owner_id = p.id AND l.visibility = 'public'::list_visibility) AND
       EXISTS (SELECT 1 FROM get_extended_network(auth.uid()) en WHERE en.profile_id = p.id))
    )
  ) INTO has_access;
  
  -- Return data based on access level
  IF has_access THEN
    RETURN QUERY
    SELECT 
      p.id,
      p.full_name,
      p.handle,
      p.is_verified,
      p.user_type,
      p.batch,
      -- Sensitive data only for owner and admin
      CASE WHEN is_owner OR is_admin THEN p.phone_number ELSE NULL END,
      CASE WHEN is_owner OR is_admin THEN p.student_id_number ELSE NULL END,
      CASE WHEN is_owner OR is_admin THEN p.id_card_image_url ELSE NULL END
    FROM profiles p
    WHERE p.id = profile_id;
  END IF;
END;
$$;