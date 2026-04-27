import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, ThumbsUp, MessageSquare, User, Users, UserCheck, MapPin, Clock, Share2, ArrowRight, Edit, Trash2, X, Link as LinkIcon, AlertTriangle, Check, CheckCircle, Save, Timer } from "lucide-react";
import { ExpiryBadge, isRequestExpired } from "@/components/ExpiryBadge";
import { ExpiryDurationPicker } from "@/components/ExpiryDurationPicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import { ForwardRequestModal } from "@/components/ForwardRequestModal";
import { DeleteRequestDialog } from "@/components/DeleteRequestDialog";
// Note: Request pages always show real names. Network-aware anonymization
// is only applied in the Master Directory context.
import { initiateClusteringReview } from "@/lib/clustering";
import { ResponseTree } from "@/components/ResponseTree";
import { LiveLeaderboard, LeaderboardEntry } from "@/components/LiveLeaderboard";

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

interface SimilarRecommendation {
  id: string;
  recommendation_text: string;
  vote_count: number;
  similarity_score?: number;
}

interface Suggestions {
  index: number;
  items: SimilarRecommendation[];
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

// Normalize text for duplicate detection
const normalizeText = (text: string): string => {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' '); // Collapse multiple spaces
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
  const [isClosingRequest, setIsClosingRequest] = useState(false);
  const [isStartingReview, setIsStartingReview] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [guestContributions, setGuestContributions] = useState<any[]>([]);
  const [guestVotes, setGuestVotes] = useState<Record<string, boolean>>({});
  const [showShareSection, setShowShareSection] = useState(false);
  const [myShareLink, setMyShareLink] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [existingShareLinks, setExistingShareLinks] = useState<any[]>([]);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [extendDays, setExtendDays] = useState("7");
  const [isExtending, setIsExtending] = useState(false);
  // User's existing response state
  const [userResponse, setUserResponse] = useState<RequestResponse | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteResponseDialog, setShowDeleteResponseDialog] = useState(false);
  const [isDeletingResponse, setIsDeletingResponse] = useState(false);
  
  // Response form state - simplified: name + link per recommendation
  const [recommendations, setRecommendations] = useState<RecommendationInput[]>([
    { name: '', link: '' },
  ]);
  const [overallContext, setOverallContext] = useState("");
  const MAX_CONTEXT_LENGTH = 120;

  // Duplicate detection state
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Welcome banner for newly converted guest users
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") !== "1") return;

    setShowWelcomeBanner(true);
    params.delete("welcome");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);

    const timer = setTimeout(() => setShowWelcomeBanner(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Real-time subscriptions for live updates
  useEffect(() => {
    if (!id) return;

    const responsesChannel = supabase
      .channel(`request-responses-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "request_responses", filter: `request_id=eq.${id}` },
        () => { loadRequestData(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recommendation_votes" },
        () => { loadRequestData(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "response_recommendations" },
        () => { loadRequestData(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "guest_contributions", filter: `request_id=eq.${id}` },
        () => { loadRequestData(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(responsesChannel); };
  }, [id]);

  const loadExistingShareLinks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !id) return;

      const { data, error } = await supabase
        .from("share_links")
        .select("id, token, generated_by_name, current_responses, max_responses, created_at")
        .eq("request_id", id)
        .eq("generated_by_user_id", user.id)
        .is("parent_link_id", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setExistingShareLinks(data || []);
    } catch (error) {
      console.error("Error loading share links:", error);
    }
  };

  useEffect(() => {
    if (id) {
      loadRequestData();
      loadExistingShareLinks();
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

        networkPath = forwardPath.network_path.map((userId: string) => {
          const profile = pathProfiles?.find(p => p.id === userId);
          return {
            user_id: userId,
            user_name: profile?.full_name || profile?.handle || 'Someone',
            user_handle: profile?.handle || 'unknown',
            isConnectedToViewer: true,
          };
        });
      }

      // On request pages we always reveal the creator's real identity.
      const isCreatorConnected = true;
      
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

          // Always show responder's real name on request pages
          const responderDisplayName = responderData?.full_name || responderData?.handle || 'Someone';
          const responderDisplayHandle = responderData?.handle || 'unknown';

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

              // Get voter profiles with network-aware names
              let voterProfiles: { id: string; full_name: string; handle: string }[] = [];
              if (voters.length > 0) {
                const { data: profiles } = await supabase
                  .from("profiles")
                  .select("id, full_name, handle")
                  .in("id", voters.map(v => v.user_id));
                
                // Always show voters' real names on request pages
                voterProfiles = (profiles || []).map(p => ({
                  id: p.id,
                  full_name: p.full_name || p.handle || 'Someone',
                  handle: p.handle,
                }));
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
            responder_profile: {
              full_name: responderDisplayName,
              handle: responderDisplayHandle
            },
            recommendations: recommendationsWithVotes
          };
        })
      );

      setResponses(processedResponses);

      // Check if current user has already responded
      const existingUserResponse = processedResponses.find(r => r.responder_id === user.id);
      setUserResponse(existingUserResponse || null);

      // Load guest contributions
      const { data: guestData, error: guestError } = await supabase
        .from("guest_contributions")
        .select(`
          id,
          contributor_name,
          contributor_contact,
          recommendations,
          created_at,
          share_link_id
        `)
        .eq("request_id", id!)
        .order("created_at", { ascending: false });

      if (guestError) {
        console.error("Error loading guest contributions:", guestError);
      }

      // Get share link info for each contribution
      const guestWithLinks = await Promise.all(
        (guestData || []).map(async (contribution) => {
          let shareLink = null;
          if (contribution.share_link_id) {
            const { data: linkData } = await supabase
              .from("share_links")
              .select("id, generated_by_name, parent_link_id")
              .eq("id", contribution.share_link_id)
              .maybeSingle();
            shareLink = linkData;
          }
          return { ...contribution, share_links: shareLink };
        })
      );

      setGuestContributions(guestWithLinks);

      // Load user's existing votes on guest recommendations
      if (user) {
        const allRecIds: string[] = [];
        (guestWithLinks || []).forEach((c: any) => {
          const recs = Array.isArray(c.recommendations) ? c.recommendations : [];
          recs.forEach((r: any) => {
            if (!r) return;
            if (r.id) allRecIds.push(r.id);
          });
        });
        if (allRecIds.length > 0) {
          const { data: voteData } = await supabase
            .from("recommendation_votes")
            .select("recommendation_id")
            .eq("user_id", user.id)
            .in("recommendation_id", allRecIds);
          const voteMap: Record<string, boolean> = {};
          (voteData || []).forEach(v => { voteMap[v.recommendation_id] = true; });
          setGuestVotes(voteMap);
        }
      }

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
    if (recommendations.length <= 1) {
      toast({
        title: "Minimum required",
        description: "You need at least 1 recommendation",
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

    // Trigger duplicate search when name field changes
    if (field === 'name') {
      searchForSimilarRecommendations(index, value);
    }
  };

  // Search for similar existing recommendations with debouncing
  const searchForSimilarRecommendations = useCallback((index: number, value: string) => {
    // Clear any pending search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Clear suggestions if input is too short
    if (value.trim().length < 3) {
      setSuggestions(null);
      return;
    }

    // Debounce the search
    searchTimeoutRef.current = setTimeout(async () => {
      if (!id) return;
      
      setIsSearching(true);
      try {
        const normalized = normalizeText(value);
        
        // Use fuzzy matching with PostgreSQL's pg_trgm similarity
        const { data: similar, error } = await supabase
          .rpc('search_similar_recommendations', {
            search_term: normalized,
            req_id: id,
            similarity_threshold: 0.4
          });

        if (error) {
          console.error('Fuzzy search error:', error);
          setSuggestions(null);
          return;
        }

        console.log('Fuzzy search results:', similar);

        if (similar && similar.length > 0) {
          setSuggestions({
            index,
            items: similar.map((r: { id: string; recommendation_text: string; vote_count: number; similarity_score: number }) => ({
              id: r.id,
              recommendation_text: r.recommendation_text,
              vote_count: r.vote_count || 0,
              similarity_score: r.similarity_score
            }))
          });
        } else {
          setSuggestions(null);
        }
      } catch (error) {
        console.error('Error searching for similar recommendations:', error);
        setSuggestions(null);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce
  }, [id]);

  // Handle selecting an existing recommendation to vote on instead
  const handleSelectExistingRecommendation = async (existingRec: SimilarRecommendation, index: number) => {
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
      // Check if user already voted
      const { data: existingVote } = await supabase
        .from("recommendation_votes")
        .select("id")
        .eq("recommendation_id", existingRec.id)
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (existingVote) {
        toast({
          title: "Already voted",
          description: `You've already voted for "${existingRec.recommendation_text}"`,
          variant: "destructive"
        });
      } else {
        // Add vote
        const { error } = await supabase
          .from("recommendation_votes")
          .insert({
            recommendation_id: existingRec.id,
            user_id: currentUserId
          });

        if (error) throw error;
        
        toast({
          title: "Voted on existing recommendation",
          description: `You voted for "${existingRec.recommendation_text}"`,
        });

        // Refresh data to show updated vote count
        await loadRequestData();
      }

      // Clear the input
      const updated = [...recommendations];
      updated[index].name = '';
      setRecommendations(updated);
      setSuggestions(null);

    } catch (error) {
      console.error('Error voting on recommendation:', error);
      toast({
        title: "Error",
        description: "Failed to submit vote",
        variant: "destructive"
      });
    }
  };

  // Dismiss suggestions for a specific input
  const dismissSuggestions = () => {
    setSuggestions(null);
  };

  const handleSubmitResponse = async () => {
    if (!request) return;

    // Validate at least 1 valid recommendation (name is required)
    const validRecs = recommendations.filter(r => r.name.trim());
    if (validRecs.length < 1) {
      toast({
        title: "Incomplete Response",
        description: "Please provide at least 1 recommendation",
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

      // Create individual recommendations with improved normalization
      const recsToInsert = validRecs.map((rec, index) => ({
        response_id: responseId,
        recommendation_text: rec.name.trim(),
        recommendation_text_normalized: normalizeText(rec.name),
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
            is_read: false,
            metadata: { request_id: request.id }
          });
      }

      toast({
        title: "Success",
        description: isEditing ? "Your response has been updated!" : "Your recommendations have been submitted!",
      });

      // Reset form and state
      setRecommendations([
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
    
    // Ensure at least 1 slot
    if (existingRecs.length < 1) {
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

  const handleGuestVote = async (contributionId: string, recId: string, recIndex: number, currentlyVoted: boolean) => {
    if (!currentUserId) return;
    if (isOwnRequest) {
      toast({ title: "Cannot vote", description: "Request creators cannot vote on recommendations", variant: "destructive" });
      return;
    }
    try {
      if (currentlyVoted) {
        const { error } = await supabase.from("recommendation_votes").delete()
          .eq("recommendation_id", recId).eq("user_id", currentUserId);
        if (error) throw error;
        setGuestVotes(prev => { const n = { ...prev }; delete n[recId]; return n; });
        // Decrement vote_count in JSONB
        const contribution = guestContributions.find(c => c.id === contributionId);
        if (contribution) {
          const recs = [...(contribution.recommendations || [])];
          if (recs[recIndex]) {
            recs[recIndex] = { ...recs[recIndex], vote_count: Math.max(0, (recs[recIndex].vote_count || 0) - 1) };
            await supabase.from("guest_contributions").update({ recommendations: recs }).eq("id", contributionId);
          }
        }
        toast({ title: "Vote removed" });
      } else {
        const { error } = await supabase.from("recommendation_votes").insert({ recommendation_id: recId, user_id: currentUserId });
        if (error) {
          if (error.code === '23505') { toast({ title: "Already voted", variant: "destructive" }); return; }
          throw error;
        }
        setGuestVotes(prev => ({ ...prev, [recId]: true }));
        // Increment vote_count in JSONB
        const contribution = guestContributions.find(c => c.id === contributionId);
        if (contribution) {
          const recs = [...(contribution.recommendations || [])];
          if (recs[recIndex]) {
            recs[recIndex] = { ...recs[recIndex], vote_count: (recs[recIndex].vote_count || 0) + 1 };
            await supabase.from("guest_contributions").update({ recommendations: recs }).eq("id", contributionId);
          }
        }
        toast({ title: "Vote recorded" });
      }
      await loadRequestData();
    } catch (error) {
      console.error("Error voting on guest rec:", error);
      toast({ title: "Error", description: "Failed to submit vote", variant: "destructive" });
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

  // Close request and save top recommendations to My Lists
  const handleCloseAndSave = async () => {
    if (!request || !currentUserId) return;
    
    console.log('=== CLOSING REQUEST AND SAVING TO MY LISTS ===');
    setIsClosingRequest(true);
    
    try {
      // 1. Get top 10 recommendations by vote count from aggregated top recs
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
      
      const topRecommendations = Object.values(grouped)
        .sort((a, b) => b.total_votes - a.total_votes)
        .slice(0, 10);
      
      console.log('Top 10 recommendations:', topRecommendations);
      
      if (!topRecommendations || topRecommendations.length === 0) {
        toast({
          title: "No recommendations to save",
          description: "This request has no recommendations yet.",
          variant: "destructive"
        });
        setIsClosingRequest(false);
        return;
      }
      
      // 2. Create saved list using existing lists table
      const { data: savedList, error: listError } = await supabase
        .from('lists')
        .insert({
          owner_id: currentUserId,
          title: request.title,
          description: `Saved from request - ${topRecommendations.length} top recommendations with ${topRecommendations.reduce((sum, rec) => sum + rec.total_votes, 0)} total votes`,
          category: request.category as any,
          visibility: 'private',
          source_request_id: request.id
        })
        .select()
        .single();
      
      if (listError) throw listError;
      
      console.log('Saved list created:', savedList);
      
      // 3. Save top items to list_items
      const listItems = topRecommendations.map((rec, index) => ({
        list_id: savedList.id,
        content: rec.recommendation_text,
        url: rec.link,
        position: index + 1
      }));
      
      const { error: itemsError } = await supabase
        .from('list_items')
        .insert(listItems);
      
      if (itemsError) throw itemsError;
      
      console.log('List items saved:', listItems.length);
      
      // 4. Mark request as closed
      const { error: updateError } = await supabase
        .from('requests')
        .update({ 
          status: 'closed',
          updated_at: new Date().toISOString()
        })
        .eq('id', request.id);
      
      if (updateError) throw updateError;
      
      console.log('Request marked as closed');
      
      // 5. Show success message
      toast({
        title: "Request closed!",
        description: `Saved top ${topRecommendations.length} recommendations to My Lists`
      });
      
      // 6. Reload to show closed state
      await loadRequestData();
      
    } catch (error: any) {
      console.error('Error closing request:', error);
      toast({
        title: "Failed to close request",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsClosingRequest(false);
    }
  };

  // Close & Review: cluster recommendations and navigate to review page
  const handleStartReview = async () => {
    if (!request?.id) return;
    
    setIsStartingReview(true);
    try {
      const clusters = await initiateClusteringReview(request.id);
      toast({
        title: "Review Started!",
        description: `Found ${clusters.length} unique recommendations to review`
      });
      navigate(`/requests/${request.id}/review`);
    } catch (error: any) {
      console.error('Error starting review:', error);
      toast({
        title: "Failed to Start Review",
        description: error?.message || "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsStartingReview(false);
    }
  };

  const handleExtendRequest = async () => {
    if (!request) return;
    setIsExtending(true);
    try {
      const newExpiresAt = new Date(Date.now() + parseInt(extendDays) * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("requests")
        .update({ expires_at: newExpiresAt, expiry_notified: false })
        .eq("id", request.id);
      if (error) throw error;
      toast({ title: "Request Extended", description: `Extended by ${extendDays} days` });
      setShowExtendDialog(false);
      await loadRequestData();
    } catch (error) {
      console.error("Error extending request:", error);
      toast({ title: "Error", description: "Failed to extend request", variant: "destructive" });
    } finally {
      setIsExtending(false);
    }
  };

  const handleQuickClose = async () => {
    if (!request) return;
    try {
      const { error } = await supabase
        .from("requests")
        .update({ status: "closed" })
        .eq("id", request.id);
      if (error) throw error;
      toast({ title: "Request Closed", description: "Your request has been closed" });
      await loadRequestData();
    } catch (error) {
      console.error("Error closing request:", error);
      toast({ title: "Error", description: "Failed to close request", variant: "destructive" });
    }
  };


  const generateShareLink = async () => {
    setIsGeneratingLink(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      const { data: tokenData, error: tokenError } = await supabase.rpc("generate_share_token");
      if (tokenError) throw tokenError;

      const { error: linkError } = await supabase
        .from("share_links")
        .insert({
          request_id: id,
          token: tokenData,
          generated_by_user_id: user.id,
          generated_by_name: profile?.full_name || "You",
          max_responses: 999,  // Unlimited for Antelog users
          current_responses: 0
        });

      if (linkError) throw linkError;

      const generatedUrl = `${window.location.origin}/r/${id}/${tokenData}`;
      setMyShareLink(generatedUrl);

      toast({
        title: "Share Link Generated!",
        description: "Copy and share this link with friends not on Antelog"
      });

      await loadExistingShareLinks();
    } catch (error) {
      console.error("Error generating link:", error);
      toast({
        title: "Failed to Generate Link",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const copyShareLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast({
      title: "Copied!",
      description: "Share link copied to clipboard"
    });
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

  // Build unified leaderboard entries (network + guest), excluding merged-away items
  const buildLeaderboardEntries = (): LeaderboardEntry[] => {
    const items: LeaderboardEntry[] = [];

    // Network recommendations from response_recommendations
    responses.forEach((response) => {
      response.recommendations.forEach((rec: any) => {
        if (rec.merged_into_id) return; // Hide merged-away network entries
        items.push({
          key: `n:${rec.id}`,
          recommendationId: rec.id,
          source: "network",
          text: rec.recommendation_text,
          link: rec.link ?? null,
          voteCount: rec.vote_count ?? 0,
          userVoted: !!rec.user_voted,
          responderId: response.responder_id,
        });
      });
    });

    // Guest recommendations from guest_contributions JSONB
    guestContributions.forEach((contribution: any) => {
      const recs: any[] = Array.isArray(contribution.recommendations) ? contribution.recommendations : [];
      recs.forEach((rec, idx) => {
        if (!rec) return;
        if (rec.merged_into_id) return; // Hide merged-away guest entries
        const recId: string | undefined = rec.id;
        const text: string = rec.text || rec.name || rec.recommendation_text || "";
        if (!recId || !text) return;
        items.push({
          key: `g:${contribution.id}:${idx}`,
          recommendationId: recId,
          source: "guest",
          text,
          link: rec.link ?? null,
          voteCount: rec.vote_count ?? 0,
          userVoted: !!guestVotes[recId],
          guestContributionId: contribution.id,
          guestRecIndex: idx,
          responderId: undefined,
        });
      });
    });

    return items;
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
      {/* Welcome Banner for newly converted guests */}
      {showWelcomeBanner && (
        <div className="mb-6 p-4 rounded-lg border border-primary/30 bg-primary/5 flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">Welcome to Antelog! 🎉</p>
            <p className="text-sm text-muted-foreground">Here's the request you contributed to. See how your recommendation is doing.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowWelcomeBanner(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link to="/requests" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Requests
          </Link>
        </Button>
        
        <h1 className="text-3xl font-bold mb-2">Respond to Request</h1>
        <p className="text-muted-foreground">
          Share your top 1-5 recommendations
        </p>
      </div>

      {/* Request Details */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <CardTitle className="text-xl mb-2">{request.title}</CardTitle>
              
              {/* Requested by + Share Chain */}
              {request.creator_profile && (
                <p className="text-sm text-muted-foreground mb-1">
                  Requested by {request.isCreatorConnected 
                    ? (request.creator_profile.full_name || request.creator_profile.handle)
                    : (request.creator_profile.handle ? `@${request.creator_profile.handle}` : 'Someone')
                  }
                </p>
              )}
              {/* Tier 1: Subtle share chain for forwarded requests */}
              {request.network_path && request.network_path.length > 0 && (
                <p className="text-xs text-muted-foreground mb-3">
                  Shared by {request.network_path[request.network_path.length - 1].user_name}
                  {request.network_path.length > 1 && (
                    <> via {request.network_path.slice(0, -1).map(n => n.user_name).join(" → ")}</>
                  )}
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
            {(request as any).expires_at && (
              <ExpiryBadge expiresAt={(request as any).expires_at} status={request.status} />
            )}
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

          <div className="flex flex-wrap gap-2 pt-2 border-t">
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
                {/* Tier 2: Response Tree - only for request creator */}
                {currentUserId && (
                  <ResponseTree
                    requestId={request.id}
                    creatorId={request.creator_id}
                    viewerId={currentUserId}
                  />
                )}
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

      {/* Live Leaderboard — visible to everyone who can see the request */}
      <LiveLeaderboard
        requestId={request.id}
        isCreator={isOwnRequest}
        currentUserId={currentUserId}
        entries={buildLeaderboardEntries()}
        onVoteNetwork={(recId, voted) => handleVoteRecommendation(recId, voted)}
        onVoteGuest={(cId, recId, idx, voted) => handleGuestVote(cId, recId, idx, voted)}
        onAfterMerge={loadRequestData}
      />

      {/* Expired Banner - Creator View */}
      {isOwnRequest && (request as any).expires_at && isRequestExpired((request as any).expires_at, request.status) && (
        <Card className="mb-8 border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-shrink-0 w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center">
                <Timer className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-amber-800 dark:text-amber-200">
                  This request expired on {new Date((request as any).expires_at).toLocaleDateString()}
                </h3>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  What would you like to do?
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowExtendDialog(true)}>
                  Extend Request
                </Button>
                <Button variant="default" onClick={handleQuickClose}>
                  Close Request
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expired Banner - Non-creator View */}
      {!isOwnRequest && (request as any).expires_at && isRequestExpired((request as any).expires_at, request.status) && (
        <Card className="mb-8 border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center">
                <Timer className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-amber-800 dark:text-amber-200">This request has expired</h3>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  No new responses can be submitted. Existing responses are still visible.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


      {request.status === 'closed' && (
        <Card className="mb-8 border-green-500/30 bg-green-500/5">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-green-800 dark:text-green-200">Request Closed</h3>
                <p className="text-sm text-green-600 dark:text-green-400">
                  This request is closed. No new responses will be accepted.
                </p>
              </div>
              {isOwnRequest && (
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/lists')}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  View in My Lists
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Close & Review Button - Only for request creator when open */}
      {isOwnRequest && request.status === 'open' && (responses.length > 0 || guestContributions.length > 0) && (
        <Card className="mb-8 border-primary/30 bg-primary/5">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Save className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium">Ready to close this request?</h3>
                <p className="text-sm text-muted-foreground">
                  Review and save the best recommendations to your list
                </p>
              </div>
              <Button 
                onClick={handleStartReview}
                disabled={isStartingReview}
                className="flex items-center gap-2"
              >
                {isStartingReview ? (
                  <>Processing...</>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Close & Review
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review in Progress State */}
      {request.status === 'reviewing' && (
        <Card className="mb-8 border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center">
                <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-amber-800 dark:text-amber-200">Review in Progress</h3>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  You're currently reviewing this request's recommendations
                </p>
              </div>
              {isOwnRequest && (
                <Button 
                  onClick={() => navigate(`/requests/${request.id}/review`)} 
                  variant="outline" 
                  className="flex items-center gap-2"
                >
                  Continue Review
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Share Externally Section - Only show to request creator */}
      {currentUserId === request?.creator_id && (
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Share2 className="h-5 w-5" />
                Share with Friends Not on Antelog
              </CardTitle>
              {!showShareSection && existingShareLinks.length === 0 && !myShareLink && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowShareSection(true)}
                >
                  Show
                </Button>
              )}
            </div>
          </CardHeader>
          {(showShareSection || existingShareLinks.length > 0 || myShareLink) && (
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Generate a shareable link for friends who aren't on Antelog. 
                Your link has unlimited uses. Each person who responds can share with up to 5 more people.
              </p>

              {/* Existing Share Links */}
              {existingShareLinks.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Your Share Links:</h4>
                  {existingShareLinks.map((link, idx) => {
                    const linkUrl = `${window.location.origin}/r/${request.id}/${link.token}`;
                    return (
                      <div key={link.id} className="p-3 bg-background border rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Link #{idx + 1}</span>
                        </div>
                        <div className="flex gap-2">
                          <Input value={linkUrl} readOnly className="font-mono text-xs" />
                          <Button size="sm" variant="outline" onClick={() => copyShareLink(linkUrl)}>
                            Copy
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Created {formatDistanceToNow(new Date(link.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Generate Button - Only show if no links exist yet */}
              {existingShareLinks.length === 0 && !myShareLink && (
                <Button
                  onClick={generateShareLink}
                  disabled={isGeneratingLink}
                  className="w-full"
                  variant="default"
                >
                  {isGeneratingLink ? "Generating..." : "Generate Share Link"}
                </Button>
              )}

              {/* New Share Link */}
              {myShareLink && !existingShareLinks.some(l => `${window.location.origin}/r/${request.id}/${l.token}` === myShareLink) && (
                <div className="p-4 border border-primary/30 bg-primary/10 rounded-lg space-y-3">
                  <p className="text-sm font-semibold">✓ New Share Link Generated!</p>
                  <div className="flex gap-2">
                    <Input value={myShareLink} readOnly className="font-mono text-sm" />
                    <Button size="sm" onClick={() => copyShareLink(myShareLink)}>Copy</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Share this link via WhatsApp, SMS, or email with up to 5 friends
                  </p>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
                <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  <strong>Tip:</strong> Each person who uses your link can generate their own link 
                  to share with 5 more people. This creates a network chain you can track!
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      )}

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
            
            {request.status !== 'closed' && (
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
            )}
          </CardContent>
        </Card>
      ) : request.status === 'closed' || ((request as any).expires_at && isRequestExpired((request as any).expires_at, request.status)) ? (
        /* Request is closed or expired - show message */
        <Card className="mb-8 border-muted">
          <CardContent className="py-8">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                {request.status === 'closed' 
                  ? <CheckCircle className="h-6 w-6 text-muted-foreground" />
                  : <Timer className="h-6 w-6 text-muted-foreground" />
                }
              </div>
              <h3 className="font-medium mb-1">
                {request.status === 'closed' ? 'This request has been closed' : 'This request has expired'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {request.status === 'closed' 
                  ? 'The creator is no longer accepting new recommendations'
                  : 'No new responses can be submitted'}
              </p>
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
              Share 1-5 specific recommendations. Each can be voted on individually.
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
                    onBlur={() => {
                      // Delay dismissal to allow click on suggestion
                      setTimeout(() => {
                        if (suggestions?.index === index) {
                          setSuggestions(null);
                        }
                      }, 200);
                    }}
                    maxLength={200}
                  />
                  
                  {/* Duplicate detection suggestions */}
                  {suggestions && suggestions.index === index && suggestions.items.length > 0 && (
                    <div className="border rounded-md mt-2 p-3 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                          Similar recommendations exist
                        </p>
                      </div>
                      <div className="space-y-1">
                        {suggestions.items.map(item => (
                          <div 
                            key={item.id}
                            className="flex items-center justify-between text-sm p-2 rounded bg-yellow-100 dark:bg-yellow-900 hover:bg-yellow-200 dark:hover:bg-yellow-800 cursor-pointer transition-colors"
                            onClick={() => handleSelectExistingRecommendation(item, index)}
                          >
                            <span className="text-yellow-900 dark:text-yellow-100">
                              {item.recommendation_text}
                            </span>
                            <span className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-300">
                              {item.similarity_score && (
                                <span className="bg-yellow-200 dark:bg-yellow-800 px-1.5 py-0.5 rounded">
                                  {Math.round(item.similarity_score * 100)}% match
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <ThumbsUp className="h-3 w-3" />
                                {item.vote_count} {item.vote_count === 1 ? 'vote' : 'votes'}
                              </span>
                              <span>- Click to vote</span>
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={dismissSuggestions}
                          className="text-xs text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          No, this is different
                        </Button>
                      </div>
                    </div>
                  )}
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
              (minimum 1, maximum 5)
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
          Responses ({responses.length + guestContributions.length})
        </h2>
        
        {responses.length > 0 ? (
          responses.map((response) => (
            <Card key={response.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium">{response.responder_profile.full_name}</p>
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

        {/* Guest Contributions */}
        {guestContributions.length > 0 && (
          <div className="space-y-4 mt-6">
            <h3 className="text-lg font-semibold text-muted-foreground">
              Guest Responses ({guestContributions.length})
            </h3>

            {guestContributions.map((contribution) => {
              const recs = Array.isArray(contribution.recommendations)
                ? contribution.recommendations
                : [];

              return (
                <Card key={contribution.id} className="border-dashed">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {contribution.contributor_name} (Guest)
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {contribution.share_links?.generated_by_name
                            ? `via ${contribution.share_links.generated_by_name}`
                            : 'via your share link'}
                        </p>
                      </div>
                      <Badge variant="outline">Guest</Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {recs.map((rec: any, idx: number) => {
                      if (!rec) return null;
                      const canVote = !isOwnRequest && currentUserId;
                      const recId = rec.id;
                      const hasVoted = recId && guestVotes[recId];
                      
                      return (
                        <div key={recId || idx} className="p-3 border rounded-lg">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-bold text-primary">#{idx + 1}</span>
                                <span className="font-medium">{rec.text}</span>
                              </div>
                              {rec.reason && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {rec.reason}
                                </p>
                              )}
                              {rec.link && (
                                <a
                                  href={rec.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-primary hover:underline mt-1 inline-flex items-center gap-1"
                                >
                                  <LinkIcon className="h-3 w-3" />
                                  View link
                                </a>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {canVote && recId ? (
                                <Button
                                  variant={hasVoted ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => handleGuestVote(contribution.id, recId, idx, !!hasVoted)}
                                  className="flex items-center gap-1"
                                >
                                  <ThumbsUp className="h-3 w-3" />
                                  {hasVoted ? "Voted" : "+1"}
                                  {(rec.vote_count || 0) > 0 && (
                                    <span className="ml-1">({rec.vote_count})</span>
                                  )}
                                </Button>
                              ) : (
                                <Badge variant="secondary">
                                  {rec.vote_count || 0} {(rec.vote_count || 0) === 1 ? 'vote' : 'votes'}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <p className="text-xs text-muted-foreground mt-2">
                      Responded {formatDistanceToNow(new Date(contribution.created_at), { addSuffix: true })}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
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
      {/* Extend Request Dialog */}
      <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Request</DialogTitle>
          </DialogHeader>
          <ExpiryDurationPicker value={extendDays} onChange={setExtendDays} label="Extend by" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtendDialog(false)}>Cancel</Button>
            <Button onClick={handleExtendRequest} disabled={isExtending}>
              {isExtending ? "Extending..." : "Confirm Extension"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
