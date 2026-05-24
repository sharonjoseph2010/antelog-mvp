-- Create share_links table for tracking external shares
CREATE TABLE public.share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
  parent_link_id UUID REFERENCES share_links(id) ON DELETE CASCADE,
  token VARCHAR(12) UNIQUE NOT NULL,
  generated_by_user_id UUID REFERENCES profiles(id),
  generated_by_name TEXT,
  generated_by_contact TEXT,
  max_responses INT DEFAULT 5,
  current_responses INT DEFAULT 0,
  times_opened INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_share_links_token ON share_links(token);
CREATE INDEX idx_share_links_request ON share_links(request_id);
CREATE INDEX idx_share_links_parent ON share_links(parent_link_id);

-- Create guest_contributions table for external responses
CREATE TABLE public.guest_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
  share_link_id UUID REFERENCES share_links(id) ON DELETE SET NULL,
  contributor_name TEXT NOT NULL,
  contributor_contact TEXT,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  invited_to_join BOOLEAN DEFAULT false,
  joined_antelog BOOLEAN DEFAULT false,
  converted_user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_guest_contributions_request ON guest_contributions(request_id);
CREATE INDEX idx_guest_contributions_link ON guest_contributions(share_link_id);
CREATE INDEX idx_guest_contributions_contact ON guest_contributions(contributor_contact);

-- Helper function to generate random 12-char tokens
CREATE OR REPLACE FUNCTION public.generate_share_token()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..12 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Enable RLS (no policies for now)
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_contributions ENABLE ROW LEVEL SECURITY;