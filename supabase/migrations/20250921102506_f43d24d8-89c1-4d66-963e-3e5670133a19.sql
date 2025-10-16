-- CRITICAL FIX: Resolve infinite recursion in RLS policies (Step 3 - Fix Group Members Policies)
-- Drop and recreate problematic RLS policies on group_members table

-- Drop existing problematic policies on group_members table
DROP POLICY IF EXISTS "Group creators can manage group members" ON group_members;
DROP POLICY IF EXISTS "Users can view group memberships they belong to" ON group_members;

-- Create new RLS policies for group_members table using security definer functions
CREATE POLICY "Group creators can manage group members" ON group_members
FOR ALL USING (public.is_group_creator(group_id, auth.uid()))
WITH CHECK (public.is_group_creator(group_id, auth.uid()));

CREATE POLICY "Users can view their own group memberships" ON group_members
FOR SELECT USING (
  user_id = auth.uid() OR 
  public.is_group_creator(group_id, auth.uid())
);