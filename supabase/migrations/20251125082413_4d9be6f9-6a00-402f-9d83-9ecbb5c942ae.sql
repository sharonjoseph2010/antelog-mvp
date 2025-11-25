-- Drop RLS policies that depend on audience_type
DROP POLICY IF EXISTS "Users can view requests sent to them or created by them" ON requests;
DROP POLICY IF EXISTS "Users can view relevant forwards" ON request_forwards;

-- Update request_audience_type enum to new simplified values
ALTER TYPE request_audience_type RENAME TO request_audience_type_old;

CREATE TYPE request_audience_type AS ENUM (
  'first_network',
  'group',
  'specific_people',
  'public'
);

-- Add new columns to requests table
ALTER TABLE requests 
ADD COLUMN IF NOT EXISTS allow_forwarding BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS selected_users UUID[];

-- Migrate existing data in requests table to new enum values
ALTER TABLE requests 
ALTER COLUMN audience_type TYPE request_audience_type 
USING (
  CASE audience_type::text
    WHEN 'friends' THEN 'first_network'::request_audience_type
    WHEN 'extended_network' THEN 'first_network'::request_audience_type
    WHEN 'specific_group' THEN 'group'::request_audience_type
    WHEN 'public' THEN 'public'::request_audience_type
    ELSE 'first_network'::request_audience_type
  END
);

-- Migrate existing data in request_forwards table to new enum values
ALTER TABLE request_forwards 
ALTER COLUMN forwarded_to_audience TYPE request_audience_type 
USING (
  CASE forwarded_to_audience::text
    WHEN 'friends' THEN 'first_network'::request_audience_type
    WHEN 'extended_network' THEN 'first_network'::request_audience_type
    WHEN 'specific_group' THEN 'group'::request_audience_type
    WHEN 'public' THEN 'public'::request_audience_type
    ELSE 'first_network'::request_audience_type
  END
);

-- Drop old enum type
DROP TYPE request_audience_type_old;

-- Recreate RLS policy for requests with new audience types
CREATE POLICY "Users can view requests sent to them or created by them"
ON requests FOR SELECT
USING (
  creator_id = auth.uid() OR
  -- First network requests
  (audience_type = 'first_network' AND EXISTS (
    SELECT 1 FROM friendships 
    WHERE (user1_id = auth.uid() AND user2_id = requests.creator_id) 
       OR (user2_id = auth.uid() AND user1_id = requests.creator_id)
  )) OR
  -- Group requests
  (audience_type = 'group' AND group_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM group_members 
    WHERE group_id = requests.group_id AND user_id = auth.uid()
  )) OR
  -- Specific people requests
  (audience_type = 'specific_people' AND selected_users IS NOT NULL AND auth.uid() = ANY(selected_users)) OR
  -- Public requests
  (audience_type = 'public' AND auth.uid() IS NOT NULL)
);

-- Recreate RLS policy for request_forwards with new audience types
CREATE POLICY "Users can view relevant forwards"
ON request_forwards FOR SELECT
USING (
  forwarded_by_user_id = auth.uid() OR
  (EXISTS (
    SELECT 1 FROM requests r
    WHERE r.id = request_forwards.request_id 
    AND (
      -- Forwarded to first network
      (forwarded_to_audience = 'first_network' AND EXISTS (
        SELECT 1 FROM friendships f 
        WHERE (f.user1_id = auth.uid() AND f.user2_id = request_forwards.forwarded_by_user_id)
           OR (f.user2_id = auth.uid() AND f.user1_id = request_forwards.forwarded_by_user_id)
      )) OR
      -- Forwarded to specific group
      (forwarded_to_audience = 'group' AND forwarded_to_group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM group_members gm 
        WHERE gm.group_id = request_forwards.forwarded_to_group_id AND gm.user_id = auth.uid()
      ))
    )
  ))
);