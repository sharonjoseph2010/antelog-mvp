-- Allow admins to delete waitlist entries
CREATE POLICY "Admins can delete waitlist entries"
ON temp_waitlist
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));