-- Add 'public' to request_audience_type enum
ALTER TYPE request_audience_type ADD VALUE IF NOT EXISTS 'public';