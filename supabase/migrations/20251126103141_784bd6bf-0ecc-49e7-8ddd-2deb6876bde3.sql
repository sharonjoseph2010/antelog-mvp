-- Fix notifications RLS policy to allow creation
-- The current "System can create notifications" policy has WITH CHECK false, blocking all inserts

-- Drop the restrictive policy
DROP POLICY IF EXISTS "System can create notifications" ON notifications;

-- Create new policy allowing authenticated users to insert notifications
-- This is needed because RequestsNew.tsx creates notifications client-side
CREATE POLICY "Authenticated users can create notifications"
ON notifications
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Verify other policies remain intact:
-- "Users can view their own notifications" (SELECT)
-- "Users can update their own notifications" (UPDATE) 
-- "Users can delete their own notifications" (DELETE)