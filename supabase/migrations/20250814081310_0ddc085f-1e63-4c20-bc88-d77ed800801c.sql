-- Add foreign key constraints to friend_requests table
ALTER TABLE public.friend_requests 
ADD CONSTRAINT friend_requests_requester_id_fkey 
FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.friend_requests 
ADD CONSTRAINT friend_requests_addressee_id_fkey 
FOREIGN KEY (addressee_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key constraints to friendships table
ALTER TABLE public.friendships 
ADD CONSTRAINT friendships_user1_id_fkey 
FOREIGN KEY (user1_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.friendships 
ADD CONSTRAINT friendships_user2_id_fkey 
FOREIGN KEY (user2_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key constraint to contact_imports table
ALTER TABLE public.contact_imports 
ADD CONSTRAINT contact_imports_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;