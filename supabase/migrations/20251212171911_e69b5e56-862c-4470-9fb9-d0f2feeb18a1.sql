-- Enable pg_trgm extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create function for similarity-based recommendation search
CREATE OR REPLACE FUNCTION search_similar_recommendations(
  search_term TEXT,
  req_id UUID,
  similarity_threshold FLOAT DEFAULT 0.4
)
RETURNS TABLE (
  id UUID,
  recommendation_text TEXT,
  vote_count INTEGER,
  similarity_score FLOAT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rr.id,
    rr.recommendation_text,
    rr.vote_count,
    similarity(rr.recommendation_text_normalized, search_term)::FLOAT as similarity_score
  FROM response_recommendations rr
  JOIN request_responses resp ON rr.response_id = resp.id
  WHERE resp.request_id = req_id
    AND similarity(rr.recommendation_text_normalized, search_term) > similarity_threshold
  ORDER BY similarity_score DESC
  LIMIT 5;
END;
$$;