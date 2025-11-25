-- Update request_forwards table to support network path tracking
ALTER TABLE request_forwards 
ADD COLUMN IF NOT EXISTS forwarded_to UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS network_depth INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS network_path UUID[] DEFAULT '{}';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_request_forwards_request_id ON request_forwards(request_id);
CREATE INDEX IF NOT EXISTS idx_request_forwards_forwarded_by ON request_forwards(forwarded_by_user_id);

-- Add constraint to prevent forwarding same request twice by same user
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_request_forward 
ON request_forwards(request_id, forwarded_by_user_id);

-- Update RLS policies for request_forwards
DROP POLICY IF EXISTS "Users can create forwards" ON request_forwards;
DROP POLICY IF EXISTS "Users can view relevant forwards" ON request_forwards;

CREATE POLICY "Users can create forwards"
ON request_forwards FOR INSERT
WITH CHECK (
  forwarded_by_user_id = auth.uid() AND
  -- Can only forward requests they have access to
  EXISTS (
    SELECT 1 FROM requests r 
    WHERE r.id = request_forwards.request_id
    AND r.allow_forwarding = true
  )
);

CREATE POLICY "Users can view relevant forwards"
ON request_forwards FOR SELECT
USING (
  -- Can view if they forwarded it
  forwarded_by_user_id = auth.uid() OR
  -- Can view if they're in the forwarded_to array
  auth.uid() = ANY(forwarded_to) OR
  -- Can view if they created the original request
  EXISTS (
    SELECT 1 FROM requests r
    WHERE r.id = request_forwards.request_id 
    AND r.creator_id = auth.uid()
  )
);