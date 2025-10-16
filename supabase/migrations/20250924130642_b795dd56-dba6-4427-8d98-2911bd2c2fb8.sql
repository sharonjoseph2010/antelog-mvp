-- Force refresh master directory to sync all public list data
TRUNCATE master_directory_entries;

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