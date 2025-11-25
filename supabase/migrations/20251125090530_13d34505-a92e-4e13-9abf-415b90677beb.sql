-- Add CASCADE delete for request foreign keys if not already present
-- This ensures that deleting a request deletes all related data

-- Drop existing constraints if they exist
ALTER TABLE request_responses DROP CONSTRAINT IF EXISTS fk_request_responses_request_id;
ALTER TABLE request_forwards DROP CONSTRAINT IF EXISTS request_forwards_request_id_fkey;

-- Add CASCADE delete constraints
ALTER TABLE request_responses
  ADD CONSTRAINT fk_request_responses_request_id 
  FOREIGN KEY (request_id) 
  REFERENCES requests(id) 
  ON DELETE CASCADE;

ALTER TABLE request_forwards
  ADD CONSTRAINT request_forwards_request_id_fkey 
  FOREIGN KEY (request_id) 
  REFERENCES requests(id) 
  ON DELETE CASCADE;

-- Ensure RLS policies allow users to UPDATE and DELETE their own requests
-- (These should already exist, but let's make sure)

-- Allow users to update their own requests
DROP POLICY IF EXISTS "Users can update their own requests" ON requests;
CREATE POLICY "Users can update their own requests"
  ON requests
  FOR UPDATE
  USING (creator_id = auth.uid());

-- Allow users to delete their own requests  
DROP POLICY IF EXISTS "Users can delete their own requests" ON requests;
CREATE POLICY "Users can delete their own requests"
  ON requests
  FOR DELETE
  USING (creator_id = auth.uid());