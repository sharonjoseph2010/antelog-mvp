-- Drop the restrictive check constraint on notifications.type
-- This allows any notification type value to be inserted (flexible for MVP development)

ALTER TABLE notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

-- No constraint added back - allows any string value for type column
-- This provides maximum flexibility during MVP testing phase