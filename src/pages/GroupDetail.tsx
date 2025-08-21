import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Users, UserMinus, UserPlus, Settings, Calendar, MessageSquare } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Group {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface GroupMember {
  id: string;
  user_id: string;
  added_at: string;
  profile?: {
    handle: string;
    full_name: string;
  };
  contact_name?: string;
}

const GroupDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [availableFriends, setAvailableFriends] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddMembers, setShowAddMembers] = useState(false);

  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUserId && id) {
      loadGroupData();
    }
  }, [currentUserId, id]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const loadGroupData = async () => {
    if (!currentUserId || !id) return;

    try {
      setIsLoading(true);

      // Load group details
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', id)
        .single();

      if (groupError) {
        if (groupError.code === 'PGRST116') {
          toast({
            title: "Group not found",
            description: "This group doesn't exist or you don't have access to it.",
            variant: "destructive",
          });
          navigate('/groups');
          return;
        }
        throw groupError;
      }

      setGroup(groupData);

      // Load group members
      const { data: membersData, error: membersError } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', id);

      if (membersError) throw membersError;

      // Get profiles for members
      if (membersData && membersData.length > 0) {
        const memberUserIds = membersData.map(m => m.user_id);
        
        const { data: memberProfiles } = await supabase
          .from('profiles')
          .select('id, handle, full_name')
          .in('id', memberUserIds);

        // Get contact names for members
        const { data: contactData } = await supabase
          .from('contact_imports')
          .select('matched_user_id, contact_name')
          .eq('user_id', currentUserId)
          .in('matched_user_id', memberUserIds)
          .eq('is_matched', true);

        const membersWithProfiles = membersData.map(member => ({
          ...member,
          profile: memberProfiles?.find(p => p.id === member.user_id),
          contact_name: contactData?.find(c => c.matched_user_id === member.user_id)?.contact_name
        }));

        setMembers(membersWithProfiles);
      } else {
        setMembers([]);
      }

      // Load available friends for adding (only if user is group creator)
      if (groupData.creator_id === currentUserId) {
        loadAvailableFriends(membersData?.map(m => m.user_id) || []);
      }
    } catch (error) {
      console.error('Error loading group data:', error);
      toast({
        title: "Failed to load group",
        description: "Could not load group details. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadAvailableFriends = async (excludeIds: string[]) => {
    if (!currentUserId) return;

    try {
      // Load friendships
      const { data: friendships1 } = await supabase
        .from('friendships')
        .select('*')
        .eq('user1_id', currentUserId);

      const { data: friendships2 } = await supabase
        .from('friendships')
        .select('*')
        .eq('user2_id', currentUserId);

      const allFriendships = [...(friendships1 || []), ...(friendships2 || [])];
      
      const friendIds = allFriendships
        .map(f => f.user1_id === currentUserId ? f.user2_id : f.user1_id)
        .filter(id => !excludeIds.includes(id));

      if (friendIds.length > 0) {
        const { data: friendProfiles } = await supabase
          .from('profiles')
          .select('id, handle, full_name')
          .in('id', friendIds);

        const { data: contactData } = await supabase
          .from('contact_imports')
          .select('matched_user_id, contact_name')
          .eq('user_id', currentUserId)
          .in('matched_user_id', friendIds)
          .eq('is_matched', true);

        const friendsWithProfiles = allFriendships
          .filter(f => {
            const friendId = f.user1_id === currentUserId ? f.user2_id : f.user1_id;
            return friendIds.includes(friendId);
          })
          .map(friendship => {
            const friendId = friendship.user1_id === currentUserId ? friendship.user2_id : friendship.user1_id;
            return {
              ...friendship,
              friend_profile: {
                ...friendProfiles?.find(p => p.id === friendId),
                id: friendId
              },
              contact_name: contactData?.find(c => c.matched_user_id === friendId)?.contact_name
            };
          });

        setAvailableFriends(friendsWithProfiles);
      }
    } catch (error) {
      console.error('Error loading available friends:', error);
    }
  };

  const addMemberToGroup = async (friendId: string, friendName: string) => {
    if (!id) return;

    try {
      const { error } = await supabase
        .from('group_members')
        .insert({
          group_id: id,
          user_id: friendId,
        });

      if (error) throw error;

      toast({
        title: "Member added",
        description: `${friendName} has been added to the group.`,
      });

      loadGroupData();
      setShowAddMembers(false);
    } catch (error) {
      console.error('Error adding member:', error);
      toast({
        title: "Failed to add member",
        description: "Could not add member to group. Please try again.",
        variant: "destructive",
      });
    }
  };

  const removeMemberFromGroup = async (memberId: string, memberName: string) => {
    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      toast({
        title: "Member removed",
        description: `${memberName} has been removed from the group.`,
      });

      loadGroupData();
    } catch (error) {
      console.error('Error removing member:', error);
      toast({
        title: "Failed to remove member",
        description: "Could not remove member from group. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-20 bg-muted rounded"></div>
          <div className="h-40 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <Card>
          <CardContent className="pt-8">
            <div className="text-center py-8">
              <h3 className="text-lg font-medium mb-2">Group not found</h3>
              <p className="text-muted-foreground mb-4">
                This group doesn't exist or you don't have access to it.
              </p>
              <Button asChild>
                <Link to="/groups">Back to Groups</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCreator = group.creator_id === currentUserId;

  return (
    <>
      <Helmet>
        <title>{group.name} - Groups - Antelog</title>
        <meta name="description" content={`Manage the ${group.name} group on Antelog`} />
      </Helmet>

      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-6">
          <Button variant="outline" asChild className="mb-4">
            <Link to="/groups">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Groups
            </Link>
          </Button>
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{group.name}</h1>
              {group.description && (
                <p className="text-muted-foreground mb-2">{group.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>{members.length} members</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>Created {new Date(group.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            
            {isCreator && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowAddMembers(!showAddMembers)}
                  className="flex items-center gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  Add Members
                </Button>
              </div>
            )}
          </div>
        </div>

        {showAddMembers && isCreator && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Add Friends to Group</CardTitle>
              <CardDescription>
                Select friends to add to this group
              </CardDescription>
            </CardHeader>
            <CardContent>
              {availableFriends.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  All your friends are already in this group
                </p>
              ) : (
                <div className="space-y-2">
                  {availableFriends.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <h4 className="font-medium">
                          {friend.contact_name || friend.friend_profile?.full_name || 'Unknown User'}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          @{friend.friend_profile?.handle || 'unknown'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => addMemberToGroup(
                          friend.friend_profile?.id || '',
                          friend.contact_name || friend.friend_profile?.full_name || 'Unknown User'
                        )}
                      >
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Group Members ({members.length})
            </CardTitle>
            <CardDescription>
              People in this group
            </CardDescription>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No members yet</h3>
                <p className="text-muted-foreground">
                  Add friends to get started
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <h4 className="font-medium">
                        {member.contact_name || member.profile?.full_name || 'Unknown User'}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        @{member.profile?.handle || 'unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Added {new Date(member.added_at).toLocaleDateString()}
                      </p>
                    </div>
                    
                    {isCreator && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            <UserMinus className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Member</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove {member.contact_name || member.profile?.full_name} from this group?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removeMemberFromGroup(
                                member.id,
                                member.contact_name || member.profile?.full_name || 'Unknown User'
                              )}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Group Requests
            </CardTitle>
            <CardDescription>
              List requests sent to this group (Coming Soon)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">List Requests Coming Soon</h3>
              <p className="text-muted-foreground">
                You'll be able to send and receive list requests to this group soon
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default GroupDetail;