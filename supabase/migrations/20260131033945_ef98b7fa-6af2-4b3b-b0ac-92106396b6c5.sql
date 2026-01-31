-- Create waitlist table for email collection
CREATE TABLE temp_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_temp_waitlist_email ON temp_waitlist(email);
CREATE INDEX idx_temp_waitlist_created ON temp_waitlist(created_at);

-- Allow anonymous inserts for waitlist signups (no auth required)
ALTER TABLE temp_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can join waitlist"
ON temp_waitlist FOR INSERT
WITH CHECK (true);

-- Only admins can view waitlist entries
CREATE POLICY "Admins can view waitlist"
ON temp_waitlist FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));