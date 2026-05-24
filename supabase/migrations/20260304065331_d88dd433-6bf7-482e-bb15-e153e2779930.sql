
-- Drop FK constraint on recommendation_votes to allow voting on guest recommendations
-- Guest recommendations are stored in guest_contributions.recommendations (JSONB)
-- and use deterministic UUIDs derived from guest_contribution_id + position
ALTER TABLE public.recommendation_votes 
DROP CONSTRAINT recommendation_votes_recommendation_id_fkey;
