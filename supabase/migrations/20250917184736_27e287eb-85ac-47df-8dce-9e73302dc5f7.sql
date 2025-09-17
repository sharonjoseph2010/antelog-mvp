-- Add user_type enum to distinguish between verified and guest users
CREATE TYPE public.user_type AS ENUM ('verified', 'guest');

-- Add user_type column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN user_type public.user_type NOT NULL DEFAULT 'verified';

-- Create directory_entries table for aggregating public list items
CREATE TABLE public.directory_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content text NOT NULL,
  category list_category NOT NULL,
  url text,
  contributor_id uuid NOT NULL,
  list_id uuid NOT NULL,
  list_item_id uuid NOT NULL,
  search_count integer NOT NULL DEFAULT 0,
  vote_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(list_item_id) -- Prevent duplicate entries from same list item
);

-- Enable RLS on directory_entries
ALTER TABLE public.directory_entries ENABLE ROW LEVEL SECURITY;

-- Create directory_votes table for ranking system
CREATE TABLE public.directory_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id uuid NOT NULL,
  voter_id uuid NOT NULL,
  vote_type text NOT NULL CHECK (vote_type IN ('upvote', 'downvote')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(entry_id, voter_id) -- One vote per user per entry
);

-- Enable RLS on directory_votes
ALTER TABLE public.directory_votes ENABLE ROW LEVEL SECURITY;

-- Create search_analytics table
CREATE TABLE public.search_analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  search_query text NOT NULL,
  category list_category,
  results_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on search_analytics
ALTER TABLE public.search_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for directory_entries
CREATE POLICY "Directory entries are viewable by everyone" 
ON public.directory_entries 
FOR SELECT 
USING (true);

CREATE POLICY "System can manage directory entries" 
ON public.directory_entries 
FOR ALL 
USING (false) 
WITH CHECK (false);

-- RLS Policies for directory_votes
CREATE POLICY "Users can view all directory votes" 
ON public.directory_votes 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can vote" 
ON public.directory_votes 
FOR INSERT 
WITH CHECK (auth.uid() = voter_id);

CREATE POLICY "Users can update their own votes" 
ON public.directory_votes 
FOR UPDATE 
USING (auth.uid() = voter_id);

CREATE POLICY "Users can delete their own votes" 
ON public.directory_votes 
FOR DELETE 
USING (auth.uid() = voter_id);

-- RLS Policies for search_analytics
CREATE POLICY "Users can view their own search analytics" 
ON public.search_analytics 
FOR SELECT 
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "System can create search analytics" 
ON public.search_analytics 
FOR INSERT 
WITH CHECK (true);

-- Function to sync directory entries from public lists
CREATE OR REPLACE FUNCTION public.sync_directory_entries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Handle INSERT and UPDATE of list_items
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Check if the list is public and owner is verified
    IF EXISTS (
      SELECT 1 FROM lists l 
      JOIN profiles p ON l.owner_id = p.id 
      WHERE l.id = NEW.list_id 
      AND l.visibility = 'public' 
      AND p.is_verified = true
    ) THEN
      -- Insert or update directory entry
      INSERT INTO directory_entries (
        content, category, url, contributor_id, list_id, list_item_id, created_at, updated_at
      )
      SELECT 
        NEW.content, 
        l.category, 
        NEW.url, 
        l.owner_id, 
        NEW.list_id, 
        NEW.id,
        NEW.created_at,
        NEW.updated_at
      FROM lists l WHERE l.id = NEW.list_id
      ON CONFLICT (list_item_id) 
      DO UPDATE SET 
        content = EXCLUDED.content,
        url = EXCLUDED.url,
        updated_at = EXCLUDED.updated_at;
    END IF;
    RETURN NEW;
  END IF;
  
  -- Handle DELETE
  IF TG_OP = 'DELETE' THEN
    DELETE FROM directory_entries WHERE list_item_id = OLD.id;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Create trigger to sync directory entries
CREATE TRIGGER sync_directory_entries_trigger
  AFTER INSERT OR UPDATE OR DELETE ON list_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_directory_entries();

-- Function to sync directory entries when list visibility changes
CREATE OR REPLACE FUNCTION public.sync_directory_on_list_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Handle visibility changes
  IF TG_OP = 'UPDATE' AND (OLD.visibility != NEW.visibility OR OLD.category != NEW.category) THEN
    -- If list becomes public and owner is verified, add all items
    IF NEW.visibility = 'public' AND EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = NEW.owner_id AND p.is_verified = true
    ) THEN
      INSERT INTO directory_entries (
        content, category, url, contributor_id, list_id, list_item_id, created_at, updated_at
      )
      SELECT 
        li.content, 
        NEW.category, 
        li.url, 
        NEW.owner_id, 
        li.list_id, 
        li.id,
        li.created_at,
        li.updated_at
      FROM list_items li 
      WHERE li.list_id = NEW.id
      ON CONFLICT (list_item_id) 
      DO UPDATE SET 
        category = EXCLUDED.category,
        updated_at = EXCLUDED.updated_at;
    
    -- If list becomes private, remove all items
    ELSIF OLD.visibility = 'public' AND NEW.visibility != 'public' THEN
      DELETE FROM directory_entries WHERE list_id = NEW.id;
    
    -- If category changes, update all entries
    ELSIF NEW.visibility = 'public' AND OLD.category != NEW.category THEN
      UPDATE directory_entries 
      SET category = NEW.category, updated_at = now() 
      WHERE list_id = NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for list changes
CREATE TRIGGER sync_directory_on_list_change_trigger
  AFTER UPDATE ON lists
  FOR EACH ROW
  EXECUTE FUNCTION sync_directory_on_list_change();

-- Function to increment search count
CREATE OR REPLACE FUNCTION public.increment_search_count(entry_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE directory_entries 
  SET search_count = search_count + 1 
  WHERE id = ANY(entry_ids);
END;
$$;

-- Create indexes for better search performance
CREATE INDEX idx_directory_entries_content_gin ON directory_entries USING gin(to_tsvector('english', content));
CREATE INDEX idx_directory_entries_category ON directory_entries(category);
CREATE INDEX idx_directory_entries_vote_count ON directory_entries(vote_count DESC);
CREATE INDEX idx_directory_entries_search_count ON directory_entries(search_count DESC);
CREATE INDEX idx_search_analytics_query ON search_analytics(search_query);
CREATE INDEX idx_search_analytics_created_at ON search_analytics(created_at DESC);

-- Update updated_at trigger for directory tables
CREATE TRIGGER update_directory_entries_updated_at
  BEFORE UPDATE ON directory_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Populate existing directory entries from current public lists
INSERT INTO directory_entries (
  content, category, url, contributor_id, list_id, list_item_id, created_at, updated_at
)
SELECT DISTINCT
  li.content, 
  l.category, 
  li.url, 
  l.owner_id, 
  li.list_id, 
  li.id,
  li.created_at,
  li.updated_at
FROM list_items li 
JOIN lists l ON li.list_id = l.id 
JOIN profiles p ON l.owner_id = p.id 
WHERE l.visibility = 'public' 
AND p.is_verified = true
ON CONFLICT (list_item_id) DO NOTHING;