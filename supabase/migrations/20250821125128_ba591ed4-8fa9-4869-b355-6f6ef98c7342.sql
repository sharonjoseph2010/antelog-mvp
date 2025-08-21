-- Create function to get extended network (friends-of-friends)
CREATE OR REPLACE FUNCTION public.get_extended_network(user_id uuid)
RETURNS TABLE (
  profile_id uuid,
  full_name text,
  handle text,
  mutual_friends text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as profile_id,
    p.full_name,
    p.handle,
    array_agg(DISTINCT mutual_friend.full_name) as mutual_friends
  FROM profiles p
  -- Join to friendships where p is connected to someone
  JOIN friendships f2 ON (p.id = f2.user1_id OR p.id = f2.user2_id)
  -- Get the mutual friend (the person connecting current user to p)
  JOIN profiles mutual_friend ON (
    CASE 
      WHEN f2.user1_id = p.id THEN f2.user2_id 
      ELSE f2.user1_id 
    END = mutual_friend.id
  )
  -- Join to friendships where mutual_friend is connected to current user
  JOIN friendships f1 ON (mutual_friend.id = f1.user1_id OR mutual_friend.id = f1.user2_id)
  WHERE 
    -- Current user is connected to mutual_friend
    (f1.user1_id = user_id OR f1.user2_id = user_id)
    -- Don't include current user
    AND p.id != user_id
    -- Don't include direct friends (exclude people already connected to current user)
    AND p.id NOT IN (
      SELECT CASE 
        WHEN direct_f.user1_id = user_id THEN direct_f.user2_id 
        ELSE direct_f.user1_id 
      END
      FROM friendships direct_f 
      WHERE direct_f.user1_id = user_id OR direct_f.user2_id = user_id
    )
    -- Only include verified users with complete profiles
    AND p.full_name IS NOT NULL 
    AND p.handle IS NOT NULL
    AND p.is_verified = true
    -- Ensure mutual friend is not the current user
    AND mutual_friend.id != user_id
  GROUP BY p.id, p.full_name, p.handle
  ORDER BY array_length(array_agg(DISTINCT mutual_friend.full_name), 1) DESC, p.full_name;
END;
$$;