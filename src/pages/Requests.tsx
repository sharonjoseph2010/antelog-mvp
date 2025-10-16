import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Plus, Clock, CheckCircle, XCircle, MapPin, Users, User, UserCheck, Share2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { NetworkPath } from "@/components/NetworkPath";
import { ForwardRequestDialog } from "@/components/ForwardRequestDialog";

interface Request {
  id: string;
  title: string;
  category: string;
  location: string | null;
  audience_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  creator_id: string;
  creator_profile?: {
    full_name: string;
    handle: string;
  };
  response_count?: number;
  forwarding_chain?: Array<{
    user_id: string;
    user_name: string;
    user_handle: string;
  }>;
  degree_of_separation?: number | null;
  connection_path?: string[];
}

interface Group {
  id: string;
  name: string;
}

export default function Requests() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("sent");
  const [isLoading, setIsLoading] = useState(true);
  const [sentRequests, setSentRequests] = useState<Request[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<Request[]>([]);
  const [sentCount, setSentCount] = useState(0);
  const [receivedCount, setReceivedCount] = useState(0);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [userGroups, setUserGroups] = useState<Group[]>([]);

  useEffect(() => {
    loadRequests();
    loadUserGroups();
  }, []);

  const loadUserGroups = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("groups")
        .select("id, name")
        .eq("creator_id", user.id);

      if (error) throw error;
      setUserGroups(data || []);
    } catch (error) {
      console.error("Error loading groups:", error);
    }
  };

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load sent requests (requests created by current user)
      const { data: sentData, error: sentError } = await supabase
        .from("requests")
        .select(`
          *,
          request_responses(count)
        `)
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false });

      if (sentError) throw sentError;

      const formattedSentRequests = sentData?.map(request => ({
        ...request,
        response_count: request.request_responses?.length || 0,
        forwarding_chain: Array.isArray(request.forwarding_chain) 
          ? request.forwarding_chain as Array<{ user_id: string; user_name: string; user_handle: string; }>
          : []
      })) || [];

      setSentRequests(formattedSentRequests);
      setSentCount(formattedSentRequests.length);

      // Load received requests (requests sent to current user)
      const { data: receivedData, error: receivedError } = await supabase
        .from("requests")
        .select(`
          *,
          request_responses(count)
        `)
        .neq("creator_id", user.id)
        .order("created_at", { ascending: false });

      if (receivedError) throw receivedError;

      // Process received requests with network info
      const processedReceivedRequests = await Promise.all(
        (receivedData || []).map(async (request) => {
          let degreeOfSeparation = null;
          let connectionPath: string[] = [];
          let creatorProfile = null;

          // For public requests, get anonymous handle
          if (request.audience_type === "public") {
            const { data: anonHandle } = await supabase
              .from("anonymous_handles")
              .select("anonymous_handle")
              .eq("user_id", request.creator_id)
              .single();
            
            if (anonHandle) {
              creatorProfile = {
                full_name: anonHandle.anonymous_handle,
                handle: anonHandle.anonymous_handle.replace('@', '')
              };
            }
          } else {
            // For network requests, get real profile
            const { data: profileData } = await supabase
              .from("profiles")
              .select("full_name, handle")
              .eq("id", request.creator_id)
              .single();
            creatorProfile = profileData;

            // Get degree of separation
            const { data: degreeData } = await supabase.rpc(
              "get_degree_of_separation",
              { user_a: user.id, user_b: request.creator_id }
            );
            degreeOfSeparation = degreeData;

            // Get connection path
            const { data: pathData } = await supabase.rpc(
              "get_connection_path",
              { user_a: user.id, user_b: request.creator_id }
            );
            connectionPath = pathData || [];
          }

          return {
            ...request,
            creator_profile: creatorProfile,
            response_count: request.request_responses?.length || 0,
            degree_of_separation: degreeOfSeparation,
            connection_path: connectionPath,
            forwarding_chain: Array.isArray(request.forwarding_chain) 
              ? request.forwarding_chain as Array<{ user_id: string; user_name: string; user_handle: string; }>
              : []
          };
        })
      );

      setReceivedRequests(processedReceivedRequests);
      setReceivedCount(processedReceivedRequests.length);

    } catch (error) {
      console.error("Error loading requests:", error);
      toast({
        title: "Error",
        description: "Failed to load requests",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open":
        return <Clock className="h-4 w-4 text-orange-500" />;
      case "responded":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "closed":
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-orange-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-orange-100 text-orange-800";
      case "responded":
        return "bg-green-100 text-green-800";
      case "closed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-orange-100 text-orange-800";
    }
  };

  const getAudienceIcon = (audienceType: string) => {
    switch (audienceType) {
      case "friends":
        return <User className="h-4 w-4" />;
      case "extended_network":
        return <Users className="h-4 w-4" />;
      case "specific_group":
        return <UserCheck className="h-4 w-4" />;
      default:
        return <Users className="h-4 w-4" />;
    }
  };

  const formatCategory = (category: string) => {
    return category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
  };

  const formatAudienceType = (audienceType: string) => {
    switch (audienceType) {
      case "friends":
        return "Friends";
      case "extended_network":
        return "Extended Network";
      case "specific_group":
        return "Group";
      default:
        return audienceType;
    }
  };

  const handleForward = (request: Request) => {
    setSelectedRequest(request);
    setForwardDialogOpen(true);
  };

  const RequestCard = ({ request, showCreator = false }: { request: Request; showCreator?: boolean }) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg leading-6 mb-2 line-clamp-2">
              {request.title}
            </CardTitle>
            {showCreator && request.creator_profile && (
              <div className="space-y-2 mb-2">
                {request.audience_type === "public" ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Anonymous</Badge>
                    <span>{request.creator_profile.full_name}</span>
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Requested by {request.creator_profile.full_name} (@{request.creator_profile.handle})
                    </p>
                    <NetworkPath
                      forwardingChain={request.forwarding_chain}
                      degreeOfSeparation={request.degree_of_separation}
                      connectionPath={request.connection_path}
                    />
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {getStatusIcon(request.status)}
            <Badge className={getStatusColor(request.status)} variant="secondary">
              {request.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Category and Location */}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{formatCategory(request.category)}</Badge>
            {request.location && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span>{request.location}</span>
              </div>
            )}
          </div>

          {/* Audience and Response Count */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              {getAudienceIcon(request.audience_type)}
              <span>Sent to {formatAudienceType(request.audience_type)}</span>
            </div>
            
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                {request.response_count || 0} responses
              </span>
              <span className="text-muted-foreground">
                {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              {showCreator && (
                <>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/requests/${request.id}/respond`} className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      Respond
                    </Link>
                  </Button>
                  {request.audience_type !== "public" && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleForward(request)}
                      className="flex items-center gap-1"
                    >
                      <Share2 className="h-3 w-3" />
                      Share
                    </Button>
                  )}
                </>
              )}
            </div>
            {!showCreator && request.response_count > 0 && (
              <Button asChild variant="ghost" size="sm">
                <Link to={`/requests/${request.id}/respond`} className="flex items-center gap-1">
                  View Responses
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <MessageSquare className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Requests</h1>
            <p className="text-muted-foreground">
              Manage your recommendation requests and responses
            </p>
          </div>
        </div>
        
        <Button asChild size="lg">
          <Link to="/requests/new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Request
          </Link>
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:grid-cols-2">
          <TabsTrigger 
            value="sent" 
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-foreground hover:text-foreground transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden xs:inline">My Requests</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {sentCount}
            </Badge>
          </TabsTrigger>
          
          <TabsTrigger 
            value="received" 
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-foreground hover:text-foreground transition-colors"
          >
            <Users className="h-4 w-4" />
            <span className="hidden xs:inline">Received</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {receivedCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* My Requests Tab */}
        <TabsContent value="sent" className="space-y-4">
          {sentRequests.length > 0 ? (
            <div className="space-y-4">
              {sentRequests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent>
                <div className="text-center py-12">
                  <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <MessageSquare className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">No Requests Yet</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Start asking your network for recommendations by creating your first request.
                  </p>
                  <Button asChild size="lg">
                    <Link to="/requests/new" className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Create Your First Request
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Received Requests Tab */}
        <TabsContent value="received" className="space-y-4">
          {receivedRequests.length > 0 ? (
            <div className="space-y-4">
              {receivedRequests.map((request) => (
                <RequestCard key={request.id} request={request} showCreator={true} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent>
                <div className="text-center py-12">
                  <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">No Requests Received</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    When your network asks for recommendations, their requests will appear here.
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Help grow the community by inviting more friends!
                    </p>
                    <Button asChild variant="outline">
                      <Link to="/friends" className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Manage Friends
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Forward Request Dialog */}
      {selectedRequest && (
        <ForwardRequestDialog
          open={forwardDialogOpen}
          onOpenChange={setForwardDialogOpen}
          requestId={selectedRequest.id}
          requestTitle={selectedRequest.title}
          userGroups={userGroups}
          onForwardComplete={loadRequests}
        />
      )}
    </div>
  );
}