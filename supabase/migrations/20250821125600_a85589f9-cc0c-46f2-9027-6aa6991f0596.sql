-- Create groups table
CREATE TABLE public.groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create group_members table  
CREATE TABLE public.group_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Enable RLS on groups table
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Enable RLS on group_members table  
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for groups table
CREATE POLICY "Group creators can manage their groups" 
ON public.groups 
FOR ALL 
USING (creator_id = auth.uid())
WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Group members can view groups they belong to"
ON public.groups
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm 
    WHERE gm.group_id = id AND gm.user_id = auth.uid()
  )
);

-- RLS policies for group_members table
CREATE POLICY "Group creators can manage group members"
ON public.group_members
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.groups g 
    WHERE g.id = group_id AND g.creator_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.groups g 
    WHERE g.id = group_id AND g.creator_id = auth.uid()
  )
);

CREATE POLICY "Users can view group memberships they belong to"
ON public.group_members
FOR SELECT
USING (user_id = auth.uid());

-- Trigger to update updated_at column
CREATE TRIGGER update_groups_updated_at
BEFORE UPDATE ON public.groups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();