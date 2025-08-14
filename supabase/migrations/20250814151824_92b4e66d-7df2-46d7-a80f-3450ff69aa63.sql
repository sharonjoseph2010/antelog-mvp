-- Clean up friend suggestions with incomplete profiles
DELETE FROM friend_suggestions 
WHERE suggested_user_id IN (
  SELECT fs.suggested_user_id 
  FROM friend_suggestions fs
  LEFT JOIN profiles p ON fs.suggested_user_id = p.id
  WHERE p.id IS NULL OR p.full_name IS NULL OR p.handle IS NULL
);

-- Also clean up self-suggestions (shouldn't exist but let's be safe)
DELETE FROM friend_suggestions 
WHERE user_id = suggested_user_id;