import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Users, Clock, Share2, CheckCircle2, Eye, ThumbsUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function GuestResponse() {
  const { requestId, token } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [request, setRequest] = useState<any>(null);
  const [shareLink, setShareLink] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [contributorName, setContributorName] = useState("");
  const [contributorContact, setContributorContact] = useState("");
  const [recommendations, setRecommendations] = useState([
    { text: "", reason: "", link: "", position: 1 },
    { text: "", reason: "", link: "", position: 2 },
    { text: "", reason: "", link: "", position: 3 },
  ]);

  const [myShareLink, setMyShareLink] = useState<string | null>(null);

  const reconstructChainIterative = async (linkId: string): Promise<string[]> => {
    const chain: string[] = [];
    let currentId: string | null = linkId;
    let depth = 0;

    while (currentId && depth < 10) {
      const { data, error } = await supabase
        .from("share_links")
        .select("generated_by_name, parent_link_id")
        .eq("id", currentId)
        .single();

      if (error || !data) break;

      if (data.generated_by_name) {
        chain.unshift(data.generated_by_name);
      }

      currentId = data.parent_link_id;
      depth++;
    }

    return chain;
  };

  useEffect(() => {
    if (requestId && token) {
      loadRequestData();
    }
  }, [requestId, token]);

  const loadRequestData = async () => {
    setIsLoading(true);
    try {
      const { data: requestData, error: requestError } = await supabase
        .from("requests")
        .select("id, title, category, location, created_at, creator_id")
        .eq("id", requestId!)
        .single();

      if (requestError) throw requestError;

      let creator_profile: { full_name: string | null } | null = null;
      if (requestData.creator_id) {
        const { data: creatorData } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", requestData.creator_id)
          .maybeSingle();
        creator_profile = creatorData;
      }

      setRequest({ ...requestData, creator_profile });

      const { data: linkData, error: linkError } = await supabase
        .from("share_links")
        .select("id, generated_by_name, current_responses, max_responses, times_opened")
        .eq("token", token!)
        .single();

      if (linkError) {
        toast({
          title: "Invalid Link",
          description: "This share link is not valid or has expired.",
          variant: "destructive",
        });
        return;
      }

      // Reconstruct full sharing chain
      const chainNames = await reconstructChainIterative(linkData.id);
      setShareLink({
        ...linkData,
        fullChain: chainNames,
      });

      if ((linkData.current_responses ?? 0) >= (linkData.max_responses ?? 5)) {
        toast({
          title: "Link Full",
          description: "This share link has reached its limit (5 responses).",
          variant: "destructive",
        });
      }

      await supabase
        .from("share_links")
        .update({ times_opened: (linkData.times_opened ?? 0) + 1 })
        .eq("id", linkData.id);
    } catch (error) {
      console.error("Error loading request:", error);
      toast({
        title: "Error",
        description: "Failed to load request details",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddRecommendation = () => {
    if (recommendations.length < 5) {
      setRecommendations([
        ...recommendations,
        { text: "", reason: "", link: "", position: recommendations.length + 1 },
      ]);
    }
  };

  const handleRemoveRecommendation = (index: number) => {
    if (recommendations.length > 1) {
      setRecommendations(recommendations.filter((_, i) => i !== index));
    }
  };

  const updateRecommendation = (index: number, field: string, value: string) => {
    const updated = [...recommendations];
    updated[index] = { ...updated[index], [field]: value };
    setRecommendations(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contributorName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter your name",
        variant: "destructive",
      });
      return;
    }

    const validRecs = recommendations.filter((r) => r.text.trim());

    if (validRecs.length === 0) {
      toast({
        title: "Recommendations Required",
        description: "Please add at least one recommendation",
        variant: "destructive",
      });
      return;
    }

    if (shareLink && (shareLink.current_responses ?? 0) >= (shareLink.max_responses ?? 5)) {
      toast({
        title: "Link Full",
        description: "This share link has reached its limit",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const formattedRecs = validRecs.map((rec, idx) => ({
        id: crypto.randomUUID(),
        text: rec.text.trim(),
        reason: rec.reason.trim(),
        link: rec.link.trim() || null,
        position: idx + 1,
        vote_count: 0,
      }));

      const { error: contributionError } = await supabase
        .from("guest_contributions")
        .insert({
          request_id: requestId!,
          share_link_id: shareLink?.id,
          contributor_name: contributorName.trim(),
          contributor_contact: contributorContact.trim() || null,
          recommendations: formattedRecs,
        });

      if (contributionError) throw contributionError;

      if (shareLink) {
        await supabase
          .from("share_links")
          .update({
            current_responses: (shareLink.current_responses ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", shareLink.id);
      }

      setHasSubmitted(true);

      toast({
        title: "Thanks for your input!",
        description: "Your recommendations have been saved.",
      });
    } catch (error) {
      console.error("Error submitting:", error);
      toast({
        title: "Submission Failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateMyShareLink = async () => {
    try {
      const { data: tokenData, error: tokenError } = await supabase.rpc("generate_share_token");

      if (tokenError) throw tokenError;

      const { error: linkError } = await supabase
        .from("share_links")
        .insert({
          request_id: requestId!,
          parent_link_id: shareLink?.id,
          token: tokenData,
          generated_by_name: contributorName,
          generated_by_contact: contributorContact || null,
          max_responses: 5,
          current_responses: 0,
        });

      if (linkError) throw linkError;

      const generatedUrl = `${window.location.origin}/r/${requestId}/${tokenData}`;
      setMyShareLink(generatedUrl);

      toast({
        title: "Share Link Generated!",
        description: "You can now share this with up to 5 people",
      });
    } catch (error) {
      console.error("Error generating link:", error);
      toast({
        title: "Failed to Generate Link",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const copyShareLink = () => {
    if (myShareLink) {
      navigator.clipboard.writeText(myShareLink);
      toast({
        title: "Copied!",
        description: "Share link copied to clipboard",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="animate-pulse text-lg font-medium text-foreground">Loading request...</div>
          <p className="text-sm text-muted-foreground">Please wait</p>
        </div>
      </div>
    );
  }

  if (!request || !shareLink) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Request Not Found</h2>
            <p className="text-muted-foreground">This link may be invalid or expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAtCapacity = (shareLink.current_responses ?? 0) >= (shareLink.max_responses ?? 5);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <Badge variant="secondary" className="capitalize">{request.category}</Badge>
          <h1 className="text-2xl font-bold text-foreground">{request.title}</h1>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {shareLink.generated_by_name && (
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                Shared by {shareLink.generated_by_name}
                {shareLink.fullChain && shareLink.fullChain.length > 1 && (
                  <span className="text-muted-foreground text-xs">
                    {" "}(via {shareLink.fullChain.slice(0, -1).reverse().join(" → ")})
                  </span>
                )}
              </span>
            )}
            {request.creator_profile?.full_name && (
              <span>Asked by {request.creator_profile.full_name}</span>
            )}
            {request.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {request.location}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        {hasSubmitted ? (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-lg font-medium text-foreground">
                    Thanks {contributorName}! Your recommendations are saved.
                  </p>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <p className="font-medium text-foreground">Want to see what others recommended?</p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Eye className="h-4 w-4" /> See all recommendations
                    </li>
                    <li className="flex items-center gap-2">
                      <ThumbsUp className="h-4 w-4" /> Vote on the best answers
                    </li>
                    <li className="flex items-center gap-2">
                      <Users className="h-4 w-4" /> See who voted for yours
                    </li>
                  </ul>
                  <Button className="w-full" onClick={() => {
                    const params = new URLSearchParams({
                      from_share: "1",
                      request_id: requestId!,
                    });
                    if (shareLink?.id) params.set("share_link_id", shareLink.id);
                    navigate(`/signup?${params.toString()}`);
                  }}>
                    Join Antelog — Free (5 Requests)
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Already have an account?{" "}
                    <button onClick={() => navigate("/login")} className="underline text-primary">
                      Log in
                    </button>
                  </p>
                </div>
              </CardContent>
            </Card>

            {!myShareLink ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Share2 className="h-4 w-4" />
                    Know someone who might help?
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Share this request with up to 5 people in your network.
                  </p>
                  <Button variant="outline" className="w-full" onClick={generateMyShareLink}>
                    Generate My Share Link
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Your Share Link</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Share with up to 5 people. Each can share with 5 more.
                  </p>
                  <div className="flex gap-2">
                    <Input value={myShareLink} readOnly className="text-xs" />
                    <Button variant="outline" size="sm" onClick={copyShareLink}>
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">0/5 people have used this link</p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Your Name *</label>
                  <Input
                    value={contributorName}
                    onChange={(e) => setContributorName(e.target.value)}
                    placeholder="e.g., John Doe"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Contact (Optional)</label>
                  <Input
                    value={contributorContact}
                    onChange={(e) => setContributorContact(e.target.value)}
                    placeholder="Phone or email"
                  />
                  <p className="text-xs text-muted-foreground">We'll notify you when the request is closed</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your Recommendations (Up to 5)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {recommendations.map((rec, idx) => (
                  <div key={idx} className="space-y-2 p-3 rounded-md border border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Recommendation {idx + 1}</span>
                      {recommendations.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveRecommendation(idx)}
                          className="text-destructive h-auto py-1 px-2 text-xs"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <Input
                      value={rec.text}
                      onChange={(e) => updateRecommendation(idx, "text", e.target.value)}
                      placeholder="What do you recommend?"
                      required={idx === 0}
                    />
                    <Textarea
                      value={rec.reason}
                      onChange={(e) => updateRecommendation(idx, "reason", e.target.value)}
                      placeholder="Why? (optional)"
                      rows={2}
                    />
                    <Input
                      value={rec.link}
                      onChange={(e) => updateRecommendation(idx, "link", e.target.value)}
                      placeholder="Link (optional)"
                      type="url"
                    />
                  </div>
                ))}

                {recommendations.length < 5 && (
                  <Button type="button" variant="outline" onClick={handleAddRecommendation} className="w-full">
                    + Add Another
                  </Button>
                )}
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting || isAtCapacity}>
              {isSubmitting ? "Submitting..." : "Submit Recommendations"}
            </Button>

            {isAtCapacity && (
              <p className="text-sm text-destructive text-center">
                This link is full. Please ask for a new link.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
