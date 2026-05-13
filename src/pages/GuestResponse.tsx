import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";

export default function GuestResponse() {
  const { requestId, token } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [request, setRequest] = useState<any>(null);
  const [shareLink, setShareLink] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [preview, setPreview] = useState<{ items: { recommendation_text: string; reason: string | null }[]; total: number }>({ items: [], total: 0 });

  const [contributorName, setContributorName] = useState("");
  const [contributorContact, setContributorContact] = useState("");
  const [recommendations, setRecommendations] = useState([
    { text: "", reason: "", link: "", position: 1 },
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
        .select("id, title, category, location, created_at, creator_id, expires_at")
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

      // Fetch preview recommendations
      const { data: previewData } = await supabase.rpc("get_guest_page_preview" as any, {
        p_request_id: requestId!,
      });
      if (previewData && Array.isArray(previewData)) {
        const items = previewData.slice(0, 2).map((r: any) => ({
          recommendation_text: r.recommendation_text,
          reason: r.reason,
        }));
        const total = previewData.length > 0 ? Number(previewData[0].total_count ?? 0) : 0;
        setPreview({ items, total });
      }

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
        <div className="max-w-md w-full text-center space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Request Not Found</h2>
          <p className="text-muted-foreground">This link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  const isAtCapacity = (shareLink.current_responses ?? 0) >= (shareLink.max_responses ?? 5);
  const daysLeft = request.expires_at
    ? Math.max(0, differenceInDays(new Date(request.expires_at), new Date()))
    : null;
  const requesterName = request.creator_profile?.full_name || "Someone";
  const renderPreview = () =>
    preview.items.length > 0 ? (
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Some recommendations already shared
        </h2>
        <div className="space-y-3">
          {preview.items.map((it, i) => (
            <div key={i} className="space-y-1">
              <p className="font-semibold text-foreground">{it.recommendation_text}</p>
              {it.reason && <p className="text-sm text-muted-foreground">{it.reason}</p>}
            </div>
          ))}
          {preview.total > preview.items.length && (
            <p className="text-sm text-muted-foreground">
              + {preview.total - preview.items.length} more recommendation{preview.total - preview.items.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </section>
    ) : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-10">
        {/* Header block */}
        <header className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
            {request.title}
          </h1>
          <div className="space-y-1">
            <p className="text-base text-foreground">
              {requesterName} asked people they trust for recommendations.
            </p>
            <p className="text-base text-muted-foreground">You were invited to contribute.</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {preview.total} recommendation{preview.total === 1 ? "" : "s"} so far
            {daysLeft !== null && <> · Closes in {daysLeft} day{daysLeft === 1 ? "" : "s"}</>}
            {request.category && <> · {request.category}</>}
          </p>
        </header>

        {hasSubmitted ? (
          <div className="space-y-10">
            {/* Confirmation */}
            <section className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">Thanks {contributorName}.</h2>
              <p className="text-muted-foreground">Your recommendations were added.</p>
            </section>

            {/* Recommendation tease */}
            {preview.items.length > 0 && (
              <section className="space-y-3">
                <div className="space-y-3">
                  {preview.items.map((it, i) => (
                    <div key={i} className="space-y-1">
                      <p className="font-semibold text-foreground">{it.recommendation_text}</p>
                      {it.reason && <p className="text-sm text-muted-foreground">{it.reason}</p>}
                    </div>
                  ))}
                  {preview.total > preview.items.length && (
                    <p className="text-sm text-muted-foreground">
                      + {preview.total - preview.items.length} more recommendation{preview.total - preview.items.length === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Join Antelog to see the full list and vote on the best suggestions.
                </p>
              </section>
            )}

            {/* Signup CTA */}
            <section className="space-y-4">
              <p className="text-foreground font-medium">Join Antelog to:</p>
              <ul className="space-y-1 text-sm text-muted-foreground list-none">
                <li>• See all recommendations for this request</li>
                <li>• Vote on the best suggestions</li>
                <li>• Ask your own network for trusted answers</li>
                <li>• Get 5 free requests when you join</li>
              </ul>
              <Button
                className="w-full"
                size="lg"
                onClick={() => navigate(`/signup?request_id=${encodeURIComponent(requestId!)}`)}
              >
                Join Antelog — Free
              </Button>
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <button onClick={() => navigate("/login")} className="underline text-foreground">
                  Log in
                </button>
              </p>
            </section>

            {/* Share loop */}
            <section className="space-y-3 pt-6 border-t border-border">
              <h2 className="text-lg font-semibold text-foreground">Know someone who might help?</h2>
              <p className="text-sm text-muted-foreground">Pass this request to someone you trust.</p>
              {!myShareLink ? (
                <Button variant="outline" onClick={generateMyShareLink}>
                  Generate Share Link
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Input value={myShareLink} readOnly className="text-xs" />
                  <Button variant="outline" size="sm" onClick={copyShareLink}>
                    Copy
                  </Button>
                </div>
              )}
            </section>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-10">
            {renderPreview()}

            {/* Composer */}
            <section className="space-y-5">
              <h2 className="text-lg font-semibold text-foreground">What do you recommend?</h2>
              {recommendations.map((rec, idx) => (
                <div key={idx} className="space-y-3">
                  {idx > 0 && (
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">
                        Recommendation {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRecommendation(idx)}
                        className="text-xs text-muted-foreground hover:text-destructive underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}
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
                <button
                  type="button"
                  onClick={handleAddRecommendation}
                  className="text-sm text-foreground underline hover:text-primary"
                >
                  + Add another recommendation
                </button>
              )}
            </section>

            {/* Identity */}
            <section className="space-y-4 pt-2 border-t border-border">
              <h2 className="text-lg font-semibold text-foreground pt-4">Who are you?</h2>
              <div className="space-y-2">
                <label className="text-sm text-foreground">Your name *</label>
                <Input
                  value={contributorName}
                  onChange={(e) => setContributorName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-foreground">Phone or email (optional)</label>
                <Input
                  value={contributorContact}
                  onChange={(e) => setContributorContact(e.target.value)}
                  placeholder="Phone or email"
                />
                <p className="text-xs text-muted-foreground">
                  We'll let you know when this request is finalized.
                </p>
              </div>
            </section>

            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting || isAtCapacity}>
              {isSubmitting ? "Submitting..." : "Share Recommendations"}
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
