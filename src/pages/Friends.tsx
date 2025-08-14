import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserPlus, Upload, Check, X, Trash2 } from "lucide-react";

interface FriendRequest {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
  requester_profile?: {
    handle: string;
    full_name: string;
  };
  addressee_profile?: {
    handle: string;
    full_name: string;
  };
}

interface Friendship {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  friend_profile?: {
    handle: string;
    full_name: string;
  };
}

const Friends = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUserId) {
      loadFriendRequests();
      loadFriendships();
    }
  }, [currentUserId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const loadFriendRequests = async () => {
    if (!currentUserId) return;

    try {
      // Load received requests with profiles
      const { data: receivedData, error: receivedError } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('addressee_id', currentUserId)
        .eq('status', 'pending');

      if (receivedError) throw receivedError;

      // Load sent requests
      const { data: sentData, error: sentError } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('requester_id', currentUserId)
        .eq('status', 'pending');

      if (sentError) throw sentError;

      // Get profiles for received requests
      if (receivedData && receivedData.length > 0) {
        const requesterIds = receivedData.map(r => r.requester_id);
        const { data: requesterProfiles } = await supabase
          .from('profiles')
          .select('id, handle, full_name')
          .in('id', requesterIds);

        const receivedWithProfiles = receivedData.map(request => ({
          ...request,
          requester_profile: requesterProfiles?.find(p => p.id === request.requester_id)
        }));
        setFriendRequests(receivedWithProfiles);
      } else {
        setFriendRequests([]);
      }

      // Get profiles for sent requests
      if (sentData && sentData.length > 0) {
        const addresseeIds = sentData.map(r => r.addressee_id);
        const { data: addresseeProfiles } = await supabase
          .from('profiles')
          .select('id, handle, full_name')
          .in('id', addresseeIds);

        const sentWithProfiles = sentData.map(request => ({
          ...request,
          addressee_profile: addresseeProfiles?.find(p => p.id === request.addressee_id)
        }));
        setSentRequests(sentWithProfiles);
      } else {
        setSentRequests([]);
      }
    } catch (error) {
      console.error('Error loading friend requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFriendships = async () => {
    if (!currentUserId) return;

    try {
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

      // Get friend profiles
      if (allFriendshipsData.length > 0) {
        const friendIds = allFriendshipsData.map(f => 
          f.user1_id === currentUserId ? f.user2_id : f.user1_id
        );
        
        const { data: friendProfiles } = await supabase
          .from('profiles')
          .select('id, handle, full_name')
          .in('id', friendIds);

        const friendshipsWithProfiles = allFriendshipsData.map(friendship => ({
          ...friendship,
          friend_profile: friendProfiles?.find(p => 
            p.id === (friendship.user1_id === currentUserId ? friendship.user2_id : friendship.user1_id)
          )
        }));

        setFriendships(friendshipsWithProfiles);
      } else {
        setFriendships([]);
      }
    } catch (error) {
      console.error('Error loading friendships:', error);
    }
  };

  const handleFriendRequest = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: action === 'accept' ? 'accepted' : 'rejected' })
        .eq('id', requestId);

      if (error) throw error;

      if (action === 'accept') {
        // Create friendship
        const request = friendRequests.find(r => r.id === requestId);
        if (request && currentUserId) {
          const { error: friendshipError } = await supabase
            .from('friendships')
            .insert({
              user1_id: request.requester_id,
              user2_id: currentUserId,
            });

          if (friendshipError) throw friendshipError;
        }
      }

      toast({
        title: action === 'accept' ? "Friend request accepted" : "Friend request rejected",
        description: `You ${action === 'accept' ? 'accepted' : 'rejected'} the friend request.`,
      });

      loadFriendRequests();
      loadFriendships();
    } catch (error) {
      toast({
        title: "Action failed",
        description: "Failed to process friend request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const removeFriend = async (friendshipId: string) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId);

      if (error) throw error;

      toast({
        title: "Friend removed",
        description: "Friend has been removed from your list.",
      });

      loadFriendships();
    } catch (error) {
      toast({
        title: "Remove failed",
        description: "Failed to remove friend. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Helmet>
        <title>Friends - Antelog</title>
        <meta name="description" content="Manage your friends and friend requests on Antelog" />
      </Helmet>

      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Friends</h1>
            <p className="text-muted-foreground">
              Manage your friend connections and requests
            </p>
          </div>
          
          <Button asChild className="flex items-center gap-2">
            <Link to="/contacts/import">
              <Upload className="h-4 w-4" />
              Import Contacts
            </Link>
          </Button>
        </div>

        <Tabs defaultValue="friends" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="friends" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Friends ({friendships.length})
            </TabsTrigger>
            <TabsTrigger value="received" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Received ({friendRequests.length})
            </TabsTrigger>
            <TabsTrigger value="sent" className="flex items-center gap-2">
              Sent ({sentRequests.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="friends">
            <Card>
              <CardHeader>
                <CardTitle>Your Friends</CardTitle>
                <CardDescription>
                  People you're connected with on Antelog
                </CardDescription>
              </CardHeader>
              <CardContent>
                {friendships.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No friends yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Import your contacts to find friends on Antelog
                    </p>
                    <Button asChild>
                      <Link to="/contacts/import">Import Contacts</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {friendships.map((friendship) => (
                      <div
                        key={friendship.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <h3 className="font-medium">
                            {friendship.friend_profile?.full_name || 'Unknown User'}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            @{friendship.friend_profile?.handle || 'unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Friends since {new Date(friendship.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeFriend(friendship.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="received">
            <Card>
              <CardHeader>
                <CardTitle>Friend Requests</CardTitle>
                <CardDescription>
                  People who want to connect with you
                </CardDescription>
              </CardHeader>
              <CardContent>
                {friendRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <UserPlus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No pending requests</h3>
                    <p className="text-muted-foreground">
                      You don't have any pending friend requests
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {friendRequests.map((request) => (
                      <div
                        key={request.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <h3 className="font-medium">
                            {request.requester_profile?.full_name || 'Unknown User'}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            @{request.requester_profile?.handle || 'unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Sent {new Date(request.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleFriendRequest(request.id, 'accept')}
                            className="flex items-center gap-1"
                          >
                            <Check className="h-3 w-3" />
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFriendRequest(request.id, 'reject')}
                            className="flex items-center gap-1"
                          >
                            <X className="h-3 w-3" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sent">
            <Card>
              <CardHeader>
                <CardTitle>Sent Requests</CardTitle>
                <CardDescription>
                  Friend requests you've sent that are pending
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sentRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <h3 className="text-lg font-medium mb-2">No pending requests</h3>
                    <p className="text-muted-foreground">
                      You haven't sent any friend requests yet
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sentRequests.map((request) => (
                      <div
                        key={request.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <h3 className="font-medium">
                            {request.addressee_profile?.full_name || 'Unknown User'}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            @{request.addressee_profile?.handle || 'unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Sent {new Date(request.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        
                        <Badge variant="secondary">Pending</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default Friends;