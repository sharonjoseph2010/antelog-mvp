import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Users, UserCheck } from "lucide-react";

interface Friend {
  id: string;
  user1_id: string;
  user2_id: string;
  friend_profile?: {
    id: string;
    handle: string;
    full_name: string;
  };
  contact_name?: string;
}

const GroupsNew = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());

  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUserId) {
      loadFriends();
    }
  }, [currentUserId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const loadFriends = async () => {
    if (!currentUserId) return;

    try {
      setIsLoading(true);

      // Load friendships where current user is user1
      const { data: friendships1, error: error1 } = await supabase
        .from('friendships')
        .select('*')
        .eq('user1_id', currentUserId);

      // Load friendships where current user is user2
      const { data: friendships2, error: error2 } = await supabase
        .from('friendships')
        .select('*')
        .eq('user2_id', currentUserId);

      if (error1) throw error1;
      if (error2) throw error2;

      const allFriendshipsData = [
        ...(friendships1 || []),
        ...(friendships2 || [])
      ];

      // Get friend profiles and contact names
      if (allFriendshipsData.length > 0) {
        const friendIds = allFriendshipsData.map(f => 
          f.user1_id === currentUserId ? f.user2_id : f.user1_id
        );
        
        const { data: friendProfiles } = await supabase
          .from('profiles')
          .select('id, handle, full_name')
          .in('id', friendIds);

        // Get contact names for these friends
        const { data: contactData } = await supabase
          .from('contact_imports')
          .select('matched_user_id, contact_name')
          .eq('user_id', currentUserId)
          .in('matched_user_id', friendIds)
          .eq('is_matched', true);

        const friendsWithProfiles = allFriendshipsData.map(friendship => {
          const friendId = friendship.user1_id === currentUserId ? friendship.user2_id : friendship.user1_id;
          const friendProfile = friendProfiles?.find(p => p.id === friendId);
          const contactName = contactData?.find(c => c.matched_user_id === friendId)?.contact_name;
          
          return {
            ...friendship,
            friend_profile: {
              ...friendProfile,
              id: friendId
            },
            contact_name: contactName
          };
        });

        setFriends(friendsWithProfiles);
      } else {
        setFriends([]);
      }
    } catch (error) {
      console.error('Error loading friends:', error);
      toast({
        title: "Failed to load friends",
        description: "Could not load your friends list.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFriendToggle = (friendId: string) => {
    const newSelection = new Set(selectedFriends);
    if (newSelection.has(friendId)) {
      newSelection.delete(friendId);
    } else {
      newSelection.add(friendId);
    }
    setSelectedFriends(newSelection);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUserId || !formData.name.trim()) {
      toast({
        title: "Invalid input",
        description: "Please provide a group name.",
        variant: "destructive",
      });
      return;
    }

    if (selectedFriends.size === 0) {
      toast({
        title: "No members selected",
        description: "Please select at least one friend to add to the group.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      // Create the group
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .insert({
          creator_id: currentUserId,
          name: formData.name.trim(),
          description: formData.description.trim() || null,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add selected friends as group members
      const memberInserts = Array.from(selectedFriends).map(friendId => ({
        group_id: groupData.id,
        user_id: friendId,
      }));

      const { error: membersError } = await supabase
        .from('group_members')
        .insert(memberInserts);

      if (membersError) throw membersError;

      toast({
        title: "Group created",
        description: `"${formData.name}" has been created with ${selectedFriends.size} members.`,
      });

      navigate('/groups');
    } catch (error) {
      console.error('Error creating group:', error);
      toast({
        title: "Creation failed",
        description: "Failed to create group. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Create Group - Antelog</title>
        <meta name="description" content="Create a new friend group on Antelog" />
      </Helmet>

      <div className="container mx-auto py-8 px-4 max-w-2xl">
        <div className="mb-6">
          <Button variant="outline" asChild className="mb-4">
            <Link to="/groups">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Groups
            </Link>
          </Button>
          
          <h1 className="text-3xl font-bold mb-2">Create New Group</h1>
          <p className="text-muted-foreground">
            Organize your friends into a meaningful group
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Group Details</CardTitle>
              <CardDescription>
                Basic information about your group
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Group Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Mumbai Foodies, Film School Friends"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  maxLength={100}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="What's this group about?"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  maxLength={500}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Add Friends ({selectedFriends.size} selected)
              </CardTitle>
              <CardDescription>
                Select friends to add to this group
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse flex items-center space-x-3">
                      <div className="h-4 w-4 bg-muted rounded"></div>
                      <div className="h-4 bg-muted rounded flex-1"></div>
                    </div>
                  ))}
                </div>
              ) : friends.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No friends yet</h3>
                  <p className="text-muted-foreground mb-4">
                    You need friends to create a group
                  </p>
                  <Button asChild variant="outline">
                    <Link to="/friends">Go to Friends</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {friends.map((friend) => {
                    const friendId = friend.friend_profile?.id || '';
                    const isSelected = selectedFriends.has(friendId);
                    
                    return (
                      <div
                        key={friend.id}
                        className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          id={friend.id}
                          checked={isSelected}
                          onCheckedChange={() => handleFriendToggle(friendId)}
                        />
                        <div className="flex-1">
                          <label
                            htmlFor={friend.id}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {friend.contact_name || friend.friend_profile?.full_name || 'Unknown User'}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            @{friend.friend_profile?.handle || 'unknown'}
                          </p>
                        </div>
                        {isSelected && (
                          <UserCheck className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              asChild
            >
              <Link to="/groups">Cancel</Link>
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting || !formData.name.trim() || selectedFriends.size === 0}
            >
              {isSubmitting ? "Creating..." : "Create Group"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
};

export default GroupsNew;