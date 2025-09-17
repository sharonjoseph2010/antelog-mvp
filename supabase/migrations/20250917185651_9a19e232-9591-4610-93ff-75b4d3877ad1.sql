-- Manually populate directory_entries with existing public list items that aren't already synced
INSERT INTO directory_entries (
  content, category, url, contributor_id, list_id, list_item_id, created_at, updated_at
)
SELECT DISTINCT
  li.content, 
  l.category, 
  li.url, 
  l.owner_id, 
  li.list_id, 
  li.id,
  li.created_at,
  li.updated_at
FROM list_items li 
JOIN lists l ON li.list_id = l.id 
JOIN profiles p ON l.owner_id = p.id 
WHERE l.visibility = 'public' 
AND p.is_verified = true
ON CONFLICT (list_item_id) DO NOTHING;

-- Update vote counts based on existing votes
UPDATE directory_entries 
SET vote_count = (
  SELECT COALESCE(
    SUM(CASE WHEN vote_type = 'upvote' THEN 1 ELSE -1 END), 
    0
  )
  FROM directory_votes 
  WHERE directory_votes.entry_id = directory_entries.id
);

-- Create function to handle user signup profile creation with correct user_type
CREATE OR REPLACE FUNCTION public.handle_user_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = 'public'
AS $$
BEGIN
  -- Create profile for new user with user_type from metadata
  INSERT INTO public.profiles (
    id, 
    handle, 
    user_type,
    is_verified,
    trial_ends_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'handle', split_part(NEW.email, '@', 1) || substr(gen_random_uuid()::text, 1, 4)),
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'guest')::user_type,
    CASE WHEN COALESCE(NEW.raw_user_meta_data->>'user_type', 'guest') = 'verified' THEN false ELSE false END,
    CASE WHEN COALESCE(NEW.raw_user_meta_data->>'user_type', 'guest') = 'verified' THEN now() + interval '2 months' ELSE NULL END
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_user_signup();