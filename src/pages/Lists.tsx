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
import { CheckCircle, Globe, Loader2, Merge } from "lucide-react";
import {
  publishToMasterDirectory,
  checkForDuplicates,
  mergeWithExisting,
} from "@/lib/masterDirectory";
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
  const [duplicateCheck, setDuplicateCheck] = useState<{
    existingEntry: any;
    similarity: number;
  } | null>(null);

  if (error) {
    toast({ title: "Failed to load lists", description: (error as Error).message });
  }

  const handlePublish = async (listId: string) => {
    setPublishingListId(listId);

    const list = data?.find((l) => l.id === listId);
    if (!list) {
      setPublishingListId(null);
      return;
    }

    const check = await checkForDuplicates(list.title, list.category);

    if (check.isDuplicate) {
      setDuplicateCheck({
        existingEntry: check.existingEntry,
        similarity: check.similarity ?? 0,
      });
      setShowMergeDialog(true);
      return;
    }

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      setPublishingListId(null);
      return;
    }

    const result = await publishToMasterDirectory(listId, userRes.user.id);

    if (result.success) {
      toast({
        title: "Published!",
        description: "Your list is now in the Master Directory",
      });
      queryClient.invalidateQueries({ queryKey: ["my-lists"] });
    } else {
      toast({
        title: "Failed to Publish",
        description: result.error,
        variant: "destructive",
      });
    }

    setPublishingListId(null);
  };

  const handleMergeConfirm = async () => {
    if (!publishingListId || !duplicateCheck?.existingEntry) return;

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return;

    const result = await mergeWithExisting(
      publishingListId,
      userRes.user.id,
      duplicateCheck.existingEntry.id
    );

    if (result.success) {
      toast({
        title: "Merged Successfully!",
        description: "Your recommendations have been added to the existing list",
      });
      queryClient.invalidateQueries({ queryKey: ["my-lists"] });
    } else {
      toast({
        title: "Merge Failed",
        description: result.error,
        variant: "destructive",
      });
    }

    setShowMergeDialog(false);
    setPublishingListId(null);
    setDuplicateCheck(null);
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
                          onClick={() => handlePublish(list.id)}
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

      {/* Merge Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Similar List Found</DialogTitle>
            <DialogDescription>
              A similar list already exists in the Master Directory
            </DialogDescription>
          </DialogHeader>

          {duplicateCheck && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border border-input p-4">
                <p className="text-sm font-medium text-muted-foreground">Existing List:</p>
                <p className="text-lg font-semibold">{duplicateCheck.existingEntry.display_content}</p>
                <Badge variant="secondary" className="mt-1">
                  {(duplicateCheck.similarity * 100).toFixed(0)}% similar to your list
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                To keep the Master Directory clutter-free, we merge similar lists.
                Your recommendations will be added to the existing list.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMergeDialog(false);
                setPublishingListId(null);
                setDuplicateCheck(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleMergeConfirm}>
              <Merge className="h-4 w-4" />
              Merge with Existing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Lists;
