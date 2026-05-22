import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, ChevronDown, ChevronUp, Plus, ThumbsUp, Check, Users, Vote, ShieldCheck, Loader2,
} from "lucide-react";

interface DirectoryList {
  id: string;
  title: string;
  category: string;
  original_contributor_id: string;
  contributor_count: number;
  total_votes: number;
  created_at: string;
}

interface DirectoryItem {
  id: string;
  list_id: string;
  item_name: string;
  vote_count: number;
  added_by: string;
  created_at: string;
}

interface ContributorHandle {
  id: string;
  handle: string;
}

export default function DirectoryListDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [list, setList] = useState<DirectoryList | null>(null);
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPool, setShowPool] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [fuzzyResults, setFuzzyResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [votingItemId, setVotingItemId] = useState<string | null>(null);
  const [originalHandle, setOriginalHandle] = useState<string>("");

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    try {
      // Fetch list
      const { data: listData, error: listErr } = await supabase
        .from("master_directory_lists")
        .select("*")
        .eq("id", id)
        .single();

      if (listErr) throw listErr;
      setList(listData);

      // Fetch original contributor handle
      if (listData.original_contributor_id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("handle")
          .eq("id", listData.original_contributor_id)
          .single();
        if (profileData) setOriginalHandle(profileData.handle);
      }

      // Fetch items
      const { data: itemsData, error: itemsErr } = await supabase
        .from("master_directory_items")
        .select("*")
        .eq("list_id", id)
        .order("vote_count", { ascending: false });

      if (itemsErr) throw itemsErr;
      setItems(itemsData || []);

      // Fetch current user info
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_type")
          .eq("id", user.id)
          .single();
        setIsVerified(profile?.user_type === "verified");

        // Fetch user's votes for this list
        const { data: votes } = await supabase
          .from("master_directory_votes")
          .select("item_id")
          .eq("user_id", user.id);

        if (votes) {
          const itemIds = new Set(itemsData?.map((i: any) => i.id) || []);
          setUserVotes(new Set(votes.filter(v => itemIds.has(v.item_id)).map(v => v.item_id)));
        }
      }
    } catch (err: any) {
      toast({ title: "Failed to load list", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time subscription for item vote changes
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`directory-items-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "master_directory_items", filter: `list_id=eq.${id}` },
        (payload) => {
          setItems((prev) =>
            prev.map((item) =>
              item.id === payload.new.id ? { ...item, vote_count: payload.new.vote_count } : item
            ).sort((a, b) => b.vote_count - a.vote_count)
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "master_directory_items", filter: `list_id=eq.${id}` },
        (payload) => {
          setItems((prev) => [...prev, payload.new as DirectoryItem].sort((a, b) => b.vote_count - a.vote_count));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const handleToggleVote = async (itemId: string) => {
    if (!userId || !isVerified) return;
    setVotingItemId(itemId);

    const hasVoted = userVotes.has(itemId);

    try {
      if (hasVoted) {
        // Unvote: delete the vote row
        const { error } = await supabase
          .from("master_directory_votes")
          .delete()
          .eq("item_id", itemId)
          .eq("user_id", userId);

        if (error) throw error;

        setUserVotes((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
        // Optimistic decrement
        setItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, vote_count: Math.max(0, i.vote_count - 1) } : i))
            .sort((a, b) => b.vote_count - a.vote_count)
        );
        toast({ title: "Vote removed" });
      } else {
        // Vote: insert new row
        const { error } = await supabase
          .from("master_directory_votes")
          .insert({ item_id: itemId, user_id: userId });

        if (error) {
          if (error.code === "23505") {
            toast({ title: "You've already voted for this" });
          } else {
            throw error;
          }
          return;
        }

        setUserVotes((prev) => new Set([...prev, itemId]));
        // Optimistic update
        setItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, vote_count: i.vote_count + 1 } : i))
            .sort((a, b) => b.vote_count - a.vote_count)
        );
        toast({ title: "Vote recorded!" });
      }
    } catch (err: any) {
      toast({ title: "Vote failed", description: err.message, variant: "destructive" });
    } finally {
      setVotingItemId(null);
    }
  };

  // Fuzzy search as user types
  useEffect(() => {
    if (newItemName.length < 2 || !id) {
      setFuzzyResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase.rpc("search_directory_pool_items", {
          p_list_id: id,
          p_query: newItemName,
          p_threshold: 0.3,
        });
        if (!error && data) setFuzzyResults(data);
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [newItemName, id]);

  const handleAddItem = async () => {
    if (!newItemName.trim() || !id || !userId) return;
    setAdding(true);

    try {
      const normalized = newItemName.trim().toLowerCase().replace(/\s+/g, " ");

      // Insert item
      const { data: newItem, error: insertErr } = await supabase
        .from("master_directory_items")
        .insert({
          list_id: id,
          item_name: newItemName.trim(),
          item_name_normalized: normalized,
          added_by: userId,
        })
        .select()
        .single();

      if (insertErr) {
        if (insertErr.code === "23505") {
          toast({ title: "This item already exists", description: "Search above to find and vote on it", variant: "destructive" });
        } else {
          throw insertErr;
        }
        return;
      }

      // Auto-vote for the item
      await supabase
        .from("master_directory_votes")
        .insert({ item_id: newItem.id, user_id: userId });

      setUserVotes((prev) => new Set([...prev, newItem.id]));
      setItems((prev) => [...prev, { ...newItem, vote_count: 1 }].sort((a, b) => b.vote_count - a.vote_count));
      setNewItemName("");
      setFuzzyResults([]);
      setShowAddForm(false);
      toast({ title: "Item added to pool!", description: "Your vote has been auto-cast" });
    } catch (err: any) {
      toast({ title: "Failed to add item", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">List not found</p>
      </div>
    );
  }

  const top10 = items.slice(0, 10);
  const pool = items.slice(10);

  const renderItem = (item: DirectoryItem, rank?: number) => {
    const hasVoted = userVotes.has(item.id);
    const isOwnItem = item.added_by === userId;

    return (
      <div key={item.id} className="flex items-center justify-between py-3 px-4 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 min-w-0">
          {rank !== undefined && (
            <span className="text-lg font-bold text-muted-foreground w-8 shrink-0">
              #{rank}
            </span>
          )}
          
          <span className="font-medium truncate">{item.item_name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-xs">
            {item.vote_count} {item.vote_count === 1 ? "vote" : "votes"}
          </Badge>
          {isVerified && !isOwnItem && (
            <Button
              variant={hasVoted ? "default" : "outline"}
              size="sm"
              onClick={() => handleToggleVote(item.id)}
              disabled={votingItemId === item.id}
            >
              {votingItemId === item.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : hasVoted ? (
                <>
                  <Check className="h-3 w-3" />
                  Voted
                </>
              ) : (
                <>
                  <ThumbsUp className="h-3 w-3" />
                  +1
                </>
              )}
            </Button>
          )}
          {!isVerified && hasVoted && (
            <Badge variant="default" className="text-xs flex items-center gap-1">
              <Check className="h-3 w-3" /> Voted
            </Badge>
          )}
          {isOwnItem && (
            <Badge variant="outline" className="text-xs">Added by you</Badge>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <Helmet>
        <title>{list.title} | Antelog Directory</title>
        <meta name="description" content={`Community-curated list: ${list.title}. ${list.total_votes} votes from ${list.contributor_count} contributors.`} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          {/* Back */}
          <Button variant="ghost" className="mb-4" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Directory
          </Button>

          {/* Header */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl mb-2">{list.title}</CardTitle>
                  <Badge variant="outline" className="capitalize mb-3">{list.category}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  Original contribution by @{originalHandle}
                </span>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4" />
                  {list.contributor_count} verified {list.contributor_count === 1 ? "user has" : "users have"} contributed
                </span>
                <span className="flex items-center gap-1">
                  <Vote className="h-4 w-4" />
                  {list.total_votes} total votes
                </span>
              </div>
            </CardHeader>
          </Card>

          {/* Verified-only banner for guests */}
          {!isVerified && userId && (
            <Card className="mb-6 border-primary/20 bg-primary/5">
              <CardContent className="p-4 flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                <p className="text-sm">Verify your account to vote and contribute to this list.</p>
                <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => navigate("/signup")}>
                  Get Verified
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Top 10 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">
                Top {Math.min(10, items.length)}
              </CardTitle>
              <p className="text-xs text-muted-foreground">Ranked by votes, updates live</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {top10.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No items yet. Be the first to contribute!</p>
              ) : (
                top10.map((item, idx) => renderItem(item, idx + 1))
              )}
            </CardContent>
          </Card>

          {/* Action buttons for verified users */}
          {isVerified && (
            <div className="flex gap-3 mb-6 flex-wrap">
              {pool.length > 0 && (
                <Button variant="outline" onClick={() => setShowPool(!showPool)}>
                  {showPool ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
                  {showPool ? "Hide Full Pool" : `View Full Pool (${pool.length})`}
                </Button>
              )}
              <Button variant="default" onClick={() => setShowAddForm(!showAddForm)}>
                <Plus className="h-4 w-4 mr-2" />
                {showAddForm ? "Cancel" : "Add a Recommendation"}
              </Button>
            </div>
          )}

          {/* Add Recommendation Form (inline) */}
          {showAddForm && isVerified && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Add a Recommendation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Enter product/item name..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                />

                {/* Fuzzy match results */}
                {searching && <p className="text-xs text-muted-foreground">Searching for similar items...</p>}
                {fuzzyResults.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Similar items already in pool:</p>
                    {fuzzyResults.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between py-2 px-3 rounded border border-border bg-muted/50">
                        <div className="min-w-0">
                          <span className="font-medium text-sm">{r.item_name}</span>
                          <span className="text-xs text-muted-foreground ml-2">— {r.vote_count} votes</span>
                        </div>
                        {isVerified && (
                          <Button
                            variant={userVotes.has(r.id) ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleToggleVote(r.id)}
                            disabled={votingItemId === r.id}
                          >
                            {votingItemId === r.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : userVotes.has(r.id) ? (
                              <>
                                <Check className="h-3 w-3" /> Voted
                              </>
                            ) : (
                              <>
                                <ThumbsUp className="h-3 w-3" /> +1
                              </>
                            )}
                          </Button>
                        )}
                        {!isVerified && userVotes.has(r.id) && (
                          <Badge variant="default" className="text-xs">Voted ✓</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {newItemName.trim().length >= 2 && fuzzyResults.length === 0 && !searching && (
                  <p className="text-xs text-muted-foreground">No similar items found. You can add this as a new entry.</p>
                )}

                <Button
                  onClick={handleAddItem}
                  disabled={!newItemName.trim() || adding}
                  className="w-full"
                >
                  {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Add to Pool
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Full Pool */}
          {showPool && pool.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Full Pool</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Items ranked below Top 10. Items here can climb into the Top 10 as they get more votes.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {pool.map((item) => renderItem(item))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
