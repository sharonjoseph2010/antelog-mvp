-- Verify current testing user by ID seen in recent logs
update public.profiles
set verification_status = 'verified',
    is_verified = true,
    updated_at = now()
where id = 'ac8837f6-b2e1-4595-9dc8-125e863c4dfd';