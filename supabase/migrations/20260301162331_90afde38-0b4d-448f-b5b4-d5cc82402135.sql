
-- Master Directory Lists
CREATE TABLE IF NOT EXISTS master_directory_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  title_normalized TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  original_contributor_id UUID REFERENCES profiles(id),
  contributor_count INTEGER DEFAULT 1,
  total_votes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- All items in a list (Top 10 + Pool combined)
CREATE TABLE IF NOT EXISTS master_directory_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID REFERENCES master_directory_lists(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  item_name_normalized TEXT NOT NULL,
  vote_count INTEGER DEFAULT 0,
  added_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, item_name_normalized)
);

-- One vote per verified user per item
CREATE TABLE IF NOT EXISTS master_directory_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID REFERENCES master_directory_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, user_id)
);

-- Enable RLS
ALTER TABLE master_directory_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_directory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_directory_votes ENABLE ROW LEVEL SECURITY;

-- RLS: Everyone can read
CREATE POLICY "Public read lists" ON master_directory_lists FOR SELECT USING (true);
CREATE POLICY "Public read items" ON master_directory_items FOR SELECT USING (true);
CREATE POLICY "Public read votes" ON master_directory_votes FOR SELECT USING (true);

-- RLS: Only verified users can insert
CREATE POLICY "Verified users can add lists" ON master_directory_lists
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'verified')
  );

CREATE POLICY "Verified users can add items" ON master_directory_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'verified')
  );

CREATE POLICY "Verified users can vote" ON master_directory_votes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'verified')
  );

-- Function: normalize text for duplicate detection
CREATE OR REPLACE FUNCTION normalize_directory_text(input TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(regexp_replace(trim(input), '\s+', ' ', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: fuzzy search items in pool
CREATE OR REPLACE FUNCTION search_directory_pool_items(
  p_list_id UUID,
  p_query TEXT,
  p_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  item_name TEXT,
  vote_count INTEGER,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mdi.id,
    mdi.item_name,
    mdi.vote_count,
    similarity(mdi.item_name_normalized, normalize_directory_text(p_query))::FLOAT as similarity_score
  FROM master_directory_items mdi
  WHERE mdi.list_id = p_list_id
    AND similarity(mdi.item_name_normalized, normalize_directory_text(p_query)) > p_threshold
  ORDER BY similarity_score DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Function: find similar directory lists by title
CREATE OR REPLACE FUNCTION find_similar_directory_lists(
  p_title TEXT,
  p_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  contributor_count INTEGER,
  total_votes INTEGER,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mdl.id,
    mdl.title,
    mdl.contributor_count,
    mdl.total_votes,
    similarity(mdl.title_normalized, normalize_directory_text(p_title))::FLOAT as similarity_score
  FROM master_directory_lists mdl
  WHERE similarity(mdl.title_normalized, normalize_directory_text(p_title)) > p_threshold
  ORDER BY similarity_score DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Trigger: update vote_count on master_directory_items when vote inserted
CREATE OR REPLACE FUNCTION update_directory_item_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE master_directory_items
  SET vote_count = vote_count + 1
  WHERE id = NEW.item_id;

  UPDATE master_directory_lists
  SET 
    total_votes = total_votes + 1,
    contributor_count = (
      SELECT COUNT(DISTINCT mdv.user_id) 
      FROM master_directory_votes mdv
      JOIN master_directory_items mdi ON mdv.item_id = mdi.id
      WHERE mdi.list_id = (SELECT list_id FROM master_directory_items WHERE id = NEW.item_id)
    ),
    updated_at = NOW()
  WHERE id = (SELECT list_id FROM master_directory_items WHERE id = NEW.item_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_directory_vote_inserted
  AFTER INSERT ON master_directory_votes
  FOR EACH ROW EXECUTE FUNCTION update_directory_item_vote_count();
