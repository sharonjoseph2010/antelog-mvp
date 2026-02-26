
-- STEP 1: Add 'reviewing' to request_status enum
ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'reviewing' AFTER 'responded';

-- STEP 2: Add metadata columns to existing lists table
ALTER TABLE lists 
ADD COLUMN IF NOT EXISTS total_votes INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_contributors INT DEFAULT 0;

-- STEP 3: Create recommendation_clusters table (temporary staging for review)
CREATE TABLE IF NOT EXISTS recommendation_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  
  -- The canonical name chosen for this cluster
  canonical_text TEXT NOT NULL,
  
  -- All recommendation IDs in this cluster
  recommendation_ids UUID[] NOT NULL DEFAULT '{}',
  
  -- Aggregated data
  total_votes INT DEFAULT 0,
  mention_count INT DEFAULT 0,
  
  -- Cluster metadata
  similarity_score DECIMAL(3,2),
  cluster_method TEXT DEFAULT 'fuzzy_match',
  
  -- Review status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'split')),
  
  position INT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_clusters_request ON recommendation_clusters(request_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_clusters_status ON recommendation_clusters(request_id, status);

-- STEP 4: Enable RLS on recommendation_clusters
ALTER TABLE recommendation_clusters ENABLE ROW LEVEL SECURITY;

-- Request creators can manage clusters for their requests
CREATE POLICY "Request creators can manage clusters"
ON recommendation_clusters FOR ALL
USING (EXISTS (
  SELECT 1 FROM requests r WHERE r.id = recommendation_clusters.request_id AND r.creator_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM requests r WHERE r.id = recommendation_clusters.request_id AND r.creator_id = auth.uid()
));

-- Users who can see the request can view clusters
CREATE POLICY "Users can view clusters for visible requests"
ON recommendation_clusters FOR SELECT
USING (EXISTS (
  SELECT 1 FROM requests r WHERE r.id = recommendation_clusters.request_id
));

-- STEP 5: Create cluster_details view
CREATE OR REPLACE VIEW cluster_details AS
SELECT 
  rc.id as cluster_id,
  rc.request_id,
  rc.canonical_text,
  rc.total_votes,
  rc.mention_count,
  rc.similarity_score,
  rc.status,
  rc.position,
  (
    SELECT json_agg(
      json_build_object(
        'id', rr.id,
        'text', rr.recommendation_text,
        'votes', rr.vote_count,
        'contributor', COALESCE(p.full_name, 'Anonymous')
      )
    )
    FROM unnest(rc.recommendation_ids) AS rec_id
    LEFT JOIN response_recommendations rr ON rr.id = rec_id
    LEFT JOIN request_responses resp ON resp.id = rr.response_id
    LEFT JOIN profiles p ON p.id = resp.responder_id
  ) as variations
FROM recommendation_clusters rc;
