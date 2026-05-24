ALTER TABLE requests 
ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
ADD COLUMN expiry_notified BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_requests_expires_at ON requests(expires_at) 
WHERE status != 'closed';