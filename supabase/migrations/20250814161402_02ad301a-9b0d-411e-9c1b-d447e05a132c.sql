-- Create friend suggestions for existing matching contacts 
-- This is a one-time fix for existing data

WITH matching_contacts AS (
  SELECT DISTINCT
    ci.user_id,
    p.id as matched_profile_id,
    ci.contact_phone,
    ci.contact_name,
    p.full_name as profile_name
  FROM contact_imports ci
  JOIN profiles p ON ci.contact_phone = p.phone_number
  WHERE ci.contact_phone IS NOT NULL
    AND p.phone_number IS NOT NULL
    AND ci.user_id != p.id
    AND NOT ci.is_matched
    AND p.full_name IS NOT NULL
    AND p.handle IS NOT NULL
)
INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
SELECT 
  user_id,
  matched_profile_id,
  'phone',
  contact_phone
FROM matching_contacts
WHERE NOT EXISTS (
  SELECT 1 FROM friend_suggestions fs
  WHERE fs.user_id = matching_contacts.user_id 
  AND fs.suggested_user_id = matching_contacts.matched_profile_id
);

-- Also create reverse suggestions
WITH matching_contacts AS (
  SELECT DISTINCT
    ci.user_id,
    p.id as matched_profile_id,
    ci.contact_phone,
    ci.contact_name,
    p.full_name as profile_name
  FROM contact_imports ci
  JOIN profiles p ON ci.contact_phone = p.phone_number
  WHERE ci.contact_phone IS NOT NULL
    AND p.phone_number IS NOT NULL
    AND ci.user_id != p.id
    AND NOT ci.is_matched
    AND p.full_name IS NOT NULL
    AND p.handle IS NOT NULL
)
INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
SELECT 
  matched_profile_id,
  user_id,
  'phone',
  contact_phone
FROM matching_contacts
WHERE NOT EXISTS (
  SELECT 1 FROM friend_suggestions fs
  WHERE fs.user_id = matching_contacts.matched_profile_id 
  AND fs.suggested_user_id = matching_contacts.user_id
);

-- Mark existing contacts as matched
UPDATE contact_imports 
SET is_matched = true, 
    matched_user_id = (
      SELECT p.id 
      FROM profiles p 
      WHERE p.phone_number = contact_imports.contact_phone 
      AND p.id != contact_imports.user_id
      AND p.full_name IS NOT NULL
      AND p.handle IS NOT NULL
      LIMIT 1
    )
WHERE contact_phone IS NOT NULL 
  AND NOT is_matched
  AND EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.phone_number = contact_imports.contact_phone 
    AND p.id != contact_imports.user_id
    AND p.full_name IS NOT NULL
    AND p.handle IS NOT NULL
  );