-- Create enum for request categories
CREATE TYPE public.request_category AS ENUM ('films', 'places', 'products', 'services', 'other');

-- Create enum for request audience types
CREATE TYPE public.request_audience_type AS ENUM ('friends', 'extended_network', 'specific_group');

-- Create enum for request status
CREATE TYPE public.request_status AS ENUM ('open', 'responded', 'closed');

-- Create enum for response types
CREATE TYPE public.response_type AS ENUM ('existing_list', 'new_recommendations', 'comment');

-- Create enum for vote types
CREATE TYPE public.vote_type AS ENUM ('helpful', 'not_helpful');

-- Create requests table
CREATE TABLE public.requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL,
  title TEXT NOT NULL,
  category request_category NOT NULL,
  location TEXT,
  audience_type request_audience_type NOT NULL,
  status request_status NOT NULL DEFAULT 'open',
  group_id UUID, -- for specific_group audience_type
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create request_responses table
CREATE TABLE public.request_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL,
  responder_id UUID NOT NULL,
  response_type response_type NOT NULL,
  content TEXT NOT NULL,
  list_id UUID, -- if response_type is 'existing_list'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create request_votes table
CREATE TABLE public.request_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  response_id UUID NOT NULL,
  voter_id UUID NOT NULL,
  vote_type vote_type NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(response_id, voter_id) -- prevent duplicate votes
);

-- Enable RLS on all tables
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_votes ENABLE ROW LEVEL SECURITY;

-- RLS policies for requests table
CREATE POLICY "Users can view requests sent to them or created by them"
  ON public.requests FOR SELECT
  USING (
    creator_id = auth.uid() OR
    (audience_type = 'friends' AND EXISTS (
      SELECT 1 FROM friendships 
      WHERE (user1_id = auth.uid() AND user2_id = creator_id) 
         OR (user2_id = auth.uid() AND user1_id = creator_id)
    )) OR
    (audience_type = 'extended_network' AND EXISTS (
      SELECT 1 FROM get_extended_network(creator_id) 
      WHERE profile_id = auth.uid()
    )) OR
    (audience_type = 'specific_group' AND group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM group_members 
      WHERE group_id = requests.group_id AND user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can create their own requests"
  ON public.requests FOR INSERT
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Users can update their own requests"
  ON public.requests FOR UPDATE
  USING (creator_id = auth.uid());

CREATE POLICY "Users can delete their own requests"
  ON public.requests FOR DELETE
  USING (creator_id = auth.uid());

-- RLS policies for request_responses table
CREATE POLICY "Users can view responses to requests they can see"
  ON public.request_responses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM requests 
    WHERE requests.id = request_responses.request_id
  ));

CREATE POLICY "Users can create responses to requests they can see"
  ON public.request_responses FOR INSERT
  WITH CHECK (
    responder_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM requests 
      WHERE requests.id = request_responses.request_id
    )
  );

CREATE POLICY "Users can update their own responses"
  ON public.request_responses FOR UPDATE
  USING (responder_id = auth.uid());

CREATE POLICY "Users can delete their own responses"
  ON public.request_responses FOR DELETE
  USING (responder_id = auth.uid());

-- RLS policies for request_votes table
CREATE POLICY "Users can view votes on responses they can see"
  ON public.request_votes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM request_responses 
    WHERE request_responses.id = request_votes.response_id
  ));

CREATE POLICY "Users can vote on responses"
  ON public.request_votes FOR INSERT
  WITH CHECK (voter_id = auth.uid());

CREATE POLICY "Users can update their own votes"
  ON public.request_votes FOR UPDATE
  USING (voter_id = auth.uid());

CREATE POLICY "Users can delete their own votes"
  ON public.request_votes FOR DELETE
  USING (voter_id = auth.uid());

-- Create triggers for updated_at
CREATE TRIGGER update_requests_updated_at
  BEFORE UPDATE ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add foreign key constraints (optional for better data integrity)
-- Note: We don't add FK to profiles table as it references auth.users directly
ALTER TABLE public.requests 
  ADD CONSTRAINT fk_requests_group_id 
  FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE public.request_responses 
  ADD CONSTRAINT fk_request_responses_request_id 
  FOREIGN KEY (request_id) REFERENCES public.requests(id) ON DELETE CASCADE;

ALTER TABLE public.request_responses 
  ADD CONSTRAINT fk_request_responses_list_id 
  FOREIGN KEY (list_id) REFERENCES public.lists(id) ON DELETE SET NULL;

ALTER TABLE public.request_votes 
  ADD CONSTRAINT fk_request_votes_response_id 
  FOREIGN KEY (response_id) REFERENCES public.request_responses(id) ON DELETE CASCADE;