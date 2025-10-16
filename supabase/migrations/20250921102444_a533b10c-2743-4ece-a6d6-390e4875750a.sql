-- CRITICAL FIX: Resolve infinite recursion in RLS policies (Step 2 - Fix Group Policies)
-- Drop and recreate problematic RLS policies using security definer functions

-- Drop existing problematic policies on groups table
DROP POLICY IF EXISTS "Group creators can manage their groups" ON groups;
DROP POLICY IF EXISTS "Group members can view groups they belong to" ON groups;

-- Create new RLS policies for groups table using security definer functions
CREATE POLICY "Group creators can manage their groups" ON groups
FOR ALL USING (creator_id = auth.uid())
WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Group members can view groups they belong to" ON groups
FOR SELECT USING (
  creator_id = auth.uid() OR 
  public.is_group_member(id, auth.uid())
);