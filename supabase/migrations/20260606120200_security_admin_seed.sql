-- ============================================================================
-- SECURITY: bootstrap the admin role (finding #8)
--
-- The client admin gate moved from a hard-coded email to the user_roles table
-- (get_current_user_role / has_role). Seed the existing admin so they don't
-- lose access on deploy. Runs with migration privileges — the only way to
-- create the first admin now that user_roles writes are admin-gated.
--
-- Idempotent. Add more admins by inserting more rows (or via the admin UI once
-- one admin exists).
-- ============================================================================

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role
FROM auth.users u
WHERE lower(u.email) = 'sharonjoseph2010@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
