import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, Check, AlertTriangle, ChevronDown, ChevronUp, Sparkles, Link as LinkIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export type LeaderboardSource = "network" | "guest";

export interface LeaderboardEntry {
  key: string; // stable unique key
  recommendationId: string; // for network: rec id; for guest: stable rec id from JSONB
  source: LeaderboardSource;
  text: string;
  link: string | null;
  voteCount: number;
  userVoted: boolean;
  // For guest entries we need contribution context to update JSONB
  guestContributionId?: string;
  guestRecIndex?: number;
  // For network entries
  responderId?: string;
}

interface SimilarPair {
  rec1_text: string;
  rec2_text: string;
  rec1_source: string;
  rec2_source: string;
  similarity_score: number;
}

interface MergeCandidate {
  pair: SimilarPair;
  entry1: LeaderboardEntry | null;
  entry2: LeaderboardEntry | null;
}

interface LiveLeaderboardProps {
  requestId: string;
  isCreator: boolean;
  currentUserId: string | null;
  entries: LeaderboardEntry[];
  onVoteNetwork: (recommendationId: string, currentlyVoted: boolean) => Promise<void> | void;
  onVoteGuest: (
    contributionId: string,
    recId: string,
    recIndex: number,
    currentlyVoted: boolean
  ) => Promise<void> | void;
  onAfterMerge?: () => void | Promise<void>;
}

