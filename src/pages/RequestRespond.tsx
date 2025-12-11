import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, ThumbsUp, MessageSquare, User, Users, UserCheck, MapPin, Clock, Share2, ArrowRight, Edit, Trash2, X, Link as LinkIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ForwardRequestModal } from "@/components/ForwardRequestModal";
import { DeleteRequestDialog } from "@/components/DeleteRequestDialog";
import { areUsersConnected, getDisplayNameSync } from "@/hooks/useNetworkAwareName";

interface NetworkPathNode {
  user_id: string;
  user_name: string;
  user_handle: string;
  isConnectedToViewer?: boolean;
}

interface Request {
  id: string;
  title: string;
  category: string;
  location: string | null;
  audience_type: string;
  audience_types?: string[];
  status: string;
  created_at: string;
  allow_forwarding: boolean;
  creator_id: string;
  creator_profile?: {
    full_name: string;
    handle: string;
  };
  isCreatorConnected?: boolean;
  network_path?: NetworkPathNode[];
  forwarded_by?: string;
}

interface Recommendation {
  id: string;
  recommendation_text: string;
  recommendation_text_normalized: string;
  position: number;
  quick_details: string | null;
  reason: string;
  link: string | null;
  vote_count: number;
  user_voted: boolean;
  voters: { id: string; full_name: string; handle: string }[];
}

interface RequestResponse {
  id: string;
  overall_notes: string | null;
  created_at: string;
  responder_id: string;
  responder_profile: {
    full_name: string;
    handle: string;
  };
  recommendations: Recommendation[];
}

interface RecommendationInput {
  name: string;
  link: string;
}

