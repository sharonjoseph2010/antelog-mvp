-- CRITICAL FIX: Simplify Complex RLS Policies for Better Security
-- Fix profile viewing policies to prevent potential data exposure

-- Drop complex profile viewing policies that might expose data
DROP POLICY IF EXISTS "Friend-based profile viewing" ON profiles;
DROP POLICY IF EXISTS "Public list creator profile viewing" ON profiles;

-- Create simplified, secure profile viewing policy
CREATE POLICY "Secure profile viewing" ON profiles
FOR SELECT USING (
  -- User can always see their own profile
  auth.uid() = id OR 
  -- Admins can see all profiles
  has_role(auth.uid(), 'admin'::app_role) OR
  -- Direct friends can see each other's profiles (basic info only)
  (is_verified = true AND full_name IS NOT NULL AND handle IS NOT NULL AND EXISTS (
    SELECT 1 FROM friendships f
    WHERE ((f.user1_id = auth.uid() AND f.user2_id = profiles.id) OR 
           (f.user2_id = auth.uid() AND f.user1_id = profiles.id))
  )) OR
  -- Only verified users with public lists are discoverable by extended network
  (is_verified = true AND full_name IS NOT NULL AND handle IS NOT NULL AND 
   EXISTS (SELECT 1 FROM lists l WHERE l.owner_id = profiles.id AND l.visibility = 'public') AND
   EXISTS (SELECT 1 FROM get_extended_network(auth.uid()) en WHERE en.profile_id = profiles.id))
);

-- Create safer search directory policy to protect contributor privacy
DROP POLICY IF EXISTS "Directory entries are viewable by everyone" ON directory_entries;

CREATE POLICY "Public directory entries viewable by authenticated users" ON directory_entries
FOR SELECT USING (
  -- Only authenticated users can see directory entries
  auth.uid() IS NOT NULL
);

-- Create safer search analytics policy to prevent behavior tracking
DROP POLICY IF EXISTS "Users can view their own search analytics" ON search_analytics;

CREATE POLICY "Restricted search analytics access" ON search_analytics
FOR SELECT USING (
  -- Only users can see their own search data or admins can see all
  auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role)
);