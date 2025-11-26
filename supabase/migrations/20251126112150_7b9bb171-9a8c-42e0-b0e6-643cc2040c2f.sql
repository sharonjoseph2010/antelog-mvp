-- Drop existing restrictive INSERT policy that's blocking notifications
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON notifications;

-- Create new PERMISSIVE INSERT policy for notifications
-- This allows any authenticated user to create notifications for any user
CREATE POLICY "Authenticated users can create notifications"
ON notifications
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Ensure SELECT policy exists for users to view their own notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
CREATE POLICY "Users can view their own notifications"
ON notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Ensure UPDATE policy exists
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
CREATE POLICY "Users can update their own notifications"
ON notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Ensure DELETE policy exists
DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;
CREATE POLICY "Users can delete their own notifications"
ON notifications
FOR DELETE
TO authenticated
USING (user_id = auth.uid());