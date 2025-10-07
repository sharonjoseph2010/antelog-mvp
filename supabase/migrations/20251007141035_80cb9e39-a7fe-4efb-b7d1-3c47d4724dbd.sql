-- Fix contact_imports RLS policies to remove auth.users check
-- The EXISTS check against auth.users causes permission denied errors

-- Drop existing policies
DROP POLICY IF EXISTS "Secure contact creation - own contacts only" ON public.contact_imports;
DROP POLICY IF EXISTS "Secure contact viewing - own contacts only" ON public.contact_imports;
DROP POLICY IF EXISTS "Secure contact updates - own contacts only" ON public.contact_imports;
DROP POLICY IF EXISTS "Secure contact deletion - own contacts only" ON public.contact_imports;
DROP POLICY IF EXISTS "Deny anonymous access to contact_imports" ON public.contact_imports;

-- Recreate policies without auth.users check
CREATE POLICY "Users can insert own contacts"
ON public.contact_imports
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own contacts"
ON public.contact_imports
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own contacts"
ON public.contact_imports
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts"
ON public.contact_imports
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);