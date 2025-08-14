-- Remove friend suggestions for users without complete profiles
DELETE FROM friend_suggestions 
WHERE user_id IN (
  SELECT p.id 
  FROM profiles p
  WHERE p.full_name IS NULL OR p.handle IS NULL
);