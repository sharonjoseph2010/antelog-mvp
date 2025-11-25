-- Change audience_type from single enum to array to support multiple audiences
-- This allows sending a request to multiple audiences simultaneously

-- First, add the new audience_types array column
ALTER TABLE requests 
  ADD COLUMN audience_types TEXT[];

-- Migrate existing data: convert single audience_type to array
UPDATE requests 
  SET audience_types = ARRAY[audience_type::TEXT]
  WHERE audience_type IS NOT NULL;

-- Make audience_types not nullable and add constraint
ALTER TABLE requests 
  ALTER COLUMN audience_types SET NOT NULL,
  ADD CONSTRAINT requests_audience_types_check 
    CHECK (array_length(audience_types, 1) > 0);

-- Add index for better query performance
CREATE INDEX idx_requests_audience_types ON requests USING GIN (audience_types);

-- Update RLS policies to work with the new array column
-- Drop old policy that used single audience_type
DROP POLICY IF EXISTS "Users can view requests sent to them or created by them" ON requests;

-- Create new policy that handles multiple audiences
CREATE POLICY "Users can view requests sent to them or created by them"
  ON requests
  FOR SELECT
  USING (
    creator_id = auth.uid() OR
    -- 1st Network
    ('first_network' = ANY(audience_types) AND EXISTS (
      SELECT 1 FROM friendships
      WHERE ((friendships.user1_id = auth.uid() AND friendships.user2_id = requests.creator_id) OR 
             (friendships.user2_id = auth.uid() AND friendships.user1_id = requests.creator_id))
    )) OR
    -- Group
    ('group' = ANY(audience_types) AND group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = requests.group_id AND group_members.user_id = auth.uid()
    )) OR
    -- Specific People
    ('specific_people' = ANY(audience_types) AND selected_users IS NOT NULL AND auth.uid() = ANY(selected_users)) OR
    -- Public
    ('public' = ANY(audience_types) AND auth.uid() IS NOT NULL)
  );

-- Note: We keep the old audience_type column for backward compatibility during transition
-- It can be dropped in a future migration once all code is updated