import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserPlus, Search, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface ExtendedConnection {
  profile_id: string;
  full_name: string;
  handle: string;
  mutual_friends: string[];
  hasPendingRequest?: boolean;
}

const ExtendedNetwork = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [connections, setConnections] = useState<ExtendedConnection[]>([]);
  const [filteredConnections, setFilteredConnections] = useState<ExtendedConnection[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUserId) {
      loadExtendedNetwork();
    }
  }, [currentUserId]);

  useEffect(() => {
    filterConnections();
  }, [connections, searchTerm]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const loadExtendedNetwork = async () => {
    if (!currentUserId) return;

    try {
      setIsLoading(true);
      
      // Call the database function to get extended network
      const { data: networkData, error } = await supabase.rpc('get_extended_network', {
        user_id: currentUserId
      });

      if (error) throw error;

      // Check for existing friend requests to these users
      if (networkData && networkData.length > 0) {
        const profileIds = networkData.map((conn: any) => conn.profile_id);
        
        const { data: requestData } = await supabase
          .from('friend_requests')
          .select('addressee_id')
          .eq('requester_id', currentUserId)
          .in('addressee_id', profileIds)
          .eq('status', 'pending');

        const pendingRequestIds = new Set(requestData?.map(r => r.addressee_id) || []);

        const connectionsWithRequests = networkData.map((conn: any) => ({
          ...conn,
          hasPendingRequest: pendingRequestIds.has(conn.profile_id)
        }));

        setConnections(connectionsWithRequests);
      } else {
        setConnections([]);
      }
    } catch (error) {
      console.error('Error loading extended network:', error);
      toast({
        title: "Failed to load network",
        description: "Could not load your extended network. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filterConnections = () => {
    if (!searchTerm.trim()) {
      setFilteredConnections(connections);
      return;
    }

    const filtered = connections.filter(conn => 
      conn.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conn.handle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conn.mutual_friends.some(friend => 
        friend.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
    
    setFilteredConnections(filtered);
  };

  const sendFriendRequest = async (targetUserId: string, targetName: string) => {
    if (!currentUserId) return;

    try {
      // Check if request already exists
      const { data: existingRequest } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('requester_id', currentUserId)
        .eq('addressee_id', targetUserId)
        .eq('status', 'pending')
        .single();

      if (existingRequest) {
        toast({
          title: "Request already sent",
          description: "You've already sent a friend request to this person.",
          variant: "destructive",
        });
        return;
      }

      // Send friend request
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          requester_id: currentUserId,
          addressee_id: targetUserId,
          status: 'pending'
        });

      if (error) throw error;

      // Create notification
      await supabase
        .from('notifications')
        .insert({
          user_id: targetUserId,
          type: 'friend_request',
          title: 'New friend request',
          message: 'Someone wants to connect with you',
          related_user_id: currentUserId
        });

      toast({
        title: "Friend request sent",
        description: `Friend request sent to ${targetName}`,
      });

      // Update the connection to show pending status
      setConnections(prev => prev.map(conn => 
        conn.profile_id === targetUserId 
          ? { ...conn, hasPendingRequest: true }
          : conn
      ));
    } catch (error) {
      console.error('Error sending friend request:', error);
      toast({
        title: "Request failed",
        description: "Failed to send friend request. Please try again.",
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
          <div className="h-20 bg-muted rounded"></div>
          <div className="h-20 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Extended Network - Antelog</title>
        <meta name="description" content="Discover friends-of-friends in your extended network on Antelog" />
      </Helmet>

      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="outline" asChild>
              <Link to="/friends">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Friends
              </Link>
            </Button>
          </div>
          
          <div className="mb-4">
            <h1 className="text-3xl font-bold mb-2">Extended Network</h1>
            <p className="text-muted-foreground">
              Discover friends-of-friends and expand your network
            </p>
          </div>

          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search by name, handle, or mutual friends..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Extended Network ({filteredConnections.length})
            </CardTitle>
            <CardDescription>
              People you might know through mutual friends
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredConnections.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  {connections.length === 0 ? "No extended network found" : "No matches found"}
                </h3>
                <p className="text-muted-foreground">
                  {connections.length === 0 
                    ? "Add more friends to discover your extended network"
                    : "Try a different search term"
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredConnections.map((connection) => (
                  <div
                    key={connection.profile_id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <h3 className="font-medium text-lg">
                        <Link
                          to={`/profile/${connection.profile_id}`}
                          className="hover:underline"
                        >
                          {connection.full_name}
                        </Link>
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        @{connection.handle}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Friends with:</span>
                        {connection.mutual_friends.slice(0, 3).map((friend, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {friend}
                          </Badge>
                        ))}
                        {connection.mutual_friends.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{connection.mutual_friends.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="ml-4">
                      {connection.hasPendingRequest ? (
                        <Badge variant="secondary">Request Sent</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => sendFriendRequest(connection.profile_id, connection.full_name)}
                          className="flex items-center gap-2"
                        >
                          <UserPlus className="h-3 w-3" />
                          Connect
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default ExtendedNetwork;