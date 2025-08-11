-- Manually verify the admin profile for testing navigation
update public.profiles p
set verification_status = 'verified',
    is_verified = true,
    updated_at = now()
where p.id in (
  select u.id from auth.users u where u.email = 'sharonjoseph2010@gmail.com'
);
