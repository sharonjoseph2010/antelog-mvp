-- Create anonymous_handles table for privacy-first display
CREATE TABLE IF NOT EXISTS public.anonymous_handles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_handle TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_expertise table for AI-powered matching
CREATE TABLE IF NOT EXISTS public.user_expertise (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  expertise_tags TEXT[] NOT NULL DEFAULT '{}',
  confidence_scores NUMERIC[] NOT NULL DEFAULT '{}',
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.anonymous_handles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_expertise ENABLE ROW LEVEL SECURITY;

-- RLS Policies for anonymous_handles
CREATE POLICY "Users can view their own anonymous handle"
ON public.anonymous_handles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can manage anonymous handles"
ON public.anonymous_handles FOR ALL
USING (false)
WITH CHECK (false);

-- RLS Policies for user_expertise
CREATE POLICY "Users can view their own expertise"
ON public.user_expertise FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can manage user expertise"
ON public.user_expertise FOR ALL
USING (false)
WITH CHECK (false);

-- Function to generate unique anonymous handle
CREATE OR REPLACE FUNCTION public.generate_anonymous_handle()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_handle TEXT;
  handle_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate format: @user followed by 4-digit random number
    new_handle := '@user' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    
    -- Check if handle already exists
    SELECT EXISTS(
      SELECT 1 FROM anonymous_handles WHERE anonymous_handle = new_handle
    ) INTO handle_exists;
    
    EXIT WHEN NOT handle_exists;
  END LOOP;
  
  RETURN new_handle;
END;
$$;

-- Function to create anonymous handle on profile creation
CREATE OR REPLACE FUNCTION public.create_anonymous_handle_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create for verified users with complete profiles
  IF NEW.is_verified = true AND NEW.full_name IS NOT NULL AND NEW.handle IS NOT NULL THEN
    INSERT INTO anonymous_handles (user_id, anonymous_handle)
    VALUES (NEW.id, public.generate_anonymous_handle())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to create anonymous handle
CREATE TRIGGER create_anonymous_handle_trigger
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.create_anonymous_handle_for_user();

-- Function to check if user is in viewer's network (direct friends or extended network)
CREATE OR REPLACE FUNCTION public.is_in_network(viewer_id UUID, profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_direct_friend BOOLEAN;
  is_extended BOOLEAN;
BEGIN
  -- Check if they are the same user
  IF viewer_id = profile_id THEN
    RETURN true;
  END IF;
  
  -- Check direct friendship
  SELECT EXISTS (
    SELECT 1 FROM friendships f
    WHERE (f.user1_id = viewer_id AND f.user2_id = profile_id)
       OR (f.user2_id = viewer_id AND f.user1_id = profile_id)
  ) INTO is_direct_friend;
  
  IF is_direct_friend THEN
    RETURN true;
  END IF;
  
  -- Check extended network
  SELECT EXISTS (
    SELECT 1 FROM get_extended_network(viewer_id) en
    WHERE en.profile_id = profile_id
  ) INTO is_extended;
  
  RETURN is_extended;
END;
$$;

-- Function to get display identity (real or anonymous)
CREATE OR REPLACE FUNCTION public.get_display_identity(viewer_id UUID, profile_id UUID)
RETURNS TABLE(
  name TEXT,
  handle TEXT,
  is_anonymous BOOLEAN,
  is_verified BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN public.is_in_network(viewer_id, profile_id) THEN p.full_name
      ELSE ah.anonymous_handle
    END as name,
    CASE 
      WHEN public.is_in_network(viewer_id, profile_id) THEN p.handle
      ELSE ah.anonymous_handle
    END as handle,
    NOT public.is_in_network(viewer_id, profile_id) as is_anonymous,
    p.is_verified
  FROM profiles p
  LEFT JOIN anonymous_handles ah ON ah.user_id = p.id
  WHERE p.id = profile_id;
END;
$$;

-- Function to calculate request relevance score for user
CREATE OR REPLACE FUNCTION public.calculate_request_relevance(user_id_param UUID, request_id_param UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_tags TEXT[];
  request_title TEXT;
  request_category list_category;
  relevance_score NUMERIC := 0;
  tag TEXT;
BEGIN
  -- Get user's expertise tags
  SELECT expertise_tags INTO user_tags
  FROM user_expertise
  WHERE user_id = user_id_param;
  
  -- Get request details
  SELECT r.title, r.category INTO request_title, request_category
  FROM requests r
  WHERE r.id = request_id_param;
  
  -- If no expertise tags, return 0
  IF user_tags IS NULL OR array_length(user_tags, 1) IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Calculate relevance based on tag matches in title and category
  FOREACH tag IN ARRAY user_tags
  LOOP
    -- Check if tag appears in request title (case insensitive)
    IF request_title ILIKE '%' || tag || '%' THEN
      relevance_score := relevance_score + 2;
    END IF;
    
    -- Check if tag matches category
    IF request_category::TEXT ILIKE '%' || tag || '%' THEN
      relevance_score := relevance_score + 3;
    END IF;
  END LOOP;
  
  RETURN relevance_score;
END;
$$;