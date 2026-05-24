-- Drop existing columns from request_responses and add overall_notes
ALTER TABLE request_responses DROP COLUMN IF EXISTS content;
ALTER TABLE request_responses DROP COLUMN IF EXISTS response_type;
ALTER TABLE request_responses DROP COLUMN IF EXISTS list_id;
ALTER TABLE request_responses ADD COLUMN IF NOT EXISTS overall_notes TEXT;

-- Create response_recommendations table
CREATE TABLE IF NOT EXISTS response_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES request_responses(id) ON DELETE CASCADE,
  recommendation_text TEXT NOT NULL,
  recommendation_text_normalized TEXT NOT NULL,
  position INTEGER NOT NULL,
  quick_details TEXT,
  reason TEXT NOT NULL,
  link TEXT,
  vote_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for response_recommendations
CREATE INDEX IF NOT EXISTS idx_response_recommendations_response ON response_recommendations(response_id);
CREATE INDEX IF NOT EXISTS idx_response_recommendations_normalized ON response_recommendations(recommendation_text_normalized);

-- Create recommendation_votes table
CREATE TABLE IF NOT EXISTS recommendation_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES response_recommendations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recommendation_id, user_id)
);

-- Create indexes for recommendation_votes
CREATE INDEX IF NOT EXISTS idx_recommendation_votes_recommendation ON recommendation_votes(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_votes_user ON recommendation_votes(user_id);

-- Enable RLS on new tables
ALTER TABLE response_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_votes ENABLE ROW LEVEL SECURITY;

-- RLS policies for response_recommendations
CREATE POLICY "Users can view recommendations for visible responses"
ON response_recommendations FOR SELECT
USING (EXISTS (
  SELECT 1 FROM request_responses rr
  WHERE rr.id = response_recommendations.response_id
));

CREATE POLICY "Users can create recommendations for their responses"
ON response_recommendations FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM request_responses rr
  WHERE rr.id = response_recommendations.response_id
  AND rr.responder_id = auth.uid()
));

CREATE POLICY "Users can update their own recommendations"
ON response_recommendations FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM request_responses rr
  WHERE rr.id = response_recommendations.response_id
  AND rr.responder_id = auth.uid()
));

CREATE POLICY "Users can delete their own recommendations"
ON response_recommendations FOR DELETE
USING (EXISTS (
  SELECT 1 FROM request_responses rr
  WHERE rr.id = response_recommendations.response_id
  AND rr.responder_id = auth.uid()
));

-- RLS policies for recommendation_votes
CREATE POLICY "Users can view all votes"
ON recommendation_votes FOR SELECT
USING (true);

CREATE POLICY "Users can create their own votes"
ON recommendation_votes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own votes"
ON recommendation_votes FOR DELETE
USING (auth.uid() = user_id);

-- Function to update vote_count on response_recommendations
CREATE OR REPLACE FUNCTION update_recommendation_vote_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE response_recommendations
    SET vote_count = vote_count + 1
    WHERE id = NEW.recommendation_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE response_recommendations
    SET vote_count = vote_count - 1
    WHERE id = OLD.recommendation_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Create trigger for vote count updates
DROP TRIGGER IF EXISTS update_recommendation_vote_count_trigger ON recommendation_votes;
CREATE TRIGGER update_recommendation_vote_count_trigger
AFTER INSERT OR DELETE ON recommendation_votes
FOR EACH ROW
EXECUTE FUNCTION update_recommendation_vote_count();