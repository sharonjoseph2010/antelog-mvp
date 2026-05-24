
DROP VIEW IF EXISTS master_directory_lists_view;

CREATE OR REPLACE VIEW master_directory_lists_view AS
SELECT 
  l.id as list_id,
  l.title as list_title,
  l.description as list_description,
  l.category,
  l.owner_id,
  l.created_at,
  l.updated_at,
  
  p.handle as creator_handle,
  p.full_name as creator_name,
  
  -- Primary creator (earliest creator of this list title)
  (
    SELECT p2.handle 
    FROM lists l2
    JOIN profiles p2 ON p2.id = l2.owner_id
    WHERE lower(trim(l2.title)) = lower(trim(l.title))
      AND l2.visibility = 'public'
      AND p2.is_verified = true
    ORDER BY l2.created_at ASC
    LIMIT 1
  ) as primary_creator_handle,
  
  -- Total unique contributors for this list title
  (
    SELECT COUNT(DISTINCT l2.owner_id)::integer
    FROM lists l2
    JOIN profiles p2 ON p2.id = l2.owner_id
    WHERE lower(trim(l2.title)) = lower(trim(l.title))
      AND l2.visibility = 'public'
      AND p2.is_verified = true
  ) as contributor_count,
  
  -- Array of all contributor handles
  (
    SELECT array_agg(DISTINCT p2.handle)
    FROM lists l2
    JOIN profiles p2 ON p2.id = l2.owner_id
    WHERE lower(trim(l2.title)) = lower(trim(l.title))
      AND l2.visibility = 'public'
      AND p2.is_verified = true
  ) as contributor_handles,
  
  COUNT(DISTINCT li.id)::integer as item_count,
  STRING_AGG(DISTINCT li.content, ', ' ORDER BY li.content) as items_preview,
  ARRAY_AGG(DISTINCT li.content ORDER BY li.content) as items_array,
  
  (
    lower(l.title) || ' ' || 
    COALESCE(lower(l.description), '') || ' ' || 
    COALESCE(STRING_AGG(DISTINCT lower(li.content), ' '), '')
  ) as searchable_text,
  
  MAX(li.created_at) as latest_item_at
  
FROM lists l
JOIN profiles p ON l.owner_id = p.id
LEFT JOIN list_items li ON li.list_id = l.id
WHERE l.visibility = 'public'
  AND p.is_verified = true
  AND p.user_type = 'verified'
GROUP BY 
  l.id, l.title, l.description, l.category, l.owner_id, l.created_at, l.updated_at,
  p.handle, p.full_name;
