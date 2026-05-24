
-- Add directory_list_id column to lists table to track published directory entries
ALTER TABLE public.lists 
ADD COLUMN directory_list_id uuid REFERENCES public.master_directory_lists(id) DEFAULT NULL;

-- Create function to sync title/category edits to master_directory_lists
-- Needed because users can't UPDATE master_directory_lists directly (RLS)
CREATE OR REPLACE FUNCTION public.sync_directory_list_edits(
  p_list_id uuid,
  p_new_title text,
  p_new_category text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_directory_list_id uuid;
  v_owner_id uuid;
BEGIN
  -- Get the list's directory_list_id and owner
  SELECT directory_list_id, owner_id INTO v_directory_list_id, v_owner_id
  FROM lists
  WHERE id = p_list_id;

  -- Verify the caller owns this list
  IF v_owner_id IS NULL OR v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to edit this list';
  END IF;

  -- Only sync if published to directory
  IF v_directory_list_id IS NULL THEN
    RETURN;
  END IF;

  -- Update master_directory_lists
  UPDATE master_directory_lists
  SET 
    title = p_new_title,
    title_normalized = lower(regexp_replace(trim(p_new_title), '\s+', ' ', 'g')),
    category = p_new_category,
    updated_at = now()
  WHERE id = v_directory_list_id;
END;
$$;
