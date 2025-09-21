-- CRITICAL FIX: Resolve infinite recursion in RLS policies for groups and group_members
-- Step 1: Create security definer functions to break circular dependencies

-- Function to check if user is group creator (avoids recursion)
CREATE OR REPLACE FUNCTION public.is_group_creator(group_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM groups g 
    WHERE g.id = group_id AND g.creator_id = user_id
  )
$$;

-- Function to check if user is group member (avoids recursion)  
CREATE OR REPLACE FUNCTION public.is_group_member(group_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public  
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members gm 
    WHERE gm.group_id = group_id AND gm.user_id = user_id
  )
$$;

-- Step 2: Drop existing problematic RLS policies
DROP POLICY IF EXISTS "Group creators can manage their groups" ON groups;
DROP POLICY IF EXISTS "Group members can view groups they belong to" ON groups;  
DROP POLICY IF EXISTS "Group creators can manage group members" ON group_members;
DROP POLICY IF EXISTS "Users can view group memberships they belong to" ON group_members;

-- Step 3: Create new RLS policies using security definer functions
-- Groups table policies
CREATE POLICY "Group creators can manage their groups" ON groups
FOR ALL USING (creator_id = auth.uid())
WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Group members can view groups they belong to" ON groups
FOR SELECT USING (
  creator_id = auth.uid() OR 
  public.is_group_member(id, auth.uid())
);

-- Group members table policies  
CREATE POLICY "Group creators can manage group members" ON group_members
FOR ALL USING (public.is_group_creator(group_id, auth.uid()))
WITH CHECK (public.is_group_creator(group_id, auth.uid()));

CREATE POLICY "Users can view their own group memberships" ON group_members
FOR SELECT USING (
  user_id = auth.uid() OR 
  public.is_group_creator(group_id, auth.uid())
);