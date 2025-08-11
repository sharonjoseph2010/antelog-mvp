-- 1) Create enum for verification status
DO $$ BEGIN
  CREATE TYPE public.verification_status AS ENUM ('pending', 'verified', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Add columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status public.verification_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS student_id_number text,
  ADD COLUMN IF NOT EXISTS id_card_image_url text;

-- Keep is_verified in sync for convenience when status changes
CREATE OR REPLACE FUNCTION public.sync_is_verified_with_status()
RETURNS trigger AS $$
BEGIN
  NEW.is_verified := COALESCE(NEW.verification_status = 'verified', FALSE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_is_verified_with_status ON public.profiles;
CREATE TRIGGER trg_sync_is_verified_with_status
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_is_verified_with_status();

-- 3) Ensure updated_at is maintained on updates
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Create storage bucket for ID cards
INSERT INTO storage.buckets (id, name, public)
VALUES ('id-cards', 'id-cards', false)
ON CONFLICT (id) DO NOTHING;

-- 5) Storage RLS policies for id-cards bucket
-- Allow users to read their own files
DROP POLICY IF EXISTS "Users can read their own id cards" ON storage.objects;
CREATE POLICY "Users can read their own id cards"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'id-cards'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to upload to their own folder (path starts with their user id)
DROP POLICY IF EXISTS "Users can upload their own id cards" ON storage.objects;
CREATE POLICY "Users can upload their own id cards"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'id-cards'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to update their own files
DROP POLICY IF EXISTS "Users can update their own id cards" ON storage.objects;
CREATE POLICY "Users can update their own id cards"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'id-cards'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'id-cards'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own files
DROP POLICY IF EXISTS "Users can delete their own id cards" ON storage.objects;
CREATE POLICY "Users can delete their own id cards"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'id-cards'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
