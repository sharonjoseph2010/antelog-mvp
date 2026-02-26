
-- Allow anyone (including anonymous/unauthenticated) to read share_links by token
CREATE POLICY "Anyone can view share links by token"
  ON public.share_links
  FOR SELECT
  USING (true);

-- Allow anyone to update share_links (for incrementing times_opened/current_responses)
CREATE POLICY "Anyone can update share link counters"
  ON public.share_links
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow anyone to insert share_links (guests generating their own links)
CREATE POLICY "Anyone can create share links"
  ON public.share_links
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to insert guest contributions
CREATE POLICY "Anyone can submit guest contributions"
  ON public.guest_contributions
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to read guest contributions (for viewing responses)
CREATE POLICY "Anyone can view guest contributions"
  ON public.guest_contributions
  FOR SELECT
  USING (true);

-- Allow anonymous users to read requests (for guest response page)
-- The existing SELECT policy requires auth.uid(), so we need a permissive one for anon
CREATE POLICY "Anyone can view requests by id for guest sharing"
  ON public.requests
  FOR SELECT
  USING (true);

-- Allow anonymous to call generate_share_token (already public, but ensure access)
GRANT EXECUTE ON FUNCTION public.generate_share_token() TO anon;
