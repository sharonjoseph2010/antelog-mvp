-- Create admin delete user function with comprehensive cleanup
CREATE OR REPLACE FUNCTION public.admin_delete_user(user_id_to_delete UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Verify caller is admin
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;
  
  -- Prevent admin from deleting themselves
  IF auth.uid() = user_id_to_delete THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;
  
  -- Delete in order to respect dependencies
  -- Note: Many of these will be handled by ON DELETE CASCADE if constraints are in place
  
  -- Delete list items from user's lists
  DELETE FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE owner_id = user_id_to_delete);
  
  -- Delete user's lists
  DELETE FROM lists WHERE owner_id = user_id_to_delete;
  
  -- Delete request responses
  DELETE FROM request_responses WHERE responder_id = user_id_to_delete;
  DELETE FROM request_responses WHERE request_id IN (SELECT id FROM requests WHERE creator_id = user_id_to_delete);
  
  -- Delete request forwards
  DELETE FROM request_forwards WHERE forwarded_by_user_id = user_id_to_delete;
  DELETE FROM request_forwards WHERE request_id IN (SELECT id FROM requests WHERE creator_id = user_id_to_delete);
  
  -- Delete request votes
  DELETE FROM request_votes WHERE voter_id = user_id_to_delete;
  
  -- Delete user's requests
  DELETE FROM requests WHERE creator_id = user_id_to_delete;
  
  -- Delete directory votes
  DELETE FROM directory_votes WHERE voter_id = user_id_to_delete;
  
  -- Delete directory entries
  DELETE FROM directory_entries WHERE contributor_id = user_id_to_delete;
  
  -- Delete contact imports
  DELETE FROM contact_imports WHERE user_id = user_id_to_delete;
  DELETE FROM contact_imports WHERE matched_user_id = user_id_to_delete;
  
  -- Delete friendships
  DELETE FROM friendships WHERE user1_id = user_id_to_delete OR user2_id = user_id_to_delete;
  
  -- Delete friend requests
  DELETE FROM friend_requests WHERE requester_id = user_id_to_delete OR addressee_id = user_id_to_delete;
  
  -- Delete friend suggestions
  DELETE FROM friend_suggestions WHERE user_id = user_id_to_delete OR suggested_user_id = user_id_to_delete;
  
  -- Delete group memberships
  DELETE FROM group_members WHERE user_id = user_id_to_delete;
  
  -- Delete groups created by user
  DELETE FROM groups WHERE creator_id = user_id_to_delete;
  
  -- Delete notifications
  DELETE FROM notifications WHERE user_id = user_id_to_delete OR related_user_id = user_id_to_delete;
  
  -- Delete anonymous handles
  DELETE FROM anonymous_handles WHERE user_id = user_id_to_delete;
  
  -- Delete user expertise
  DELETE FROM user_expertise WHERE user_id = user_id_to_delete;
  
  -- Delete contact access logs
  DELETE FROM contact_access_logs WHERE user_id = user_id_to_delete;
  
  -- Delete search analytics
  DELETE FROM search_analytics WHERE user_id = user_id_to_delete;
  
  -- Delete user roles
  DELETE FROM user_roles WHERE user_id = user_id_to_delete;
  
  -- Delete profile
  DELETE FROM profiles WHERE id = user_id_to_delete;
  
  -- Finally delete from auth.users (requires service role in practice, but function runs as definer)
  DELETE FROM auth.users WHERE id = user_id_to_delete;
END;
$function$;