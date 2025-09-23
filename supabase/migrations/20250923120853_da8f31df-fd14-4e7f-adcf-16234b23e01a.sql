-- Create Master Directory with proper vote counting system
-- This implements "one vote per user per item" by counting unique users who mentioned each item

-- First, drop existing triggers and functions with CASCADE
DROP TRIGGER IF EXISTS sync_directory_on_list_change_trigger ON lists CASCADE;
DROP TRIGGER IF EXISTS sync_directory_entries_trigger ON list_items CASCADE;
DROP FUNCTION IF EXISTS public.sync_directory_on_list_change() CASCADE;
DROP FUNCTION IF EXISTS public.sync_directory_entries() CASCADE;

-- Create a proper master directory view that aggregates items and counts unique mentions
CREATE OR REPLACE VIEW public.master_directory_view AS
SELECT 
  -- Use content as the grouping key (normalize case and whitespace)
  LOWER(TRIM(li.content)) as normalized_content,
  li.content as display_content,
  l.category,
  li.url,
  -- Count unique users who mentioned this item
  COUNT(DISTINCT l.owner_id) as mention_count,
  -- Get all users who mentioned this item
  array_agg(DISTINCT l.owner_id) as mentioned_by_users,
  -- Get the most recent mention
  MAX(li.created_at) as latest_mention_at,
  -- Get total search interest (sum all search counts for this item)
  COALESCE(SUM(de.search_count), 0) as total_search_count
FROM list_items li
JOIN lists l ON li.list_id = l.id
JOIN profiles p ON l.owner_id = p.id
LEFT JOIN directory_entries de ON li.id = de.list_item_id
WHERE 
  l.visibility = 'public'::list_visibility 
  AND p.is_verified = true
  AND p.user_type = 'verified'::user_type
GROUP BY LOWER(TRIM(li.content)), li.content, l.category, li.url
HAVING COUNT(DISTINCT l.owner_id) > 0;

-- Create a materialized directory entries table for better performance
DROP TABLE IF EXISTS public.master_directory_entries CASCADE;
CREATE TABLE public.master_directory_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_content text NOT NULL,
  display_content text NOT NULL,
  category list_category NOT NULL,
  url text,
  mention_count integer NOT NULL DEFAULT 0,
  mentioned_by_users uuid[] NOT NULL DEFAULT '{}',
  latest_mention_at timestamptz NOT NULL,
  total_search_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(normalized_content, category)
);

-- Enable RLS
ALTER TABLE public.master_directory_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can search the master directory
CREATE POLICY "Authenticated users can search master directory" 
ON public.master_directory_entries 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Policy: System can manage entries
CREATE POLICY "System can manage master directory entries" 
ON public.master_directory_entries 
FOR ALL 
USING (false) 
WITH CHECK (false);

-- Function to refresh the master directory
CREATE OR REPLACE FUNCTION public.refresh_master_directory()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clear existing entries
  TRUNCATE master_directory_entries;
  
  -- Insert aggregated data
  INSERT INTO master_directory_entries (
    normalized_content,
    display_content,
    category,
    url,
    mention_count,
    mentioned_by_users,
    latest_mention_at,
    total_search_count
  )
  SELECT 
    normalized_content,
    display_content,
    category,
    url,
    mention_count,
    mentioned_by_users,
    latest_mention_at,
    total_search_count
  FROM master_directory_view;
END;
$$;

-- Function to update search count for master directory entries
CREATE OR REPLACE FUNCTION public.increment_master_directory_search_count(entry_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE master_directory_entries 
  SET 
    total_search_count = total_search_count + 1,
    updated_at = now()
  WHERE id = ANY(entry_ids);
END;
$$;

-- Function to get contributors in user's network
CREATE OR REPLACE FUNCTION public.get_network_contributors(
  user_id_param uuid,
  contributor_ids uuid[]
)
RETURNS TABLE(
  contributor_id uuid,
  full_name text,
  handle text,
  is_friend boolean,
  is_extended_network boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  friend_ids uuid[];
  extended_ids uuid[];
BEGIN
  -- Get direct friends
  SELECT array_agg(DISTINCT 
    CASE 
      WHEN f.user1_id = user_id_param THEN f.user2_id
      ELSE f.user1_id
    END
  ) INTO friend_ids
  FROM friendships f
  WHERE f.user1_id = user_id_param OR f.user2_id = user_id_param;
  
  -- Get extended network
  SELECT array_agg(DISTINCT en.profile_id) INTO extended_ids
  FROM get_extended_network(user_id_param) en;
  
  -- Return contributor info with network status
  RETURN QUERY
  SELECT 
    p.id as contributor_id,
    p.full_name,
    p.handle,
    (friend_ids @> ARRAY[p.id]) as is_friend,
    (extended_ids @> ARRAY[p.id]) as is_extended_network
  FROM profiles p
  WHERE p.id = ANY(contributor_ids)
  AND p.full_name IS NOT NULL 
  AND p.handle IS NOT NULL;
END;
$$;

-- Trigger to refresh master directory when list items change
CREATE OR REPLACE FUNCTION public.refresh_master_directory_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Schedule refresh (in practice, you might want to debounce this)
  PERFORM public.refresh_master_directory();
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create triggers
CREATE TRIGGER refresh_master_directory_on_list_item_change
  AFTER INSERT OR UPDATE OR DELETE ON list_items
  FOR EACH ROW EXECUTE FUNCTION refresh_master_directory_on_change();

CREATE TRIGGER refresh_master_directory_on_list_change
  AFTER UPDATE ON lists
  FOR EACH ROW 
  WHEN (OLD.visibility IS DISTINCT FROM NEW.visibility OR OLD.category IS DISTINCT FROM NEW.category)
  EXECUTE FUNCTION refresh_master_directory_on_change();

-- Initial population
SELECT public.refresh_master_directory();