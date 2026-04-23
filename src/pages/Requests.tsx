import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Plus, Clock, CheckCircle, XCircle, MapPin, Users, User, UserCheck, Share2, Edit, Trash2, MoreVertical } from "lucide-react";
import { ExpiryBadge, isRequestExpired } from "@/components/ExpiryBadge";
import { formatDistanceToNow } from "date-fns";
import { NetworkPath } from "@/components/NetworkPath";
import { ForwardRequestDialog } from "@/components/ForwardRequestDialog";
import { DeleteRequestDialog } from "@/components/DeleteRequestDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
// Note: Request pages always show real names. Network-aware anonymization
// is only applied in the Master Directory context.

interface Request {
  id: string;
  title: string;
  category: string;
  location: string | null;
  audience_type: string;
  audience_types?: string[]; // Multiple audiences support
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
  group_id?: string;
  group_name?: string;
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<Request | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
          request_responses(count),
          groups(name)
        `)
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false });

      if (sentError) throw sentError;

      // Get guest contribution counts for sent requests
      const sentRequestIds = (sentData || []).map(r => r.id);
      let sentGuestCounts: Record<string, number> = {};
      if (sentRequestIds.length > 0) {
        const { data: guestCounts } = await supabase
          .from("guest_contributions")
          .select("request_id")
          .in("request_id", sentRequestIds);
        
        (guestCounts || []).forEach(gc => {
          sentGuestCounts[gc.request_id!] = (sentGuestCounts[gc.request_id!] || 0) + 1;
        });
      }

      const formattedSentRequests = sentData?.map(request => ({
        ...request,
        response_count: (request.request_responses?.length || 0) + (sentGuestCounts[request.id] || 0),
        group_name: request.groups?.name,
        forwarding_chain: Array.isArray(request.forwarding_chain) 
          ? request.forwarding_chain as Array<{ user_id: string; user_name: string; user_handle: string; }>
          : []
      })) || [];

      setSentRequests(formattedSentRequests);
      setSentCount(formattedSentRequests.length);

      // Load received requests — only those actually sent to this user.
      // Eligibility:
      //  1. Creator is in viewer's 1st network (friendship), OR
      //  2. Request was forwarded to viewer (request_forwards.forwarded_to contains user.id), OR
      //  3. Request audience_types contains 'public'
      // Always exclude: expired (expires_at < now) and status = 'closed'.

      // 1. Friend creator IDs
      const { data: friendships } = await supabase
        .from("friendships")
        .select("user1_id, user2_id")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);
      const friendIds = (friendships || [])
        .map(f => (f.user1_id === user.id ? f.user2_id : f.user1_id))
        .filter(Boolean);

      // 2. Request IDs forwarded to this user
      const { data: forwardsToMe } = await supabase
        .from("request_forwards")
        .select("request_id")
        .contains("forwarded_to", [user.id]);
      const forwardedRequestIds = Array.from(
        new Set((forwardsToMe || []).map(f => f.request_id))
      );

      // Build OR filter for the requests query
      const orClauses: string[] = [];
      if (friendIds.length > 0) {
        orClauses.push(`creator_id.in.(${friendIds.join(",")})`);
      }
      if (forwardedRequestIds.length > 0) {
        orClauses.push(`id.in.(${forwardedRequestIds.join(",")})`);
      }
      orClauses.push(`audience_types.cs.{public}`);

      let receivedData: any[] = [];
      let receivedError: any = null;
      // If user has no friends and no forwards, only public requests apply.
      const nowIso = new Date().toISOString();
      const baseQuery = supabase
        .from("requests")
        .select(`
          *,
          request_responses(count),
          groups(name)
        `)
        .neq("creator_id", user.id)
        .neq("status", "closed")
        .gte("expires_at", nowIso)
        .order("created_at", { ascending: false });

      const { data, error } = await baseQuery.or(orClauses.join(","));
      receivedData = data || [];
      receivedError = error;

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
            // For network requests, get real profile with network-aware name
            const { data: profileData } = await supabase
              .from("profiles")
              .select("full_name, handle")
              .eq("id", request.creator_id)
              .single();
            
            // Resolve display name based on network relationship
            const inNetwork = await isInNetwork(user.id, request.creator_id);
            creatorProfile = profileData ? {
              full_name: getDisplayNameSync(profileData, inNetwork),
              handle: profileData.handle
            } : null;

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

          // Get guest contribution count for this request
          const { data: guestCount } = await supabase
            .from("guest_contributions")
            .select("id", { count: 'exact', head: true })
            .eq("request_id", request.id);

          return {
            ...request,
            creator_profile: creatorProfile,
            response_count: (request.request_responses?.length || 0) + (guestCount?.length || 0),
            group_name: request.groups?.name,
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

  const getEffectiveStatus = (request: Request) => {
    const expiresAt = (request as any).expires_at;
    if (request.status === "open" && expiresAt && isRequestExpired(expiresAt, request.status)) {
      return "expired";
    }
    return request.status;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open":
        return <Clock className="h-4 w-4 text-orange-500" />;
      case "expired":
        return <XCircle className="h-4 w-4 text-destructive" />;
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
      case "expired":
        return "bg-destructive/10 text-destructive";
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
      case "first_network":
        return "1st Network";
      case "friends":
        return "Friends";
      case "extended_network":
        return "Extended Network";
      case "specific_group":
      case "group":
        return "Group";
      case "specific_people":
        return "Specific People";
      case "public":
        return "Public";
      default:
        return audienceType;
    }
  };

  const getAudienceBadgeColor = (audienceType: string) => {
    switch (audienceType) {
      case "first_network":
      case "friends":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "group":
      case "specific_group":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "specific_people":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "public":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  const handleForward = (request: Request) => {
    setSelectedRequest(request);
    setForwardDialogOpen(true);
  };

  const handleDeleteRequest = async () => {
    if (!requestToDelete) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("requests")
        .delete()
        .eq("id", requestToDelete.id);

      if (error) throw error;

      toast({
        title: "Request Deleted",
        description: "Your request has been permanently deleted"
      });

      // Refresh requests
      await loadRequests();
    } catch (error) {
      console.error("Error deleting request:", error);
      toast({
        title: "Error",
        description: "Failed to delete request",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setRequestToDelete(null);
    }
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
                      Requested by {request.creator_profile.full_name}
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
            {getStatusIcon(getEffectiveStatus(request))}
            <Badge className={getStatusColor(getEffectiveStatus(request))} variant="secondary">
              {getEffectiveStatus(request)}
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

          {/* Audience Badges and Response Count */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(request.audience_types || [request.audience_type]).map((audienceType, index) => {
                // Show group name if this is a group audience
                const label = audienceType === 'group' && request.group_name
                  ? `Group: ${request.group_name}`
                  : formatAudienceType(audienceType);
                
                return (
                  <Badge 
                    key={index} 
                    variant="secondary" 
                    className={`text-xs ${getAudienceBadgeColor(audienceType)}`}
                  >
                    {getAudienceIcon(audienceType)}
                    <span className="ml-1">{label}</span>
                  </Badge>
                );
              })}
            </div>
            
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                {request.response_count || 0} responses
              </span>
              <span className="text-muted-foreground">
                {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
              </span>
              {(request as any).expires_at && (
                <ExpiryBadge expiresAt={(request as any).expires_at} status={request.status} />
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              {showCreator ? (
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
              ) : (
                <>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/requests/${request.id}/respond`} className="flex items-center gap-1">
                      View
                    </Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/requests/${request.id}/edit`} className="flex items-center gap-2">
                          <Edit className="h-4 w-4" />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          setRequestToDelete(request);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
            {!showCreator && request.response_count > 0 && (
              <span className="text-sm text-muted-foreground">
                {request.response_count} {request.response_count === 1 ? 'response' : 'responses'}
              </span>
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

      {/* Delete Confirmation Dialog */}
      <DeleteRequestDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteRequest}
        isDeleting={isDeleting}
      />
    </div>
  );
}