import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import { format } from "date-fns";
import {
  MessageCircle,
  CornerUpRight,
  MapPin,
  ShoppingBag,
  Briefcase,
  Tag,
  Clock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Link2,
  CircleSlash,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ChainLink = {
  id: string;
  parent_link_id: string | null;
  generated_by_user_id: string | null;
  generated_by_name: string | null;
  user_full_name?: string | null;
};

const categoryIcon = (cat?: string | null) => {
  const c = (cat || "").toLowerCase();
  if (c.includes("place") || c.includes("location") || c.includes("travel")) return MapPin;
  if (c.includes("product") || c.includes("shop")) return ShoppingBag;
  if (c.includes("service")) return Briefcase;
  return Tag;
};

const initialOf = (name?: string | null) =>
  (name || "?").trim().charAt(0).toUpperCase() || "?";

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
  const [mode, setMode] = useState<"rec" | "pass">("rec");
  const recActive = mode === "rec";
  const passActive = mode === "pass";
  const [passOnly, setPassOnly] = useState(false);
  const [chain, setChain] = useState<ChainLink[]>([]);
  const [chainExpanded, setChainExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Walk parent_link_id chain backwards; returns ordered list:
  // [originalRequesterLink, ..., currentLink]
  const reconstructFullChain = async (linkId: string): Promise<ChainLink[]> => {
    const out: ChainLink[] = [];
    let currentId: string | null = linkId;
    let depth = 0;

    while (currentId && depth < 10) {
      const { data, error } = await supabase
        .from("share_links")
        .select("id, parent_link_id, generated_by_user_id, generated_by_name")
        .eq("id", currentId)
        .single();
      if (error || !data) break;
      out.unshift(data as ChainLink);
      currentId = data.parent_link_id;
      depth++;
    }

    // Resolve any user full names
    const userIds = out.map((l) => l.generated_by_user_id).filter(Boolean) as string[];
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      const map = new Map((profs || []).map((p: any) => [p.id, p.full_name]));
      out.forEach((l) => {
        if (l.generated_by_user_id) l.user_full_name = map.get(l.generated_by_user_id) || null;
      });
    }
    return out;
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
        .select("id, title, category, location, created_at, creator_id, expires_at, status")
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
      const fullChain = await reconstructFullChain(linkData.id);
      setChain(fullChain);
      setShareLink(linkData);

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

    if (!recActive && !passActive) {
      toast({
        title: "Pick an action",
        description: "Choose to share a recommendation or pass it along.",
        variant: "destructive",
      });
      return;
    }

    const validRecs = recommendations.filter((r) => r.text.trim());

    if (recActive && validRecs.length === 0) {
      toast({
        title: "Recommendations Required",
        description: "Please add at least one recommendation",
        variant: "destructive",
      });
      return;
    }

    // Pass-along only path: insert empty contribution row, land on Page 2
    if (!recActive && passActive) {
      setIsSubmitting(true);
      try {
        const { error: contributionError } = await supabase
          .from("guest_contributions")
          .insert({
            request_id: requestId!,
            share_link_id: shareLink?.id,
            contributor_name: contributorName.trim(),
            contributor_contact: contributorContact.trim() || null,
            recommendations: [],
          });
        if (contributionError) throw contributionError;
        await generateMyShareLink(contributorName);
        setPassOnly(true);
        setHasSubmitted(true);
    } catch (error: any) {
        console.error("Error submitting pass-only:", error);
      const msg = String(error?.message || "");
      if (/request is closed|request has expired/i.test(msg)) {
        toast({
          title: "This request was just closed.",
          description: "Your response wasn't saved.",
          variant: "destructive",
        });
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
        toast({
          title: "Submission Failed",
          description: "Please try again",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
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
    } catch (error: any) {
      console.error("Error submitting:", error);
      const msg = String(error?.message || "");
      if (/request is closed|request has expired/i.test(msg)) {
        toast({
          title: "This request was just closed.",
          description: "Your response wasn't saved.",
          variant: "destructive",
        });
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
      toast({
        title: "Submission Failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateMyShareLink = async (nameOverride?: string) => {
    const nameToUse = (nameOverride ?? contributorName).trim();
    if (!nameToUse) {
      toast({
        title: "Name Required",
        description: "Please enter your name to generate a share link",
        variant: "destructive",
      });
      return;
    }
    try {
      const { data: tokenData, error: tokenError } = await supabase.rpc("generate_share_token");

      if (tokenError) throw tokenError;

      const { error: linkError } = await supabase
        .from("share_links")
        .insert({
          request_id: requestId!,
          parent_link_id: shareLink?.id, // critical: chain new link off the current one
          token: tokenData,
          generated_by_name: nameToUse,
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
    if (!myShareLink) return;
    navigator.clipboard.writeText(myShareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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

  const isExpired = !!request.expires_at && new Date(request.expires_at) < new Date();
  const isClosed = request.status !== "open" || isExpired;
  const closedCopy = (() => {
    if (request.status === "closed") {
      return "The creator has closed this request. No new responses are being accepted.";
    }
    if (request.status === "reviewing" || request.status === "responded") {
      return "The creator is reviewing the responses. New responses are not being accepted right now.";
    }
    if (isExpired && request.expires_at) {
      return `This request expired on ${format(new Date(request.expires_at), "MMM d, yyyy")}. No new responses are being accepted.`;
    }
    return "No new responses are being accepted.";
  })();

  // Chain-derived display: first link is original requester's. If chain has
  // more than one entry, the request was forwarded.
  const isForwarded = chain.length > 1;
  const lastForwarder = isForwarded ? chain[chain.length - 1] : null;
  const lastForwarderName =
    lastForwarder?.user_full_name || lastForwarder?.generated_by_name || "A friend";

  // People in the chain (named rows): use requester as first, then any
  // intermediate forwarders. The very first share_link is created by the
  // requester (no generated_by_name needed there).
  const chainPeople: { name: string; role: string }[] = chain.length
    ? [
        { name: requesterName, role: "Asked the question" },
        ...chain.slice(1).map((l, i, arr) => ({
          name: l.user_full_name || l.generated_by_name || "A friend",
          role: i === arr.length - 1 ? "Passed it to you" : "Passed it on",
        })),
      ]
    : [];

  const CatIcon = categoryIcon(request.category);

  const renderPreview = (
    label: string,
    items = preview.items,
    total = preview.total,
    linkable = false,
  ) => {
    if (total === 0 || items.length === 0) return null;
    const showCountLine = total > 2;
    return (
      <section
        className="rounded-[10px] p-4 bg-muted/50"
      >
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
          {label}
        </p>
        <div className="space-y-2">
          {items.slice(0, 2).map((it, i) => (
            <p key={i} className="text-base font-medium text-foreground">
              {it.recommendation_text}
            </p>
          ))}
          {showCountLine && linkable ? (
            <a
              href={`/signup?request_id=${encodeURIComponent(requestId!)}`}
              className="block text-sm text-foreground underline py-1.5 cursor-pointer"
            >
              + {total - 2} more — join to see
            </a>
          ) : showCountLine ? (
            <p className="text-sm text-muted-foreground">
              + {total - 2} more
            </p>
          ) : null}
        </div>
      </section>
    );
  };

  const closesNode = (() => {
    if (!request.expires_at) return null;
    const expiresDate = new Date(request.expires_at);
    const isOpen = request.status === "open";

    if (!isOpen) {
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <CheckCircle2 className="h-3 w-3" /> Closed {format(expiresDate, "MMM d, yyyy")}
        </span>
      );
    }
    if (isExpired) {
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          Expired {format(expiresDate, "MMM d, yyyy")}
        </span>
      );
    }
    if (daysLeft !== null && daysLeft <= 0) {
      return (
        <span
          className="inline-flex items-center gap-1"
          style={{ color: 'hsl(var(--attention-fg))' }}
        >
          <Clock className="h-3 w-3" /> Closes today
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1">
        Closes in {daysLeft} day{daysLeft === 1 ? "" : "s"}
      </span>
    );
  })();

  const FooterBand = () => (
    <div
      className="mt-10 -mx-4 px-5 py-4 text-center text-xs italic text-muted-foreground border-t border-border/60"
      style={{ lineHeight: 1.55 }}
    >
      The best recommendations come from real people you trust — not algorithms or ads.
    </div>
  );

  const ChainCard = () =>
    !isForwarded ? null : (
      <div>
        <button
          type="button"
          onClick={() => setChainExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-sm text-foreground underline-offset-2 hover:underline"
        >
          {chainExpanded ? "Hide full path" : "See full path"}
          {chainExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        {chainExpanded && (
          <div
            className="mt-3 rounded-[10px] p-[14px] bg-muted/50"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
              How this reached you
            </p>
            <div className="space-y-2">
              {chainPeople.map((p, i) => (
                <div key={i}>
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-medium bg-muted text-muted-foreground shrink-0">
                      {initialOf(p.name)}
                    </div>
                    <div className="leading-tight">
                      <div className="text-sm font-medium text-foreground">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">{p.role}</div>
                    </div>
                  </div>
                  <div className="ml-3 my-1 h-2.5 w-px bg-border" />
                </div>
              ))}
              {/* viewer row */}
              <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-medium bg-foreground text-background shrink-0">
                  {initialOf(contributorName || "You")}
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-medium text-foreground">You</div>
                  <div className="text-[11px] text-muted-foreground">
                    You're in {requesterName}'s extended network
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const ogImageUrl = typeof window !== "undefined" ? `${window.location.origin}/og-image.png` : "";

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{request.title}</title>
        <meta property="og:title" content={request.title} />
        <meta property="og:description" content={`${requesterName} is asking their network. Share what you know — no signup needed.`} />
        <meta property="og:site_name" content="Antelog" />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:url" content={shareUrl} />
        <meta name="twitter:card" content="summary" />
      </Helmet>
      <div className="max-w-[640px] mx-auto px-4 py-8 sm:py-12 space-y-7 sm:space-y-10">
        {/* Header block */}
        <header className="space-y-3">
          {request.category && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-medium bg-muted text-muted-foreground"
            >
              <CatIcon className="h-3 w-3" />
              <span className="capitalize">{request.category}</span>
            </span>
          )}
          <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
            {request.title}
          </h1>
          {!hasSubmitted && (
            <div className="space-y-1">
              <p className="text-base text-foreground">
                {requesterName} asked the people they trust.
              </p>
              {isForwarded && (
                <p className="text-base text-foreground">
                  {lastForwarderName} thought you'd know.
                </p>
              )}
            </div>
          )}
        </header>

        {hasSubmitted ? (
          <div className="space-y-7 sm:space-y-10">
            {passOnly ? (
              <>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-foreground">
                    Your forward link is ready, {contributorName.split(" ")[0]}.
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    When they open it, it'll say "{contributorName.split(" ")[0]} thought of you."
                  </p>
                </div>
                {myShareLink && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Input value={myShareLink} readOnly className="text-xs" />
                      <Button variant="outline" size="sm" type="button" onClick={copyShareLink}>
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <Button
                      className="w-full"
                      size="lg"
                      type="button"
                      onClick={() =>
                        window.open(
                          `https://wa.me/?text=${encodeURIComponent(myShareLink)}`,
                          "_blank"
                        )
                      }
                    >
                      Share on WhatsApp →
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-foreground">
                    Thanks {contributorName.split(" ")[0]}. {requesterName.split(" ")[0]}'s got your pick.
                  </h2>
                </div>

                <section className="rounded-[10px] p-4 bg-muted/50 space-y-3">
                  <h3 className="text-base font-semibold text-foreground">
                    Know someone better placed? Pass this along too.
                  </h3>
                  {!myShareLink ? (
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => generateMyShareLink(contributorName)}
                    >
                      Forward to someone →
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input value={myShareLink} readOnly className="text-xs" />
                        <Button variant="outline" size="sm" type="button" onClick={copyShareLink}>
                          {copied ? "Copied" : "Copy"}
                        </Button>
                      </div>
                      <Button
                        className="w-full"
                        type="button"
                        onClick={() =>
                          window.open(
                            `https://wa.me/?text=${encodeURIComponent(myShareLink)}`,
                            "_blank"
                          )
                        }
                      >
                        Share on WhatsApp →
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        When they open it, it'll say "{contributorName.split(" ")[0]} thought of you."
                      </p>
                    </div>
                  )}
                </section>

                <button
                  type="button"
                  onClick={() =>
                    navigate(`/signup?request_id=${encodeURIComponent(requestId!)}`)
                  }
                  className="text-sm text-foreground underline"
                >
                  Join Antelog →
                </button>
              </>
            )}

            <FooterBand />
          </div>
        ) : isClosed ? (
          <div className="space-y-5">
            <div className="rounded-[10px] p-4 bg-muted/50">
              <div className="flex items-start gap-3 rounded-[10px] px-[14px] py-3 bg-muted text-foreground">
                <CircleSlash className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
                <div>
                  <div className="text-sm font-medium">This request is closed.</div>
                  <div className="text-[13px] opacity-85 mt-0.5">{closedCopy}</div>
                </div>
              </div>
              <Button
                className="w-full mt-4"
                size="lg"
                onClick={() => navigate("/directory")}
              >
                Browse the Master Directory
              </Button>
              <p className="text-center text-xs text-muted-foreground mt-2.5">
                See community-ranked lists from verified people on Antelog.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-7 sm:space-y-10">
            {/* Action toggle — mutually exclusive */}
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {[
                  { value: "rec" as const, Icon: MessageCircle, title: "Share a recommendation" },
                  { value: "pass" as const, Icon: CornerUpRight, title: "Pass it along" },
                ].map(({ value, Icon, title }) => {
                  const active = mode === value;
                  return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    aria-pressed={active}
                    className={cn(
                      "text-left rounded-lg px-2.5 py-2.5 sm:px-4 sm:py-4 transition-colors flex items-start gap-2 sm:gap-3",
                      active
                        ? "bg-secondary border-foreground/60"
                        : "bg-transparent border-border hover:bg-muted/40"
                    )}
                    style={{ borderWidth: active ? 1.5 : 0.5, borderStyle: "solid" }}
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-5 sm:w-5 mt-0.5 text-foreground shrink-0" />
                    <div className="text-[13px] sm:text-sm font-medium text-foreground leading-tight">{title}</div>
                  </button>
                  );
                })}
              </div>
            </section>

            {/* Recommendation composer */}
            {recActive ? (
              <section className="space-y-5">
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
                      placeholder="What do you recommend? *"
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
            ) : null}

            {/* Identity */}
            <section className="space-y-4 pt-6 border-t border-border">
              <h2 className="text-lg font-semibold text-foreground">Who's sharing this?</h2>
              <div className="space-y-2">
                <label className="text-sm text-foreground">Your name *</label>
                <Input
                  value={contributorName}
                  onChange={(e) => setContributorName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>
            </section>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isSubmitting || (recActive && isAtCapacity)}
            >
              {isSubmitting
                ? "Submitting..."
                : passActive
                ? "Generate my forward link"
                : "Share recommendations"}
            </Button>

            {isAtCapacity && (
              <p className="text-sm text-destructive text-center">
                This link is full. Please ask for a new link.
              </p>
            )}
          </form>
        )}
        {!hasSubmitted && <FooterBand />}
      </div>
    </div>
  );
}
