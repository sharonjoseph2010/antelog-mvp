
-- Create new list-level view for Master Directory
CREATE OR REPLACE VIEW master_directory_lists_view AS
SELECT 
  l.id as list_id,
  l.title as list_title,
  l.description as list_description,
  l.category,
  l.owner_id,
  l.created_at,
  l.updated_at,
  
  -- Creator info
  p.handle as creator_handle,
  p.full_name as creator_name,
  
  -- List metadata
  COUNT(DISTINCT li.id)::integer as item_count,
  
  -- Items for search and preview
  STRING_AGG(DISTINCT li.content, ', ' ORDER BY li.content) as items_preview,
  ARRAY_AGG(DISTINCT li.content ORDER BY li.content) as items_array,
  
  -- Searchable text (list title + all items)
  (
    lower(l.title) || ' ' || 
    COALESCE(lower(l.description), '') || ' ' || 
    COALESCE(STRING_AGG(DISTINCT lower(li.content), ' '), '')
  ) as searchable_text,
  
  -- Latest activity
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
