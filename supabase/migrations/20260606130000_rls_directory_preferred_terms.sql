-- ============================================================================
-- SECURITY: enable RLS on directory_preferred_terms
-- Clears Supabase linter 0013_rls_disabled_in_public — this was the only
-- public table still missing RLS after the main remediation. It's a global
-- directory reference table (no per-user ownership), read by SECURITY DEFINER
-- normalization functions (which bypass RLS) and not accessed directly by the
-- client. With RLS off + GRANT ALL to anon/authenticated, anyone could write to
-- it; enabling RLS with only an authenticated SELECT policy locks writes to
-- service-role / definer functions while keeping the reference data readable.
-- ============================================================================
ALTER TABLE public.directory_preferred_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Directory preferred terms readable by authenticated" ON public.directory_preferred_terms;
CREATE POLICY "Directory preferred terms readable by authenticated"
ON public.directory_preferred_terms FOR SELECT TO authenticated
USING (true);