// Helper function to validate URLs
const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export default function RequestRespond() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [request, setRequest] = useState<Request | null>(null);
  const [responses, setResponses] = useState<RequestResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [hasForwarded, setHasForwarded] = useState(false);
  const [isOwnRequest, setIsOwnRequest] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // User's existing response state
  const [userResponse, setUserResponse] = useState<RequestResponse | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteResponseDialog, setShowDeleteResponseDialog] = useState(false);
  const [isDeletingResponse, setIsDeletingResponse] = useState(false);
  
  // Response form state - simplified: name + link per recommendation
  const [recommendations, setRecommendations] = useState<RecommendationInput[]>([
    { name: '', link: '' },
    { name: '', link: '' },
    { name: '', link: '' },
  ]);
  const [overallContext, setOverallContext] = useState("");
  const MAX_CONTEXT_LENGTH = 120;

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
      setCurrentUserId(user.id);

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
      
      const userIsOwner = requestData.creator_id === user.id;
      setIsOwnRequest(userIsOwner);
      const allowsForwarding = requestData.allow_forwarding === true;
      
      const { data: forwardData } = await supabase
        .from('request_forwards')
        .select('id')
        .eq('request_id', id)
        .eq('forwarded_by_user_id', user.id)
        .maybeSingle();
      
      setHasForwarded(!!forwardData);
      setCanForward(!userIsOwner && allowsForwarding && !forwardData);

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
        const { data: pathProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, handle')
          .in('id', forwardPath.network_path);

        networkPath = await Promise.all(
          forwardPath.network_path.map(async (userId: string) => {
            const profile = pathProfiles?.find(p => p.id === userId);
            const isConnected = await areUsersConnected(userId, user.id);
            return {
              user_id: userId,
              user_name: getDisplayNameSync(profile, isConnected),
              user_handle: profile?.handle || 'unknown',
              isConnectedToViewer: isConnected
            };
          })
        );
      }

      const isCreatorConnected = await areUsersConnected(requestData.creator_id, user.id);
      
      setRequest({
        ...requestData,
        creator_profile,
        isCreatorConnected,
        network_path: networkPath
      });

      // Load existing responses with recommendations
      const { data: responsesData, error: responsesError } = await supabase
        .from("request_responses")
        .select("*")
        .eq("request_id", id)
        .order("created_at", { ascending: false });

      if (responsesError) throw responsesError;

      // Process responses with recommendations and votes
      const processedResponses = await Promise.all(
        (responsesData || []).map(async (response) => {
          // Get responder profile
          const { data: responderData } = await supabase
            .from("profiles")
            .select("full_name, handle")
            .eq("id", response.responder_id)
            .single();

          // Get recommendations for this response
          const { data: recsData } = await supabase
            .from("response_recommendations")
            .select("*")
            .eq("response_id", response.id)
            .order("position", { ascending: true });

          // Get votes for each recommendation
          const recommendationsWithVotes = await Promise.all(
            (recsData || []).map(async (rec) => {
              const { data: votesData } = await supabase
                .from("recommendation_votes")
                .select("user_id")
                .eq("recommendation_id", rec.id);

              const voters = votesData || [];
              const userVoted = voters.some(v => v.user_id === user.id);

              // Get voter profiles
              let voterProfiles: { id: string; full_name: string; handle: string }[] = [];
              if (voters.length > 0) {
                const { data: profiles } = await supabase
                  .from("profiles")
                  .select("id, full_name, handle")
                  .in("id", voters.map(v => v.user_id));
                voterProfiles = profiles || [];
              }

              return {
                ...rec,
                user_voted: userVoted,
                voters: voterProfiles
              };
            })
          );

          return {
            ...response,
            responder_profile: responderData || { full_name: 'Unknown', handle: 'unknown' },
            recommendations: recommendationsWithVotes
          };
        })
      );

      setResponses(processedResponses);

      // Check if current user has already responded
      const existingUserResponse = processedResponses.find(r => r.responder_id === user.id);
      setUserResponse(existingUserResponse || null);

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

  const addRecommendation = () => {
    if (recommendations.length >= 5) {
      toast({
        title: "Maximum reached",
        description: "You can add up to 5 recommendations",
        variant: "destructive"
      });
      return;
    }
    setRecommendations([...recommendations, { name: '', link: '' }]);
  };

  const removeRecommendation = (index: number) => {
    if (recommendations.length <= 3) {
      toast({
        title: "Minimum required",
        description: "You need at least 3 recommendations",
        variant: "destructive"
      });
      return;
    }
    setRecommendations(recommendations.filter((_, i) => i !== index));
  };

  const updateRecommendation = (index: number, field: keyof RecommendationInput, value: string) => {
    const updated = [...recommendations];
    updated[index][field] = value;
    setRecommendations(updated);
  };

  const handleSubmitResponse = async () => {
    if (!request) return;

    // Validate at least 3 valid recommendations (name is required)
    const validRecs = recommendations.filter(r => r.name.trim());
    if (validRecs.length < 3) {
      toast({
        title: "Incomplete Response",
        description: "Please provide at least 3 recommendations",
        variant: "destructive"
      });
      return;
    }

    // Validate overall context length
    if (overallContext.length > MAX_CONTEXT_LENGTH) {
      toast({
        title: "Context too long",
        description: `Overall context must be ${MAX_CONTEXT_LENGTH} characters or less`,
        variant: "destructive"
      });
      return;
    }

    // Validate links if provided
    const invalidLinks = validRecs.filter(r => r.link.trim() && !isValidUrl(r.link.trim()));
    if (invalidLinks.length > 0) {
      toast({
        title: "Invalid link",
        description: "Please enter valid URLs for links (or leave them empty)",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let responseId: string;

      if (isEditing && userResponse) {
        // Update existing response
        const { error: updateError } = await supabase
          .from("request_responses")
          .update({
            overall_notes: overallContext.trim() || null
          })
          .eq("id", userResponse.id);

        if (updateError) throw updateError;
        responseId = userResponse.id;

        // Delete existing recommendations and re-insert
        await supabase
          .from("response_recommendations")
          .delete()
          .eq("response_id", userResponse.id);
      } else {
        // Create new response container
        const { data: responseData, error: responseError } = await supabase
          .from("request_responses")
          .insert({
            request_id: request.id,
            responder_id: user.id,
            overall_notes: overallContext.trim() || null
          })
          .select()
          .single();

        if (responseError) throw responseError;
        responseId = responseData.id;
      }

      // Create individual recommendations
      const recsToInsert = validRecs.map((rec, index) => ({
        response_id: responseId,
        recommendation_text: rec.name.trim(),
        recommendation_text_normalized: rec.name.trim().toLowerCase(),
        position: index + 1,
        quick_details: null,
        reason: '',
        link: rec.link.trim() || null,
        vote_count: 0
      }));

      const { error: recsError } = await supabase
        .from("response_recommendations")
        .insert(recsToInsert);

      if (recsError) throw recsError;

      // Notify request creator (only for new responses)
      if (!isEditing && request.creator_id !== user.id) {
        const { data: responderProfile } = await supabase
          .from("profiles")
          .select("full_name, handle")
          .eq("id", user.id)
          .single();

        const responderName = responderProfile?.full_name || responderProfile?.handle || "Someone";
        
        await supabase
          .from("notifications")
          .insert({
            user_id: request.creator_id,
            type: "request_response",
            title: `${responderName} responded to your request`,
            message: request.title,
            related_user_id: user.id,
            is_read: false
          });
      }

      toast({
        title: "Success",
        description: isEditing ? "Your response has been updated!" : "Your recommendations have been submitted!",
      });

      // Reset form and state
      setRecommendations([
        { name: '', link: '' },
        { name: '', link: '' },
        { name: '', link: '' },
      ]);
      setOverallContext("");
      setIsEditing(false);
      await loadRequestData();

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

  const handleEditResponse = () => {
    if (!userResponse) return;
    
    // Pre-populate form with existing data
    const existingRecs = userResponse.recommendations
      .sort((a, b) => a.position - b.position)
      .map(r => ({
        name: r.recommendation_text,
        link: r.link || ''
      }));
    
    // Ensure at least 3 slots
    while (existingRecs.length < 3) {
      existingRecs.push({ name: '', link: '' });
    }
    
    setRecommendations(existingRecs);
    setOverallContext(userResponse.overall_notes || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setRecommendations([
      { name: '', link: '' },
      { name: '', link: '' },
      { name: '', link: '' },
    ]);
    setOverallContext("");
  };

  const handleDeleteUserResponse = async () => {
    if (!userResponse) return;
    
    setIsDeletingResponse(true);
    try {
      const { error } = await supabase
        .from("request_responses")
        .delete()
        .eq("id", userResponse.id);

      if (error) throw error;

      toast({
        title: "Response Deleted",
        description: "Your response has been removed"
      });

      setUserResponse(null);
      setShowDeleteResponseDialog(false);
      await loadRequestData();
    } catch (error) {
      console.error("Error deleting response:", error);
      toast({
        title: "Error",
        description: "Failed to delete response",
        variant: "destructive"
      });
    } finally {
      setIsDeletingResponse(false);
    }
  };

  const handleVoteRecommendation = async (recommendationId: string, currentlyVoted: boolean) => {
    if (!currentUserId) return;
    
    // Check if user is request creator
    if (isOwnRequest) {
      toast({
        title: "Cannot vote",
        description: "Request creators cannot vote on recommendations",
        variant: "destructive"
      });
      return;
    }
    
    try {
      if (currentlyVoted) {
        // Remove vote
        const { error } = await supabase
          .from("recommendation_votes")
          .delete()
          .eq("recommendation_id", recommendationId)
          .eq("user_id", currentUserId);

        if (error) throw error;
        
        toast({
          title: "Vote removed",
          description: "Your vote has been removed"
        });
      } else {
        // Add vote
        const { error } = await supabase
          .from("recommendation_votes")
          .insert({
            recommendation_id: recommendationId,
            user_id: currentUserId
          });

        if (error) {
          // Check for unique constraint violation (already voted)
          if (error.code === '23505') {
            toast({
              title: "Already voted",
              description: "You've already voted on this recommendation",
              variant: "destructive"
            });
            return;
          }
          throw error;
        }
        
        toast({
          title: "Vote recorded",
          description: "Your vote has been added"
        });
      }

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

  const handleDeleteRequest = async () => {
    if (!request) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("requests")
        .delete()
        .eq("id", request.id);

      if (error) throw error;

      toast({
        title: "Request Deleted",
        description: "Your request has been permanently deleted"
      });

      navigate("/requests");
    } catch (error) {
      console.error("Error deleting request:", error);
      toast({
        title: "Error",
        description: "Failed to delete request",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const formatCategory = (category: string) => {
    return category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
  };

  const formatAudienceType = (audienceType: string) => {
    switch (audienceType) {
      case "first_network": return "1st Network";
      case "friends": return "Friends";
      case "extended_network": return "Extended Network";
      case "specific_group":
      case "group": return "Group";
      case "specific_people": return "Specific People";
      case "public": return "Public";
      default: return audienceType;
    }
  };

  const getAudienceIcon = (audienceType: string) => {
    switch (audienceType) {
      case "friends": return <User className="h-4 w-4" />;
      case "extended_network": return <Users className="h-4 w-4" />;
      case "specific_group": return <UserCheck className="h-4 w-4" />;
      default: return <Users className="h-4 w-4" />;
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

  // Get aggregated top recommendations across all responses
  const getTopRecommendations = () => {
    const allRecs = responses.flatMap(r => r.recommendations);
    const grouped = allRecs.reduce((acc, rec) => {
      const key = rec.recommendation_text_normalized || rec.recommendation_text.toLowerCase();
      if (!acc[key]) {
        acc[key] = { ...rec, total_votes: rec.vote_count };
      } else {
        acc[key].total_votes += rec.vote_count;
      }
      return acc;
    }, {} as Record<string, Recommendation & { total_votes: number }>);
    
    return Object.values(grouped)
      .sort((a, b) => b.total_votes - a.total_votes)
      .slice(0, 5);
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

  const topRecommendations = getTopRecommendations();

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
          Share your top 3-5 recommendations
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
                    <span className="font-medium">
                      {request.isCreatorConnected 
                        ? (request.creator_profile?.full_name || request.creator_profile?.handle || 'Someone')
                        : (request.creator_profile?.handle ? `@${request.creator_profile.handle}` : 'Someone')
                      }
                    </span>
                    {request.network_path.map((node, index) => (
                      <span key={index} className="flex items-center gap-2">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">via</span>
                        <span className={`font-medium ${node.isConnectedToViewer ? '' : 'text-muted-foreground'}`}>
                          {node.user_name}
                        </span>
                      </span>
                    ))}
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="secondary">endorsed to you</Badge>
                  </div>
                </div>
              ) : request.creator_profile && (
                <p className="text-sm text-muted-foreground mb-3">
                  Requested by {request.isCreatorConnected 
                    ? (request.creator_profile.full_name || request.creator_profile.handle)
                    : (request.creator_profile.handle ? `@${request.creator_profile.handle}` : 'Someone')
                  }
                </p>
              )}
            </div>
            <Badge variant="outline">{formatCategory(request.category)}</Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {request.location && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{request.location}</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Sent to:</span>
            {(request.audience_types || [request.audience_type]).map((audienceType, index) => (
              <Badge 
                key={index} 
                variant="secondary" 
                className={`text-xs ${getAudienceBadgeColor(audienceType)}`}
              >
                {getAudienceIcon(audienceType)}
                <span className="ml-1">{formatAudienceType(audienceType)}</span>
              </Badge>
            ))}
          </div>

          <div className="flex gap-2 pt-2 border-t">
            {isOwnRequest ? (
              <>
                <Button asChild variant="outline" className="flex items-center gap-2">
                  <Link to={`/requests/${request.id}/edit`}>
                    <Edit className="h-4 w-4" />
                    Edit Request
                  </Link>
                </Button>
                <Button
                  onClick={() => setShowDeleteDialog(true)}
                  variant="outline"
                  className="flex items-center gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Request
                </Button>
              </>
            ) : (
              <>
                {canForward && (
                  <Button onClick={() => setShowForwardModal(true)} variant="outline" className="flex items-center gap-2">
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
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top Recommendations Summary */}
      {topRecommendations.length > 0 && (
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ThumbsUp className="h-5 w-5 text-primary" />
              Top Recommendations
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Aggregated from all responses, ranked by votes
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topRecommendations.map((rec, index) => {
                const isOwnRecommendation = responses.some(r => 
                  r.responder_id === currentUserId && 
                  r.recommendations.some(rr => rr.recommendation_text_normalized === rec.recommendation_text_normalized)
                );
                const canVote = !isOwnRequest && !isOwnRecommendation && !rec.user_voted;
                
                return (
                  <div key={rec.id} className="p-4 border rounded-lg bg-background">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <span className="text-lg font-bold text-primary">#{index + 1}</span>
                        <div className="flex-1">
                          <p className="font-medium">{rec.recommendation_text}</p>
                          {rec.link && (
                            <a 
                              href={rec.link} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                            >
                              <LinkIcon className="h-3 w-3" />
                              View Link
                            </a>
                          )}
                          <p className="text-sm text-muted-foreground mt-1">
                            {rec.vote_count} {rec.vote_count === 1 ? 'vote' : 'votes'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {canVote && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleVoteRecommendation(rec.id, false)}
                            className="flex items-center gap-1"
                          >
                            <ThumbsUp className="h-3 w-3" />
                            +1
                          </Button>
                        )}
                        {rec.user_voted && (
                          <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            ✓ Voted
                          </Badge>
                        )}
                        {isOwnRecommendation && !rec.user_voted && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Your pick
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Response Section - Conditional UI based on user's response status */}
      {isOwnRequest ? (
        <Card className="mb-8 border-muted">
          <CardContent className="py-8">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium mb-1">This is your request</h3>
              <p className="text-sm text-muted-foreground">
                You created this request and cannot add recommendations. View what your network suggests!
              </p>
            </div>
          </CardContent>
        </Card>
      ) : userResponse && !isEditing ? (
        /* User has already responded - show their response */
        <Card className="mb-8 border-green-500/30 bg-green-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <ThumbsUp className="h-5 w-5" />
              Your Response
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Submitted {formatDistanceToNow(new Date(userResponse.created_at), { addSuffix: true })}
            </p>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div>
              <p className="font-medium mb-2">You recommended:</p>
              <ol className="list-decimal list-inside space-y-2">
                {userResponse.recommendations
                  .sort((a, b) => a.position - b.position)
                  .map((rec) => (
                    <li key={rec.id} className="flex items-center gap-2">
                      <span>{rec.recommendation_text}</span>
                      {rec.link && (
                        <a 
                          href={rec.link} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-primary hover:underline"
                        >
                          <LinkIcon className="h-3 w-3" />
                        </a>
                      )}
                      <span className="text-sm text-muted-foreground">
                        ({rec.vote_count} votes)
                      </span>
                    </li>
                  ))}
              </ol>
            </div>
            
            {userResponse.overall_notes && (
              <p className="text-sm italic text-muted-foreground border-l-2 pl-3">
                "{userResponse.overall_notes}"
              </p>
            )}
            
            <div className="flex gap-3 pt-2 border-t">
              <Button variant="outline" onClick={handleEditResponse} className="flex items-center gap-2">
                <Edit className="h-4 w-4" />
                Edit Response
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowDeleteResponseDialog(true)}
                className="flex items-center gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash2 className="h-4 w-4" />
                Delete Response
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* User has not responded or is editing - show form */
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isEditing ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {isEditing ? "Edit Your Recommendations" : "Add Your Recommendations"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Share 3-5 specific recommendations. Each can be voted on individually.
            </p>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {recommendations.map((rec, index) => (
              <div key={index} className="p-4 border rounded-lg space-y-3 relative">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-primary">Recommendation #{index + 1}</span>
                  {recommendations.length > 3 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRecommendation(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  )}
                </div>
                
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">Product/Service name *</label>
                  <Input
                    placeholder="Enter product or service"
                    value={rec.name}
                    onChange={(e) => updateRecommendation(index, "name", e.target.value)}
                    maxLength={200}
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground flex items-center gap-1">
                    <LinkIcon className="h-3 w-3" />
                    Link (optional)
                  </label>
                  <Input
                    placeholder="https://"
                    value={rec.link}
                    onChange={(e) => updateRecommendation(index, "link", e.target.value)}
                  />
                </div>
              </div>
            ))}

            {recommendations.length < 5 && (
              <Button variant="outline" onClick={addRecommendation} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Another Recommendation
              </Button>
            )}
            
            <p className="text-xs text-muted-foreground text-center">
              (minimum 3, maximum 5)
            </p>

            <div className="border-t pt-4 space-y-2">
              <label className="text-sm font-medium">Overall Context (optional)</label>
              <p className="text-xs text-muted-foreground">Why did you choose these?</p>
              <Textarea
                value={overallContext}
                onChange={(e) => setOverallContext(e.target.value.slice(0, MAX_CONTEXT_LENGTH))}
                placeholder="Brief context about your picks (optional)"
                rows={2}
                maxLength={MAX_CONTEXT_LENGTH}
              />
              <p className="text-xs text-muted-foreground text-right">
                {overallContext.length}/{MAX_CONTEXT_LENGTH}
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={isEditing ? handleCancelEdit : () => navigate('/requests')} 
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitResponse} 
                disabled={isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? "Submitting..." : isEditing ? "Update Response" : "Submit Recommendations"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                      <p className="font-medium">{response.responder_profile.full_name}</p>
                      <p className="text-sm text-muted-foreground">@{response.responder_profile.handle}</p>
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(response.created_at), { addSuffix: true })}
                  </span>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {response.overall_notes && (
                  <p className="text-sm text-muted-foreground italic">{response.overall_notes}</p>
                )}
                
                <div className="space-y-3">
                  {response.recommendations.map((rec, index) => {
                    const isOwnRecommendation = response.responder_id === currentUserId;
                    const canVote = !isOwnRequest && !isOwnRecommendation;
                    
                    return (
                      <div key={rec.id} className="p-3 border rounded-lg">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-bold text-primary">#{index + 1}</span>
                              <span className="font-medium">{rec.recommendation_text}</span>
                            </div>
                            {rec.link && (
                              <a 
                                href={rec.link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                              >
                                <LinkIcon className="h-3 w-3" />
                                View Link
                              </a>
                            )}
                          </div>
                          
                          <div className="flex flex-col items-end gap-2">
                            {canVote ? (
                              <Button
                                variant={rec.user_voted ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleVoteRecommendation(rec.id, rec.user_voted)}
                                className="flex items-center gap-1"
                              >
                                <ThumbsUp className="h-3 w-3" />
                                {rec.user_voted ? 'Voted' : '+1'} ({rec.vote_count})
                              </Button>
                            ) : (
                              <Badge variant="secondary">
                                {rec.vote_count} {rec.vote_count === 1 ? 'vote' : 'votes'}
                              </Badge>
                            )}
                            
                            {rec.voters.length > 0 && (
                              <div className="text-xs text-muted-foreground text-right">
                                {rec.voters.slice(0, 3).map(v => v.full_name || v.handle).join(", ")}
                                {rec.voters.length > 3 && ` +${rec.voters.length - 3} more`}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
          requestCreatorId={request.creator_id}
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

      {/* Delete Confirmation Dialog */}
      <DeleteRequestDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDeleteRequest}
        isDeleting={isDeleting}
      />

      {/* Delete Response Confirmation Dialog */}
      {showDeleteResponseDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4">
            <CardHeader>
              <CardTitle>Delete Your Response?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Are you sure you want to delete your response? This will remove all your recommendations and cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => setShowDeleteResponseDialog(false)}
                  className="flex-1"
                  disabled={isDeletingResponse}
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive"
                  onClick={handleDeleteUserResponse}
                  className="flex-1"
                  disabled={isDeletingResponse}
                >
                  {isDeletingResponse ? "Deleting..." : "Delete Response"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
