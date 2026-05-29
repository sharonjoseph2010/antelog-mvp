import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle, Globe, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Database } from "@/integrations/supabase/types";

type ListCategory = Database["public"]["Enums"]["list_category"];

interface ListWithCount {
  id: string;
  title: string;
  category: ListCategory;
  visibility: string;
  created_at: string;
  itemCount: number;
  source_request_id: string | null;
}

const fetchMyLists = async (): Promise<ListWithCount[]> => {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return [];
  const userId = userRes.user.id;

  const { data: lists, error: listsError } = await supabase
    .from("lists")
    .select("id,title,category,visibility,created_at,source_request_id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (listsError) throw new Error(listsError.message);
  if (!lists || lists.length === 0) return [];

  const listIds = lists.map((l) => l.id);
  const { data: items, error: itemsError } = await supabase
    .from("list_items")
    .select("id,list_id")
    .in("list_id", listIds);

  if (itemsError) console.warn("Items fetch error", itemsError);

  const counts = new Map<string, number>();
  for (const it of items ?? []) {
    counts.set(it.list_id as string, (counts.get(it.list_id as string) ?? 0) + 1);
  }

  return (lists ?? []).map((l) => ({
    id: l.id as string,
    title: l.title as string,
    category: l.category as ListCategory,
    visibility: l.visibility as string,
    created_at: l.created_at as string,
    itemCount: counts.get(l.id as string) ?? 0,
    source_request_id: l.source_request_id as string | null,
  }));
};

const Lists = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-lists"],
    queryFn: fetchMyLists,
  });

  const [publishingListId, setPublishingListId] = useState<string | null>(null);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<{
    id: string;
    title: string;
    contributor_count: number;
    total_votes: number;
    similarity_score: number;
  } | null>(null);

  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmListId, setConfirmListId] = useState<string | null>(null);
  const [confirmCategory, setConfirmCategory] = useState<ListCategory>("other");
  const [confirmStep, setConfirmStep] = useState<1 | 2 | 3>(1);
  // Faceted publish state
  const [entityInput, setEntityInput] = useState("");
  const [resolvedEntity, setResolvedEntity] = useState<{ preferred_term: string; plural_term: string; category_group: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [displayGeography, setDisplayGeography] = useState("");
  const [useCase, setUseCase] = useState("");
  const [hardFilter, setHardFilter] = useState("");
  const [livePreview, setLivePreview] = useState("");
  const [canonicalSignature, setCanonicalSignature] = useState("");
  const [signatureMatch, setSignatureMatch] = useState<{ id: string; canonical_title: string | null; title: string } | null>(null);
  const [checkingSignature, setCheckingSignature] = useState(false);
  const [tooSpecificWarning, setTooSpecificWarning] = useState(false);

  // Resolve preferred term as user types (debounced)
  useEffect(() => {
    if (!entityInput.trim() || confirmStep !== 2) {
      setResolvedEntity(null);
      return;
    }
    const handle = setTimeout(async () => {
      setResolving(true);
      const { data } = await supabase.rpc("resolve_preferred_term", { input: entityInput.trim() });
      setResolving(false);
      if (data && Array.isArray(data) && data.length > 0) {
        setResolvedEntity(data[0] as any);
      } else {
        setResolvedEntity(null);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [entityInput, confirmStep]);

  // Live title preview
  useEffect(() => {
    if (confirmStep !== 2) return;
    const entity = resolvedEntity?.preferred_term || entityInput.trim();
    const plural = resolvedEntity?.plural_term || (entity ? `${entity}s` : "");
    if (!entity) {
      setLivePreview("");
      return;
    }
    let title = `Best ${plural}`;
    if (displayGeography.trim()) title += ` in ${displayGeography.trim()}`;
    if (useCase.trim()) title += ` for ${useCase.trim()}`;
    if (hardFilter.trim()) title += ` · ${hardFilter.trim()}`;
    setLivePreview(title);
  }, [entityInput, resolvedEntity, displayGeography, useCase, hardFilter, confirmStep]);

  if (error) {
    toast({ title: "Failed to load lists", description: (error as Error).message });
  }

  const handlePublishClick = (listId: string) => {
    const list = data?.find((l) => l.id === listId);
    if (!list) return;
    setConfirmListId(listId);
    setConfirmCategory(list.category);
    setConfirmStep(1);
    setEntityInput("");
    setResolvedEntity(null);
    setDisplayGeography("");
    setUseCase("");
    setHardFilter("");
    setLivePreview("");
    setCanonicalSignature("");
    setSignatureMatch(null);
    setTooSpecificWarning(false);
    setShowConfirmDialog(true);
  };

  const resetConfirmDialog = () => {
    setShowConfirmDialog(false);
    setConfirmListId(null);
    setConfirmStep(1);
    setEntityInput("");
    setResolvedEntity(null);
    setDisplayGeography("");
    setUseCase("");
    setHardFilter("");
    setLivePreview("");
    setCanonicalSignature("");
    setSignatureMatch(null);
    setTooSpecificWarning(false);
  };

  const handleStepNext = async () => {
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }
    if (confirmStep === 2) {
      if (!entityInput.trim()) {
        toast({ title: "Please tell us what this list is about", variant: "destructive" });
        return;
      }
      setCheckingSignature(true);
      const entity = resolvedEntity?.preferred_term || entityInput.trim();
      const { data: sigData, error: sigErr } = await supabase.rpc("build_canonical_signature", {
        p_entity_type: entity,
        p_geography: displayGeography.trim() || null,
        p_use_case: useCase.trim() || null,
        p_hard_filter: hardFilter.trim() || null,
      });
      if (sigErr) {
        setCheckingSignature(false);
        toast({ title: "Could not validate", description: sigErr.message, variant: "destructive" });
        return;
      }
      const sig = sigData as unknown as string;
      setCanonicalSignature(sig);
      const { data: match } = await supabase
        .from("master_directory_lists")
        .select("id, canonical_title, title")
        .eq("canonical_signature", sig)
        .maybeSingle();
      setCheckingSignature(false);
      setSignatureMatch(match ?? null);
      // Too-specific nudge: all 3 optional facets filled
      setTooSpecificWarning(
        !!displayGeography.trim() && !!useCase.trim() && !!hardFilter.trim()
      );
      setConfirmStep(3);
    }
  };

  const handleConfirmPublish = async () => {
    if (!confirmListId) return;
    setPublishingListId(confirmListId);

    const list = data?.find((l) => l.id === confirmListId);
    if (!list) {
      setPublishingListId(null);
      return;
    }

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      setPublishingListId(null);
      return;
    }

    try {
      const entity = resolvedEntity?.preferred_term || entityInput.trim();
      const plural = resolvedEntity?.plural_term || `${entity}s`;
      const categoryGroup = resolvedEntity?.category_group || null;
      const { data: titleData, error: titleErr } = await supabase.rpc("build_canonical_title", {
        p_entity_type: entity,
        p_plural_term: plural,
        p_geography: displayGeography.trim() || null,
        p_use_case: useCase.trim() || null,
        p_hard_filter: hardFilter.trim() || null,
      });
      if (titleErr) throw titleErr;
      const canonicalTitle = (titleData as unknown as string) || livePreview;
      const normalizedTitle = canonicalTitle.trim().toLowerCase().replace(/\s+/g, " ");
      const normalizedGeo = displayGeography.trim()
        ? displayGeography.trim().toLowerCase().replace(/\s+/g, "_")
        : null;

      const { data: newDirList, error: createErr } = await supabase
        .from("master_directory_lists")
        .insert({
          title: canonicalTitle,
          title_normalized: normalizedTitle,
          source_title: list.title,
          canonical_title: canonicalTitle,
          category: confirmCategory,
          category_group: categoryGroup,
          entity_type: entity,
          display_geography: displayGeography.trim() || null,
          normalized_geography: normalizedGeo,
          geography: displayGeography.trim() || null,
          use_case: useCase.trim() || null,
          hard_filter: hardFilter.trim() || null,
          canonical_signature: canonicalSignature,
          canonical_query: canonicalTitle,
          temporal_scope: "current",
          ranking_lens: "best_overall",
          status: "live",
          original_contributor_id: userRes.user.id,
        })
        .select()
        .single();

      if (createErr) throw createErr;

      // Get items from user's list
      const { data: listItems } = await supabase
        .from("list_items")
        .select("content")
        .eq("list_id", confirmListId)
        .order("position");

      if (listItems && listItems.length > 0) {
        for (const item of listItems) {
          const itemNorm = item.content.trim().toLowerCase().replace(/\s+/g, " ");
          const { data: inserted, error: itemErr } = await supabase
            .from("master_directory_items")
            .insert({
              list_id: newDirList.id,
              item_name: item.content,
              item_name_normalized: itemNorm,
              added_by: userRes.user.id,
            })
            .select()
            .single();

          if (!itemErr && inserted) {
            // Auto-vote
            await supabase
              .from("master_directory_votes")
              .insert({ item_id: inserted.id, user_id: userRes.user.id });
          }
        }
      }

      // Mark the user's list as public and link to directory entry
      await supabase.from("lists").update({ 
        visibility: "public" as const,
        directory_list_id: newDirList.id,
      } as any).eq("id", confirmListId);

      toast({
        title: "Published!",
        description: "Your list is now live in the Master Directory!",
      });
      queryClient.invalidateQueries({ queryKey: ["my-lists"] });
      resetConfirmDialog();
    } catch (err: any) {
      toast({ title: "Publish failed", description: err.message, variant: "destructive" });
    } finally {
      setPublishingListId(null);
    }
  };

  const handleViewExisting = () => {
    if (duplicateMatch) {
      window.location.href = `/directory/${duplicateMatch.id}`;
    }
    setShowMergeDialog(false);
    setPublishingListId(null);
    setDuplicateMatch(null);
  };

  return (
    <>
      <Helmet>
        <title>My Lists | Antelog</title>
        <meta name="description" content="View and manage your Antelog lists." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background px-4 py-10">
        <section className="mx-auto max-w-5xl space-y-6">
          <header className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">My Lists</h1>
            <Button asChild>
              <Link to="/lists/new">Create New List</Link>
            </Button>
          </header>

          {isLoading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : (data?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-md border border-input p-10 text-center">
              <p className="mb-2 font-medium">No lists yet</p>
              <p className="mb-4 text-sm text-muted-foreground">
                Create a new list or close a request to save recommendations here
              </p>
              <Button asChild>
                <Link to="/lists/new">Create Your First List</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data!.map((list) => (
                <Card key={list.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {list.title}
                      {list.source_request_id && (
                        <Badge variant="secondary" className="text-xs font-normal flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          From Request
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{list.category}</Badge>
                      <Badge variant="outline">{list.visibility}</Badge>
                    </div>
                    <div className="text-muted-foreground">{list.itemCount} items</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button asChild variant="link" className="p-0">
                        <Link to={`/lists/${list.id}`}>View details</Link>
                      </Button>

                      {list.visibility === "private" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePublishClick(list.id)}
                          disabled={publishingListId === list.id}
                        >
                          {publishingListId === list.id ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Publishing…
                            </>
                          ) : (
                            <>
                              <Globe className="h-3 w-3" />
                              Publish to Directory
                            </>
                          )}
                        </Button>
                      )}

                      {list.visibility === "public" && (
                        <Badge variant="default" className="text-xs flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          In Directory
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Confirm Publish Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={(open) => {
        if (!open) resetConfirmDialog();
        else setShowConfirmDialog(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish to Directory</DialogTitle>
            <DialogDescription>
              Step {confirmStep} of 3
            </DialogDescription>
          </DialogHeader>

          {confirmStep === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Your list</Label>
                <Input
                  value={data?.find((l) => l.id === confirmListId)?.title ?? ""}
                  readOnly
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Your list will be published as a standardized Master Directory entry. We'll generate a clean public title in the next step.
                </p>
              </div>
            </div>
          )}

          {confirmStep === 2 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="publish-entity">What is this list about?</Label>
                <Input
                  id="publish-entity"
                  value={entityInput}
                  onChange={(e) => setEntityInput(e.target.value)}
                  placeholder="e.g. cafes, films, schools, products"
                />
                {resolving && (
                  <p className="text-xs text-muted-foreground">Checking…</p>
                )}
                {resolvedEntity && resolvedEntity.preferred_term.toLowerCase() !== entityInput.trim().toLowerCase() && (
                  <button
                    type="button"
                    onClick={() => setEntityInput(resolvedEntity.preferred_term)}
                    className="text-xs inline-flex items-center gap-1 rounded-full border border-input bg-muted/50 px-2 py-1 hover:bg-muted"
                  >
                    We'll use "{resolvedEntity.plural_term}" → preferred term
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="publish-geography">Location (optional)</Label>
                <Input
                  id="publish-geography"
                  value={displayGeography}
                  onChange={(e) => setDisplayGeography(e.target.value)}
                  placeholder="e.g. Indiranagar, Bengaluru / Pan India / Online"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publish-usecase">Specific use case (optional)</Label>
                <Input
                  id="publish-usecase"
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  placeholder="e.g. pet-friendly / remote work / for families"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publish-hardfilter">Hard filter (optional)</Label>
                <Input
                  id="publish-hardfilter"
                  value={hardFilter}
                  onChange={(e) => setHardFilter(e.target.value)}
                  placeholder="e.g. under ₹15,000 / open after 10pm"
                />
              </div>
              {livePreview && (
                <div className="rounded-md border border-input bg-muted/30 p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Your list will appear as:</p>
                  <p className="text-sm font-medium">{livePreview}</p>
                </div>
              )}
            </div>
          )}

          {confirmStep === 3 && (
            <div className="space-y-4 py-2">
              {signatureMatch ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 space-y-2">
                  <p className="text-sm font-medium">
                    This list already exists in the Master Directory
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {signatureMatch.canonical_title || signatureMatch.title}
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-md border border-input p-4 space-y-3 text-sm">
                    <p className="font-medium">Ready to publish</p>
                    <p className="text-base font-semibold">{livePreview}</p>
                    <div className="space-y-1 pt-2 border-t border-input/50">
                      <p><span className="text-muted-foreground">Source title: </span>{data?.find((l) => l.id === confirmListId)?.title}</p>
                      {displayGeography.trim() && (
                        <p><span className="text-muted-foreground">Geography: </span>{displayGeography}</p>
                      )}
                      {useCase.trim() && (
                        <p><span className="text-muted-foreground">Use case: </span>{useCase}</p>
                      )}
                      {hardFilter.trim() && (
                        <p><span className="text-muted-foreground">Hard filter: </span>{hardFilter}</p>
                      )}
                    </div>
                  </div>
                  {tooSpecificWarning && (
                    <div className="attention-surface rounded-md p-3 text-sm">
                      This may be too specific for the Master Directory. Consider publishing it only in your network, or broadening the scope.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {confirmStep > 1 && (
              <Button
                variant="outline"
                onClick={() => setConfirmStep((s) => (s === 3 ? 2 : 1))}
                disabled={publishingListId !== null || checkingSignature}
              >
                Back
              </Button>
            )}
            <Button variant="outline" onClick={resetConfirmDialog}>
              Cancel
            </Button>
            {confirmStep < 3 && (
              <Button onClick={handleStepNext} disabled={checkingSignature}>
                {checkingSignature ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Checking…</> : "Next"}
              </Button>
            )}
            {confirmStep === 3 && signatureMatch && (
              <Button onClick={() => { window.open(`/directory/${signatureMatch.id}`, '_blank'); }}>
                View existing list
              </Button>
            )}
            {confirmStep === 3 && !signatureMatch && (
              <Button onClick={handleConfirmPublish} disabled={publishingListId !== null}>
                {publishingListId ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Publishing…</> : "Confirm & Publish"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Similar List Found</DialogTitle>
            <DialogDescription>
              A similar list already exists in the Master Directory
            </DialogDescription>
          </DialogHeader>

          {duplicateMatch && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border border-input p-4">
                <p className="text-sm font-medium text-muted-foreground">Existing List:</p>
                <p className="text-lg font-semibold">{duplicateMatch.title}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="secondary">
                    {(duplicateMatch.similarity_score * 100).toFixed(0)}% similar
                  </Badge>
                  <Badge variant="outline">
                    {duplicateMatch.contributor_count} contributors
                  </Badge>
                  <Badge variant="outline">
                    {duplicateMatch.total_votes} votes
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                A similar list already exists. View it to add your recommendations there instead.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMergeDialog(false);
                setPublishingListId(null);
                setDuplicateMatch(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleViewExisting}>
              View Existing List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Lists;
