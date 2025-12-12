-- Note: We'll use the existing lists and list_items tables for saving recommendations
-- Just need to add a reference to track which list came from which request

-- Add source_request_id to lists table to track which request a saved list came from
ALTER TABLE public.lists 
ADD COLUMN IF NOT EXISTS source_request_id UUID REFERENCES public.requests(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_lists_source_request ON public.lists(source_request_id);

-- Add comment for documentation
COMMENT ON COLUMN public.lists.source_request_id IS 'References the request if this list was created by closing/resolving a request';