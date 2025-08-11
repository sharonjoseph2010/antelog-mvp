-- Admin access policies for profiles table
-- Allow specific admin email to SELECT and UPDATE any profile

-- Create policy for admin SELECT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Admins can view all profiles'
  ) THEN
    CREATE POLICY "Admins can view all profiles"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING ((auth.jwt() ->> 'email') = 'sharonjoseph2010@gmail.com');
  END IF;
END $$;

-- Create policy for admin UPDATE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Admins can update profiles'
  ) THEN
    CREATE POLICY "Admins can update profiles"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING ((auth.jwt() ->> 'email') = 'sharonjoseph2010@gmail.com');
  END IF;
END $$;