export function LiveLeaderboard({
  requestId,
  isCreator,
  currentUserId,
  entries,
  onVoteNetwork,
  onVoteGuest,
  onAfterMerge,
}: LiveLeaderboardProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [similarPairs, setSimilarPairs] = useState<SimilarPair[]>([]);
  const [showMergePanel, setShowMergePanel] = useState(false);
  const [mergeCandidate, setMergeCandidate] = useState<MergeCandidate | null>(null);
  const [mergeChoice, setMergeChoice] = useState<"entry1" | "entry2">("entry1");
  const [isMerging, setIsMerging] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Sort entries by voteCount desc; tie-break by text for stability
  const sorted = useMemo(() => {
    return [...entries]
      .filter((e) => e.text && e.text.trim().length > 0)
      .sort((a, b) => {
        if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
        return a.text.localeCompare(b.text);
      });
  }, [entries]);

  const top = expanded ? sorted : sorted.slice(0, 10);
  const maxVotes = sorted.length > 0 ? Math.max(1, sorted[0].voteCount) : 1;

  // Fetch similar pairs when creator
  const fetchSimilar = useCallback(async () => {
    if (!isCreator) return;
    try {
      const { data, error } = await (supabase as any).rpc(
        "find_similar_recommendations_unified",
        { req_id: requestId, threshold: 0.4 }
      );
      if (error) throw error;
      setSimilarPairs((data as SimilarPair[]) || []);
    } catch (e) {
      // Silent — function may not be available in some envs
      console.warn("find_similar_recommendations_unified failed", e);
      setSimilarPairs([]);
    }
  }, [isCreator, requestId]);

  useEffect(() => {
    fetchSimilar();
  }, [fetchSimilar, entries.length]);

  const findEntryByText = (text: string): LeaderboardEntry | null => {
    const norm = text.trim().toLowerCase();
    return (
      entries.find((e) => {
        const t = e.text.trim().toLowerCase();
        return t === norm || t.includes(norm) || norm.includes(t);
      }) || null
    );
  };

  const openMergeFor = (pair: SimilarPair) => {
    const e1 = findEntryByText(pair.rec1_text);
    const e2 = findEntryByText(pair.rec2_text);
    setMergeCandidate({ pair, entry1: e1, entry2: e2 });
    setMergeChoice("entry1");
    setShowConfirm(false);
  };

  const performMerge = async () => {
    if (!mergeCandidate?.entry1 || !mergeCandidate?.entry2) {
      toast({
        title: "Cannot merge",
        description: "Could not find recommendations. Please refresh.",
        variant: "destructive",
      });
      return;
    }

    const chosen = mergeChoice === "entry1" ? mergeCandidate.entry1 : mergeCandidate.entry2;
    const other = mergeChoice === "entry1" ? mergeCandidate.entry2 : mergeCandidate.entry1;

    setIsMerging(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/merge-recommendations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            request_id: requestId,
            chosen_source: chosen.source,
            chosen_rec_id: chosen.recommendationId,
            chosen_contribution_id: chosen.guestContributionId ?? null,
            chosen_text: chosen.text,
            chosen_vote_count: chosen.voteCount,
            other_source: other.source,
            other_rec_id: other.recommendationId,
            other_contribution_id: other.guestContributionId ?? null,
            other_vote_count: other.voteCount,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || "Merge failed");
      }

      toast({ title: "Merged!", description: `Combined into "${chosen.text}"` });
      setMergeCandidate(null);
      setShowConfirm(false);
      if (onAfterMerge) await onAfterMerge();
      setTimeout(() => fetchSimilar(), 500);
    } catch (e: any) {
      toast({
        title: "Merge failed",
        description: e?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsMerging(false);
    }
  };

  if (sorted.length === 0) return null;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            Live Rankings
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {sorted.length} recommendation{sorted.length === 1 ? "" : "s"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Similar pairs banner — creator only */}
        {isCreator && similarPairs.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <button
              type="button"
              onClick={() => setShowMergePanel((v) => !v)}
              className="w-full flex items-center justify-between gap-2 text-sm font-medium text-amber-800 dark:text-amber-200"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Some recommendations look similar ({similarPairs.length})
              </span>
              {showMergePanel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showMergePanel && (
              <div className="mt-3 space-y-2">
                {similarPairs.map((p, idx) => {
                  const pct = Math.round((p.similarity_score || 0) * 100);
                  return (
                    <div
                      key={`${p.rec1_text}-${p.rec2_text}-${idx}`}
                      className="flex items-center justify-between gap-2 flex-wrap rounded bg-background/60 border p-2 text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">"{p.rec1_text}"</span>{" "}
                        <span className="text-xs text-muted-foreground">({p.rec1_source})</span>
                        <span className="mx-2 text-muted-foreground">↔</span>
                        <span className="font-medium">"{p.rec2_text}"</span>{" "}
                        <span className="text-xs text-muted-foreground">({p.rec2_source})</span>
                        <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">— {pct}% similar</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openMergeFor(p)}
                        className="flex items-center gap-1"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Merge votes
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <ul className="space-y-2">
          {top.map((entry, i) => {
            const rank = i + 1;
            const widthPct = Math.max(4, Math.round((entry.voteCount / maxVotes) * 100));
            const cantVote = isCreator || !currentUserId;
            return (
              <li
                key={entry.key}
                className="flex items-center gap-3 rounded-md border bg-card p-3 transition-all duration-300"
                style={{ order: i }}
              >
                <div className="flex-shrink-0 w-8 text-sm font-semibold text-muted-foreground">
                  #{rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{entry.text}</span>
                    {entry.link && (
                      <a
                        href={entry.link}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <LinkIcon className="h-3 w-3" />
                        link
                      </a>
                    )}
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4"
                    >
                      {entry.source === "network" ? "via network" : "guest"}
                    </Badge>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500 ease-out"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums w-8 text-right">
                    {entry.voteCount}
                  </span>
                  {!cantVote && (
                    entry.userVoted ? (
                      <Badge variant="secondary" className="text-xs h-7 px-2 flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Voted
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        onClick={() => {
                          if (entry.source === "network") {
                            onVoteNetwork(entry.recommendationId, false);
                          } else if (
                            entry.guestContributionId &&
                            entry.guestRecIndex !== undefined
                          ) {
                            onVoteGuest(
                              entry.guestContributionId,
                              entry.recommendationId,
                              entry.guestRecIndex,
                              false
                            );
                          }
                        }}
                      >
                        <ThumbsUp className="h-3 w-3 mr-1" />
                        +1
                      </Button>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {sorted.length > 10 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="w-full"
          >
            {expanded ? "Show top 10" : `View all ${sorted.length} recommendations`}
          </Button>
        )}
      </CardContent>

      {/* Merge dialog */}
      <Dialog
        open={!!mergeCandidate}
        onOpenChange={(o) => {
          if (!o) {
            setMergeCandidate(null);
            setShowConfirm(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge recommendations</DialogTitle>
            <DialogDescription>
              Which name should represent this combined entry? Votes from both
              will be summed.
            </DialogDescription>
          </DialogHeader>

          {mergeCandidate && (
            <div className="space-y-3">
              <RadioGroup
                value={mergeChoice}
                onValueChange={(v) => setMergeChoice(v as "entry1" | "entry2")}
              >
                <div className="flex items-start gap-3 rounded border p-3">
                  <RadioGroupItem value="entry1" id="merge-e1" className="mt-1" />
                  <Label htmlFor="merge-e1" className="flex-1 cursor-pointer">
                    <div className="font-medium">"{mergeCandidate.pair.rec1_text}"</div>
                    <div className="text-xs text-muted-foreground">
                      {mergeCandidate.pair.rec1_source} ·{" "}
                      {mergeCandidate.entry1?.voteCount ?? 0} votes
                    </div>
                  </Label>
                </div>
                <div className="flex items-start gap-3 rounded border p-3">
                  <RadioGroupItem value="entry2" id="merge-e2" className="mt-1" />
                  <Label htmlFor="merge-e2" className="flex-1 cursor-pointer">
                    <div className="font-medium">"{mergeCandidate.pair.rec2_text}"</div>
                    <div className="text-xs text-muted-foreground">
                      {mergeCandidate.pair.rec2_source} ·{" "}
                      {mergeCandidate.entry2?.voteCount ?? 0} votes
                    </div>
                  </Label>
                </div>
              </RadioGroup>

              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                This cannot be undone.
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setMergeCandidate(null);
                setShowConfirm(false);
              }}
              disabled={isMerging}
            >
              Cancel
            </Button>
            {!showConfirm ? (
              <Button onClick={() => setShowConfirm(true)}>Continue</Button>
            ) : (
              <Button
                onClick={performMerge}
                disabled={isMerging}
                variant="default"
              >
                {isMerging ? "Merging..." : "Confirm merge"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}