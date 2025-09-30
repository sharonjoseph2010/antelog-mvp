-- Create request_forwards tracking table if not exists
CREATE TABLE IF NOT EXISTS request_forwards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  forwarded_by_user_id UUID NOT NULL,
  forwarded_to_audience request_audience_type NOT NULL,
  forwarded_to_group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on request_forwards
ALTER TABLE request_forwards ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view relevant forwards" ON request_forwards;
DROP POLICY IF EXISTS "Users can create forwards" ON request_forwards;

-- Users can view forwards they created or received
CREATE POLICY "Users can view relevant forwards"
ON request_forwards FOR SELECT
USING (
  auth.uid() = forwarded_by_user_id OR
  EXISTS (
    SELECT 1 FROM requests r 
    WHERE r.id = request_forwards.request_id AND (
      (forwarded_to_audience = 'friends' AND EXISTS (
        SELECT 1 FROM friendships f 
        WHERE (f.user1_id = auth.uid() AND f.user2_id = forwarded_by_user_id) OR
              (f.user2_id = auth.uid() AND f.user1_id = forwarded_by_user_id)
      )) OR
      (forwarded_to_audience = 'extended_network' AND EXISTS (
        SELECT 1 FROM get_extended_network(forwarded_by_user_id) en 
        WHERE en.profile_id = auth.uid()
      )) OR
      (forwarded_to_audience = 'specific_group' AND forwarded_to_group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM group_members gm 
        WHERE gm.group_id = forwarded_to_group_id AND gm.user_id = auth.uid()
      ))
    )
  )
);

-- Users can create forwards
CREATE POLICY "Users can create forwards"
ON request_forwards FOR INSERT
WITH CHECK (auth.uid() = forwarded_by_user_id);

-- Function to get connection path between two users
CREATE OR REPLACE FUNCTION get_connection_path(user_a UUID, user_b UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  path TEXT[];
  mutual_friend_name TEXT;
BEGIN
  -- Check if they are direct friends
  IF EXISTS (
    SELECT 1 FROM friendships f
    WHERE (f.user1_id = user_a AND f.user2_id = user_b) OR
          (f.user2_id = user_a AND f.user1_id = user_b)
  ) THEN
    SELECT ARRAY[
      (SELECT full_name FROM profiles WHERE id = user_a),
      (SELECT full_name FROM profiles WHERE id = user_b)
    ] INTO path;
    RETURN path;
  END IF;
  
  -- Check for connection through mutual friend (extended network)
  SELECT en.mutual_friends[1] INTO mutual_friend_name
  FROM get_extended_network(user_a) en
  WHERE en.profile_id = user_b
  LIMIT 1;
  
  IF mutual_friend_name IS NOT NULL THEN
    SELECT ARRAY[
      (SELECT full_name FROM profiles WHERE id = user_a),
      mutual_friend_name,
      (SELECT full_name FROM profiles WHERE id = user_b)
    ] INTO path;
    RETURN path;
  END IF;
  
  -- No connection found
  RETURN ARRAY[]::TEXT[];
END;
$$;

-- Function to get degree of separation
CREATE OR REPLACE FUNCTION get_degree_of_separation(user_a UUID, user_b UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Same user
  IF user_a = user_b THEN
    RETURN 0;
  END IF;
  
  -- Direct friends (1st degree)
  IF EXISTS (
    SELECT 1 FROM friendships f
    WHERE (f.user1_id = user_a AND f.user2_id = user_b) OR
          (f.user2_id = user_a AND f.user1_id = user_b)
  ) THEN
    RETURN 1;
  END IF;
  
  -- Extended network (2nd degree)
  IF EXISTS (
    SELECT 1 FROM get_extended_network(user_a) en
    WHERE en.profile_id = user_b
  ) THEN
    RETURN 2;
  END IF;
  
  -- No connection
  RETURN NULL;
END;
$$;