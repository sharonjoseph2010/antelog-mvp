-- Grant necessary permissions on guest_contributions for authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_contributions TO authenticated;
GRANT SELECT ON public.guest_contributions TO anon;