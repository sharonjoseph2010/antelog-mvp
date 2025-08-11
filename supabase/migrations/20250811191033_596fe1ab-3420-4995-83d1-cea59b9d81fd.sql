-- 1) Enums for categories and visibility
DO $$ BEGIN
  CREATE TYPE public.list_category AS ENUM ('films', 'places', 'products', 'services', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.list_visibility AS ENUM ('private', 'friends', 'public');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Create tables
CREATE TABLE IF NOT EXISTS public.lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category public.list_category NOT NULL,
  visibility public.list_visibility NOT NULL DEFAULT 'private',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_lists_owner FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL,
  content TEXT NOT NULL,
  url TEXT,
  position INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_list_items_list FOREIGN KEY (list_id) REFERENCES public.lists(id) ON DELETE CASCADE
);

-- 3) Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lists_updated_at ON public.lists;
CREATE TRIGGER trg_lists_updated_at
BEFORE UPDATE ON public.lists
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_list_items_updated_at ON public.list_items;
CREATE TRIGGER trg_list_items_updated_at
BEFORE UPDATE ON public.list_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Indexes
CREATE INDEX IF NOT EXISTS idx_lists_owner ON public.lists(owner_id);
CREATE INDEX IF NOT EXISTS idx_lists_visibility ON public.lists(visibility);
CREATE INDEX IF NOT EXISTS idx_list_items_list ON public.list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_list_items_position ON public.list_items(list_id, position);

-- 5) Enable RLS
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;

-- 6) RLS policies for lists
DROP POLICY IF EXISTS "Owners can do everything with their lists" ON public.lists;
CREATE POLICY "Owners can do everything with their lists"
ON public.lists
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Public lists are viewable by everyone" ON public.lists;
CREATE POLICY "Public lists are viewable by everyone"
ON public.lists
FOR SELECT
USING (visibility = 'public');

-- 7) RLS policies for list_items (only owner of parent list can access)
DROP POLICY IF EXISTS "Owners can manage items of their lists" ON public.list_items;
CREATE POLICY "Owners can manage items of their lists"
ON public.list_items
USING (EXISTS (
  SELECT 1 FROM public.lists l WHERE l.id = list_id AND l.owner_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.lists l WHERE l.id = list_id AND l.owner_id = auth.uid()
));

DROP POLICY IF EXISTS "Items of public lists are viewable by everyone" ON public.list_items;
CREATE POLICY "Items of public lists are viewable by everyone"
ON public.list_items
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.lists l WHERE l.id = list_id AND l.visibility = 'public'
));

-- 8) Realtime support (optional, safe to run)
ALTER TABLE public.lists REPLICA IDENTITY FULL;
ALTER TABLE public.list_items REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname='public' AND tablename='lists';
  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lists;
  END IF;
END $$;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname='public' AND tablename='list_items';
  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.list_items;
  END IF;
END $$;