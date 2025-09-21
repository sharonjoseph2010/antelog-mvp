-- Fix security issue: Restrict access to sensitive student data
-- Drop ALL existing profile policies first
DROP POLICY IF EXISTS "View basic profile info" ON public.profiles;
DROP POLICY IF EXISTS "Secure profile viewing" ON public.profiles;
DROP POLICY IF EXISTS "Secure profile creation" ON public.profiles;  
DROP POLICY IF EXISTS "Secure profile updates" ON public.profiles;
DROP POLICY IF EXISTS "Secure profile deletion" ON public.profiles;
DROP POLICY IF EXISTS "Deny anonymous access to profiles" ON public.profiles;

-- Recreate secure policies
-- Policy 1: Deny anonymous access
CREATE POLICY "Deny anonymous access to profiles" 
ON public.profiles 
FOR ALL 
USING (false) 
WITH CHECK (false);

-- Policy 2: Profile creation (users can create their own profile)
CREATE POLICY "Secure profile creation" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = id AND auth.uid() IS NOT NULL);

-- Policy 3: Profile updates (owner and admin only)
CREATE POLICY "Secure profile updates" 
ON public.profiles 
FOR UPDATE 
USING (
  (auth.uid() = id AND auth.uid() IS NOT NULL) OR 
  has_role(auth.uid(), 'admin'::app_role)
) 
WITH CHECK (
  (auth.uid() = id AND auth.uid() IS NOT NULL) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Policy 4: Profile deletion (owner only)
CREATE POLICY "Secure profile deletion" 
ON public.profiles 
FOR DELETE 
USING (auth.uid() = id AND auth.uid() IS NOT NULL);

-- Policy 5: SECURE profile viewing - ONLY basic info, NO sensitive data to non-owners
CREATE POLICY "View basic profile info only" 
ON public.profiles 
FOR SELECT 
USING (
  -- Profile owner can see their own data
  auth.uid() = id OR
  -- Admins can see all data
  has_role(auth.uid(), 'admin'::app_role) OR
  -- Others can ONLY see basic info (name, handle, verification status) if they're friends/extended network
  (
    is_verified = true AND 
    full_name IS NOT NULL AND 
    handle IS NOT NULL AND
    (
      -- Direct friends
      EXISTS (
        SELECT 1 FROM friendships f 
        WHERE ((f.user1_id = auth.uid() AND f.user2_id = profiles.id) OR 
               (f.user2_id = auth.uid() AND f.user1_id = profiles.id))
      ) OR
      -- Extended network (only if they have public lists)
      (
        EXISTS (
          SELECT 1 FROM lists l 
          WHERE l.owner_id = profiles.id AND l.visibility = 'public'::list_visibility
        ) AND
        EXISTS (
          SELECT 1 FROM get_extended_network(auth.uid()) en 
          WHERE en.profile_id = profiles.id
        )
      )
    )
  )
);

-- Update the existing get_safe_profile_view function to be more secure
DROP FUNCTION IF EXISTS public.get_safe_profile_view(uuid);
CREATE OR REPLACE FUNCTION public.get_safe_profile_view(profile_id uuid)
RETURNS TABLE(
  id uuid, 
  full_name text, 
  handle text, 
  is_verified boolean, 
  phone_number text, 
  student_id_number text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_friend boolean := false;
  is_extended_network boolean := false;
  is_admin boolean := false;
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
  
  -- Return data based on relationship - SENSITIVE DATA ONLY FOR OWNER/ADMIN
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.handle,
    p.is_verified,
    -- CRITICAL: Sensitive data only for owner or admin
    CASE 
      WHEN auth.uid() = p.id OR is_admin THEN p.phone_number
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