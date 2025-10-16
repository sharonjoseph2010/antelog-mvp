-- Update RLS policy for requests to include public requests visibility
DROP POLICY IF EXISTS "Users can view requests sent to them or created by them" ON requests;

CREATE POLICY "Users can view requests sent to them or created by them" ON requests
FOR SELECT USING (
  creator_id = auth.uid() OR 
  (audience_type = 'friends' AND EXISTS (
    SELECT 1 FROM friendships 
    WHERE ((user1_id = auth.uid() AND user2_id = creator_id) OR 
           (user2_id = auth.uid() AND user1_id = creator_id))
  )) OR 
  (audience_type = 'extended_network' AND EXISTS (
    SELECT 1 FROM get_extended_network(creator_id) 
    WHERE profile_id = auth.uid()
  )) OR 
  (audience_type = 'specific_group' AND group_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM group_members 
    WHERE group_id = requests.group_id AND user_id = auth.uid()
  )) OR
  (audience_type = 'public' AND auth.uid() IS NOT NULL)
);