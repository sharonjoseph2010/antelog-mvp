-- Create friend suggestions for existing matching contacts
-- This will create suggestions for all the existing matches we found

INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
SELECT DISTINCT
  ci.user_id,
  p.id,
  'phone',
  ci.contact_phone
FROM contact_imports ci
JOIN profiles p ON ci.contact_phone = p.phone_number
WHERE ci.contact_phone IS NOT NULL 
  AND p.phone_number IS NOT NULL
  AND ci.user_id != p.id
  AND p.full_name IS NOT NULL 
  AND p.handle IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM friend_suggestions fs 
    WHERE fs.user_id = ci.user_id 
    AND fs.suggested_user_id = p.id
  );

-- Create reverse suggestions (mutual suggestions)
INSERT INTO friend_suggestions (user_id, suggested_user_id, match_type, match_value)
SELECT DISTINCT
  p.id,
  ci.user_id,
  'phone',
  ci.contact_phone
FROM contact_imports ci
JOIN profiles p ON ci.contact_phone = p.phone_number
WHERE ci.contact_phone IS NOT NULL 
  AND p.phone_number IS NOT NULL
  AND ci.user_id != p.id
  AND p.full_name IS NOT NULL 
  AND p.handle IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM friend_suggestions fs 
    WHERE fs.user_id = p.id 
    AND fs.suggested_user_id = ci.user_id
  );

-- Update existing contacts to mark them as matched
UPDATE contact_imports 
SET is_matched = true, 
    matched_user_id = p.id
FROM profiles p 
WHERE contact_imports.contact_phone = p.phone_number 
  AND contact_imports.user_id != p.id
  AND contact_imports.contact_phone IS NOT NULL
  AND p.phone_number IS NOT NULL
  AND NOT contact_imports.is_matched;