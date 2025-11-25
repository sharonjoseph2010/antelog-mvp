import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, ThumbsUp, MessageSquare, User, Users, UserCheck, MapPin, Clock, Share2, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ForwardRequestModal } from "@/components/ForwardRequestModal";

interface NetworkPathNode {
  user_id: string;
  user_name: string;
  user_handle: string;
}

interface Request {
  id: string;
  title: string;
  category: string;
  location: string | null;
  audience_type: string;
  status: string;
  created_at: string;
  allow_forwarding: boolean;
  creator_id: string;
  creator_profile?: {
    full_name: string;
    handle: string;
  };
  network_path?: NetworkPathNode[];
  forwarded_by?: string;
}

interface RequestResponse {
  id: string;
  response_type: string;
  content: string;
  created_at: string;
  list_id?: string;
  responder_profile: {
    full_name: string;
    handle: string;
  };
  list?: {
    title: string;
    description: string;
  };
  vote_counts: {
    helpful: number;
    not_helpful: number;
  };
  user_vote?: {
    vote_type: string;
  };
}

interface UserList {
  id: string;
  title: string;
  description: string;
  category: string;
}

export default function RequestRespond() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [request, setRequest] = useState<Request | null>(null);
  const [responses, setResponses] = useState<RequestResponse[]>([]);
  const [userLists, setUserLists] = useState<UserList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [hasForwarded, setHasForwarded] = useState(false);
  
  // Response form state
  const [responseType, setResponseType] = useState<"new_recommendations" | "existing_list">("new_recommendations");
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [responseContent, setResponseContent] = useState("");

  useEffect(() => {
    if (id) {
      loadRequestData();
    }
  }, [id]);

  const loadRequestData = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load request details
      const { data: requestData, error: requestError } = await supabase
        .from("requests")
        .select("*")
        .eq("id", id)
        .single();

      if (requestError) throw requestError;

      // Get creator profile
      let creator_profile = null;
      if (requestData.creator_id) {
        const { data: creatorData } = await supabase
          .from("profiles")
          .select("full_name, handle")
          .eq("id", requestData.creator_id)
          .single();
        creator_profile = creatorData;
      }
      
      // Check if user has forwarding permissions
      const isOwnRequest = requestData.creator_id === user.id;
      const allowsForwarding = requestData.allow_forwarding === true;
      
      // Check if user already forwarded this request
      const { data: forwardData } = await supabase
        .from('request_forwards')
        .select('id')
        .eq('request_id', id)
        .eq('forwarded_by_user_id', user.id)
        .maybeSingle();
      
      setHasForwarded(!!forwardData);
      setCanForward(!isOwnRequest && allowsForwarding && !forwardData);

      // Get network path if request was forwarded to user
      const { data: forwardPath } = await supabase
        .from('request_forwards')
        .select('network_path')
        .eq('request_id', id)
        .contains('forwarded_to', [user.id])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let networkPath: NetworkPathNode[] = [];
      if (forwardPath?.network_path && Array.isArray(forwardPath.network_path)) {
        // Get profile info for each user in path
        const { data: pathProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, handle')
          .in('id', forwardPath.network_path);

        networkPath = forwardPath.network_path.map((userId: string) => {
          const profile = pathProfiles?.find(p => p.id === userId);
          return {
            user_id: userId,
            user_name: profile?.full_name || 'Unknown',
            user_handle: profile?.handle || 'unknown'
          };
        });
      }
      
      setRequest({
        ...requestData,
        creator_profile,
        network_path: networkPath
      });

      // Load existing responses
      const { data: responsesData, error: responsesError } = await supabase
        .from("request_responses")
        .select("*")
        .eq("request_id", id)
        .order("created_at", { ascending: false });

      if (responsesError) throw responsesError;

      // Process responses with profile data, vote counts and user votes
      const processedResponses = await Promise.all(
        (responsesData || []).map(async (response) => {
          // Get responder profile
          const { data: responderData } = await supabase
            .from("profiles")
            .select("full_name, handle")
            .eq("id", response.responder_id)
            .single();

          // Get list data if response has a list_id
          let listData = null;
          if (response.list_id) {
            const { data: list } = await supabase
              .from("lists")
              .select("title, description")
              .eq("id", response.list_id)
              .single();
            listData = list;
          }

          // Get votes for this response
          const { data: votesData } = await supabase
            .from("request_votes")
            .select("vote_type, voter_id")
            .eq("response_id", response.id);

          const votes = votesData || [];
          const helpfulVotes = votes.filter(v => v.vote_type === 'helpful').length;
          const notHelpfulVotes = votes.filter(v => v.vote_type === 'not_helpful').length;
          const userVote = votes.find(v => v.voter_id === user.id);

          return {
            ...response,
            responder_profile: responderData || { full_name: 'Unknown', handle: 'unknown' },
            list: listData,
            vote_counts: {
              helpful: helpfulVotes,
              not_helpful: notHelpfulVotes
            },
            user_vote: userVote
          };
        })
      );

      setResponses(processedResponses);

      // Load user's lists for selection
      const { data: listsData, error: listsError } = await supabase
        .from("lists")
        .select("id, title, description, category")
        .eq("owner_id", user.id)
        .eq("visibility", "public")
        .order("created_at", { ascending: false });

      if (listsError) throw listsError;
      setUserLists(listsData || []);

    } catch (error) {
      console.error("Error loading request data:", error);
      toast({
        title: "Error",
        description: "Failed to load request details",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitResponse = async () => {
    if (!request || !responseContent.trim()) {
      toast({
        title: "Error",
        description: "Please provide a response message",
        variant: "destructive"
      });
      return;
    }

    if (responseType === "existing_list" && !selectedListId) {
      toast({
        title: "Error", 
        description: "Please select a list to recommend",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("request_responses")
        .insert({
          request_id: request.id,
          responder_id: user.id,
          response_type: responseType,
          content: responseContent,
          list_id: responseType === "existing_list" ? selectedListId : null
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Your response has been submitted!",
      });

      // Refresh responses
      await loadRequestData();
      
      // Reset form
      setResponseContent("");
      setSelectedListId("");

    } catch (error) {
      console.error("Error submitting response:", error);
      toast({
        title: "Error",
        description: "Failed to submit response",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (responseId: string, voteType: "helpful" | "not_helpful") => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user already voted on this response
      const existingResponse = responses.find(r => r.id === responseId);
      const userVote = existingResponse?.user_vote;

      if (userVote) {
        if (userVote.vote_type === voteType) {
          // Remove vote if clicking same vote
          const { error } = await supabase
            .from("request_votes")
            .delete()
            .eq("response_id", responseId)
            .eq("voter_id", user.id);

          if (error) throw error;
        } else {
          // Update vote if clicking different vote
          const { error } = await supabase
            .from("request_votes")
            .update({ vote_type: voteType })
            .eq("response_id", responseId)
            .eq("voter_id", user.id);

          if (error) throw error;
        }
      } else {
        // Create new vote
        const { error } = await supabase
          .from("request_votes")
          .insert({
            response_id: responseId,
            voter_id: user.id,
            vote_type: voteType
          });

        if (error) throw error;
      }

      // Refresh responses to show updated vote counts
      await loadRequestData();

    } catch (error) {
      console.error("Error voting:", error);
      toast({
        title: "Error",
        description: "Failed to submit vote",
        variant: "destructive"
      });
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

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-32 mb-6" />
        <Card className="mb-6">
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-1/3" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Request not found</h1>
          <Button asChild>
            <Link to="/requests">Back to Requests</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link to="/requests" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Requests
          </Link>
        </Button>
        
        <h1 className="text-3xl font-bold mb-2">Respond to Request</h1>
        <p className="text-muted-foreground">
          Share your recommendations or vote on existing responses
        </p>
      </div>

      {/* Request Details */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <CardTitle className="text-xl mb-2">{request.title}</CardTitle>
              
              {/* Network Path Display */}
              {request.network_path && request.network_path.length > 0 ? (
                <div className="mb-3 p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Request Path:</p>
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium">{request.creator_profile?.full_name || 'Unknown'}</span>
                    {request.network_path.map((node, index) => (
                      <span key={index} className="flex items-center gap-2">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">via</span>
                        <span className="font-medium">{node.user_name}</span>
                      </span>
                    ))}
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="secondary">endorsed to you</Badge>
                  </div>
                </div>
              ) : request.creator_profile && (
                <p className="text-sm text-muted-foreground mb-3">
                  Requested by {request.creator_profile.full_name} (@{request.creator_profile.handle})
                </p>
              )}
            </div>
            <Badge variant="outline">{formatCategory(request.category)}</Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {request.location && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span>{request.location}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              {getAudienceIcon(request.audience_type)}
              <span>Sent to {formatAudienceType(request.audience_type)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 border-t">
            {canForward && (
              <Button
                onClick={() => setShowForwardModal(true)}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Share2 className="h-4 w-4" />
                Forward & Endorse
              </Button>
            )}
            {hasForwarded && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Share2 className="h-3 w-3" />
                You forwarded this
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Response Form */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Your Response
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Response Type Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Response Type</label>
            <Select value={responseType} onValueChange={(value: "new_recommendations" | "existing_list") => setResponseType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new_recommendations">New Recommendations</SelectItem>
                <SelectItem value="existing_list">Recommend Existing List</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* List Selection for existing list response */}
          {responseType === "existing_list" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select List to Recommend</label>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose from your public lists" />
                </SelectTrigger>
                <SelectContent>
                  {userLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.title} ({formatCategory(list.category)})
                    </SelectItem>
                  ))
                }
                </SelectContent>
              </Select>
              {userLists.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  You don't have any public lists yet.{" "}
                  <Link to="/lists/new" className="text-primary hover:underline">
                    Create one first
                  </Link>
                </p>
              )}
            </div>
          )}

          {/* Response Content */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {responseType === "existing_list" ? "Why do you recommend this list?" : "Your Recommendations"}
            </label>
            <Textarea
              value={responseContent}
              onChange={(e) => setResponseContent(e.target.value)}
              placeholder={
                responseType === "existing_list" 
                  ? "Explain why this list would be helpful for this request..."
                  : "Share your recommendations and why you suggest them..."
              }
              rows={4}
            />
          </div>

          <Button 
            onClick={handleSubmitResponse} 
            disabled={isSubmitting || !responseContent.trim()}
            className="w-full"
          >
            {isSubmitting ? "Submitting..." : "Submit Response"}
          </Button>
        </CardContent>
      </Card>

      {/* Existing Responses */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">
          Responses ({responses.length})
        </h2>
        
        {responses.length > 0 ? (
          responses.map((response) => (
            <Card key={response.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium">
                        {response.responder_profile.full_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        @{response.responder_profile.handle}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {response.response_type === "existing_list" ? "List Recommendation" : "New Recommendations"}
                    </Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(response.created_at), { addSuffix: true })}
                  </span>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* List recommendation */}
                {response.list && (
                  <div className="p-3 bg-muted rounded-lg">
                    <h4 className="font-medium mb-1">{response.list.title}</h4>
                    {response.list.description && (
                      <p className="text-sm text-muted-foreground">{response.list.description}</p>
                    )}
                  </div>
                )}
                
                {/* Response content */}
                <p className="text-sm leading-relaxed">{response.content}</p>
                
                {/* Voting buttons */}
                <div className="flex items-center gap-4 pt-2 border-t">
                  <Button
                    variant={response.user_vote?.vote_type === "helpful" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleVote(response.id, "helpful")}
                    className="flex items-center gap-2"
                  >
                    <ThumbsUp className="h-3 w-3" />
                    Helpful ({response.vote_counts.helpful})
                  </Button>
                  
                  <Button
                    variant={response.user_vote?.vote_type === "not_helpful" ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => handleVote(response.id, "not_helpful")}
                    className="flex items-center gap-2"
                  >
                    <ThumbsUp className="h-3 w-3 rotate-180" />
                    Not Helpful ({response.vote_counts.not_helpful})
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent>
              <div className="text-center py-8">
                <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                  <MessageSquare className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="font-medium mb-1">No responses yet</h3>
                <p className="text-sm text-muted-foreground">
                  Be the first to respond to this request!
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Forward Request Modal */}
      {request && (
        <ForwardRequestModal
          open={showForwardModal}
          onOpenChange={setShowForwardModal}
          requestId={request.id}
          requestTitle={request.title}
          requestCreatorName={request.creator_profile?.full_name || 'Unknown'}
          existingNetworkPath={request.network_path}
          onForwardComplete={() => {
            loadRequestData();
            toast({
              title: "Success!",
              description: "Request forwarded to your network"
            });
          }}
        />
      )}
    </div>
  );
}
