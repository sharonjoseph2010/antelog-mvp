-- Fix Master Directory search and vote counting issues
-- First, drop the view and recreate with proper aggregation

DROP VIEW IF EXISTS master_directory_view;

CREATE VIEW master_directory_view AS
SELECT 
  lower(trim(li.content)) AS normalized_content,
  li.content AS display_content,
  l.category,
  li.url,
  count(DISTINCT l.owner_id) AS mention_count,
  array_agg(DISTINCT l.owner_id) AS mentioned_by_users,
  max(li.created_at) AS latest_mention_at,
  COALESCE(sum(de.search_count), 0::bigint) AS total_search_count,
  -- Create searchable text from item content and all list titles that contain this item
  lower(trim(li.content)) || ' ' || string_agg(DISTINCT lower(l.title), ' ') AS searchable_text
FROM list_items li
JOIN lists l ON li.list_id = l.id
JOIN profiles p ON l.owner_id = p.id
LEFT JOIN directory_entries de ON li.id = de.list_item_id
WHERE l.visibility = 'public'::list_visibility 
  AND p.is_verified = true 
  AND p.user_type = 'verified'::user_type
GROUP BY lower(trim(li.content)), li.content, l.category, li.url
HAVING count(DISTINCT l.owner_id) > 0;

-- Add searchable_text column to master_directory_entries if it doesn't exist
ALTER TABLE master_directory_entries ADD COLUMN IF NOT EXISTS searchable_text text;

-- Clear and repopulate master directory entries
TRUNCATE master_directory_entries;

INSERT INTO master_directory_entries (
  normalized_content,
  display_content,
  category,
  url,
  mention_count,
  mentioned_by_users,
  latest_mention_at,
  total_search_count,
  searchable_text
)
SELECT 
  normalized_content,
  display_content,
  category,
  url,
  mention_count,
  mentioned_by_users,
  latest_mention_at,
  total_search_count,
  searchable_text
FROM master_directory_view;