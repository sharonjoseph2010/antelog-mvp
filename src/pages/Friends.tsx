import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Users, Upload, Trash2, Network } from "lucide-react";

interface Friendship {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  friend_profile?: {
    handle: string;
    full_name: string;
  };
  contact_name?: string;
}

const Friends = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [extendedNetworkCount, setExtendedNetworkCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUserId) {
      loadFriendships();
      loadExtendedNetworkCount();
    }
  }, [currentUserId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
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

        const friendshipsWithProfiles = allFriendshipsData.map(friendship => {
          const friendId = friendship.user1_id === currentUserId ? friendship.user2_id : friendship.user1_id;
          const friendProfile = friendProfiles?.find(p => p.id === friendId);
          const contactName = contactData?.find(c => c.matched_user_id === friendId)?.contact_name;
          
          return {
            ...friendship,
            friend_profile: friendProfile,
            contact_name: contactName
          };
        });

        setFriendships(friendshipsWithProfiles);
      } else {
        setFriendships([]);
      }
    } catch (error) {
      console.error('Error loading friendships:', error);
    }
  };

  const loadExtendedNetworkCount = async () => {
    if (!currentUserId) return;

    try {
      const { data: networkData, error } = await supabase.rpc('get_extended_network', {
        user_id: currentUserId
      });

      if (error) {
        console.error('Error loading extended network count:', error);
        setExtendedNetworkCount(0);
        return;
      }

      setExtendedNetworkCount(networkData?.length || 0);
    } catch (error) {
      console.error('Error loading extended network count:', error);
      setExtendedNetworkCount(0);
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
        <title>Network - Antelog</title>
        <meta name="description" content="Manage your network connections on Antelog" />
      </Helmet>

      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Network</h1>
              <p className="text-muted-foreground">
                Manage your network connections
              </p>
            </div>
            
            <Button asChild className="flex items-center gap-2 self-start sm:self-auto">
              <Link to="/contacts/import">
                <Upload className="h-4 w-4" />
                Import Contacts
              </Link>
            </Button>
          </div>

          <Tabs defaultValue="friends" className="space-y-6">
            <div className="border-b border-border">
              <TabsList className="h-auto p-0 bg-transparent grid w-full grid-cols-2 gap-0">
                <TabsTrigger 
                  value="friends" 
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-foreground hover:text-foreground transition-colors"
                >
                  <Users className="h-4 w-4" />
                  <span className="hidden xs:inline">1st Network</span>
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {friendships.length}
                  </Badge>
                </TabsTrigger>
                
                <TabsTrigger 
                  value="extended" 
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-foreground hover:text-foreground transition-colors"
                >
                  <Network className="h-4 w-4" />
                  <span className="hidden xs:inline">Extended</span>
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {extendedNetworkCount}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </div>

          <TabsContent value="friends">
            <Card>
              <CardHeader>
                <CardTitle>Your 1st Network</CardTitle>
                <CardDescription>
                  People you trust for recommendations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {friendships.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No one in your 1st network yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Build your 1st network by importing contacts
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
                            {friendship.contact_name || friendship.friend_profile?.full_name || 'Unknown User'}
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

            <TabsContent value="extended">
              <Card>
                <CardHeader>
                  <CardTitle>Extended Network</CardTitle>
                  <CardDescription>
                    Discover friends-of-friends and expand your connections
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                      <Network className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Explore Your Extended Network</h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      Your extended network will appear here as your 1st network grows
                    </p>
                    <Button asChild size="lg">
                      <Link to="/network/extended" className="flex items-center gap-2">
                        <Network className="h-4 w-4" />
                        View Extended Network
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
        </Tabs>
        </div>
      </div>
    </>
  );
};

export default Friends;