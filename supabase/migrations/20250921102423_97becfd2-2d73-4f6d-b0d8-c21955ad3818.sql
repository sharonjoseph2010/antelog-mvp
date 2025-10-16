-- CRITICAL FIX: Resolve infinite recursion in RLS policies (Step 1 - Functions only)
-- Create security definer functions to break circular dependencies

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