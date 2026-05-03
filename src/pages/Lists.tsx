import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

const CATEGORY_OPTIONS: ListCategory[] = ["films", "places", "products", "services", "other"];

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
  const [confirmGeography, setConfirmGeography] = useState("");
  const [confirmUseCase, setConfirmUseCase] = useState("");
  const [signatureMatch, setSignatureMatch] = useState<{ id: string; title: string } | null>(null);
  const [checkingSignature, setCheckingSignature] = useState(false);

  const normalizeForSig = (s: string) =>
    s.trim().toLowerCase().replace(/\s+/g, "_");

  const buildSignature = (cat: string, title: string, geo: string, use: string) =>
    `${cat}|${normalizeForSig(title)}|${normalizeForSig(geo)}|${normalizeForSig(use)}`;

  if (error) {
    toast({ title: "Failed to load lists", description: (error as Error).message });
  }

  const handlePublishClick = (listId: string) => {
    const list = data?.find((l) => l.id === listId);
    if (!list) return;
    setConfirmListId(listId);
    setConfirmCategory(list.category);
    setConfirmStep(1);
    setConfirmGeography("");
    setConfirmUseCase("");
    setSignatureMatch(null);
    setShowConfirmDialog(true);
  };

  const resetConfirmDialog = () => {
    setShowConfirmDialog(false);
    setConfirmListId(null);
    setConfirmStep(1);
    setConfirmGeography("");
    setConfirmUseCase("");
    setSignatureMatch(null);
  };

  const handleStepNext = async () => {
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }
    if (confirmStep === 2) {
      const list = data?.find((l) => l.id === confirmListId);
      if (!list) return;
      setCheckingSignature(true);
      const sig = buildSignature(confirmCategory, list.title, confirmGeography, confirmUseCase);
      const { data: match } = await supabase
        .from("master_directory_lists")
        .select("id, title")
        .eq("canonical_signature", sig)
        .maybeSingle();
      setCheckingSignature(false);
      setSignatureMatch(match ?? null);
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
      // Check for similar lists in master_directory_lists
      const { data: similar, error: simErr } = await supabase.rpc("find_similar_directory_lists", {
        p_title: list.title,
        p_threshold: 0.5,
      });

      if (simErr) throw simErr;

      if (similar && similar.length > 0) {
        setDuplicateMatch(similar[0] as any);
        setShowMergeDialog(true);
        setShowConfirmDialog(false);
        return;
      }

      // No duplicate — create new directory list
      const normalized = list.title.trim().toLowerCase().replace(/\s+/g, " ");
      const sig = buildSignature(confirmCategory, list.title, confirmGeography, confirmUseCase);
      const geoVal = confirmGeography.trim() || null;
      const useVal = confirmUseCase.trim() || null;
      const { data: newDirList, error: createErr } = await supabase
        .from("master_directory_lists")
        .insert({
          title: list.title,
          title_normalized: normalized,
          category: confirmCategory,
          original_contributor_id: userRes.user.id,
          geography: geoVal,
          use_case: useVal,
          canonical_signature: sig,
          canonical_query: `${list.title} ${confirmGeography} ${confirmUseCase}`.trim(),
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
                <Label>List title</Label>
                <Input
                  value={data?.find((l) => l.id === confirmListId)?.title ?? ""}
                  readOnly
                  disabled
                />
                <p className="text-xs text-muted-foreground">Title can't be changed after publishing</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="publish-category">Category</Label>
                <Select
                  value={confirmCategory}
                  onValueChange={(val) => setConfirmCategory(val as ListCategory)}
                >
                  <SelectTrigger id="publish-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {confirmStep === 2 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="publish-geography">Where does this apply? (optional)</Label>
                <Input
                  id="publish-geography"
                  value={confirmGeography}
                  onChange={(e) => setConfirmGeography(e.target.value)}
                  placeholder="e.g. Indiranagar, Bengaluru / Pan India / Online"
                />
                <p className="text-xs text-muted-foreground">Leave blank if location doesn't matter</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="publish-usecase">Any specific filter? (optional)</Label>
                <Input
                  id="publish-usecase"
                  value={confirmUseCase}
                  onChange={(e) => setConfirmUseCase(e.target.value)}
                  placeholder="e.g. under ₹15000 / pet-friendly / vegetarian"
                />
                <p className="text-xs text-muted-foreground">Helps distinguish from similar lists</p>
              </div>
            </div>
          )}

          {confirmStep === 3 && (
            <div className="space-y-4 py-2">
              {signatureMatch ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 space-y-2">
                  <p className="text-sm font-medium">
                    An identical list already exists in the Directory. View it to contribute instead.
                  </p>
                  <p className="text-sm text-muted-foreground">{signatureMatch.title}</p>
                </div>
              ) : (
                <div className="rounded-md border border-input p-4 space-y-2 text-sm">
                  <p className="font-medium">Ready to publish</p>
                  <p><span className="text-muted-foreground">Title: </span>{data?.find((l) => l.id === confirmListId)?.title}</p>
                  <p><span className="text-muted-foreground">Category: </span>{confirmCategory}</p>
                  {confirmGeography.trim() && (
                    <p><span className="text-muted-foreground">Geography: </span>{confirmGeography}</p>
                  )}
                  {confirmUseCase.trim() && (
                    <p><span className="text-muted-foreground">Filter: </span>{confirmUseCase}</p>
                  )}
                </div>
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
