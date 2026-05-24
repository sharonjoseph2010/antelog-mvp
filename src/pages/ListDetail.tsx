import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import ListItemRow from "@/components/ListItemRow";

interface ListRecord {
  id: string;
  title: string;
  description: string | null;
  category: string;
  visibility: string;
  created_at: string;
}

interface ListItemRecord {
  id: string;
  content: string;
  url: string | null;
  position: number | null;
  created_at: string;
}

const fetchListDetail = async (id: string): Promise<{ list: ListRecord | null; items: ListItemRecord[] }> => {
  const [{ data: list, error: listError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from("lists").select("id,title,description,category,visibility,created_at").eq("id", id).maybeSingle(),
    supabase
      .from("list_items")
      .select("id,content,url,position,created_at")
      .eq("list_id", id)
      .order("position", { ascending: true })
  ]);

  if (listError) throw new Error(listError.message);
  if (itemsError) {
    console.warn("[ListDetail] items fetch warning", itemsError);
  }

  // Fallback sort by created_at if position is null/undefined
  const sortedItems = (items ?? []).slice().sort((a, b) => {
    const pa = a.position ?? Number.MAX_SAFE_INTEGER;
    const pb = b.position ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return { list: (list as any) ?? null, items: sortedItems as any };
};

const ListDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["list-detail", id],
    queryFn: () => fetchListDetail(id as string),
    enabled: !!id,
  });

  const handleDelete = async () => {
    if (!id) return;
    try {
      // Delete items first (no FK cascade present), then the list
      const { error: itemsErr } = await supabase.from("list_items").delete().eq("list_id", id);
      if (itemsErr) throw itemsErr;

      const { error: listErr } = await supabase.from("lists").delete().eq("id", id);
      if (listErr) throw listErr;

      toast({ title: "List deleted", description: "Your list was removed successfully." });
      navigate("/lists", { replace: true });
    } catch (e: any) {
      console.error("[ListDetail] Delete error", e);
      toast({ title: "Failed to delete list", description: e?.message ?? "Please try again" });
      await refetch();
    }
  };

  const list = data?.list ?? null;
  const items = data?.items ?? [];

  return (
    <>
      <Helmet>
        <title>{list ? `${list.title} | Antelog` : "List | Antelog"}</title>
        <meta name="description" content={list ? `View list: ${list.title}` : "View list details on Antelog"} />
        <link rel="canonical" href={typeof window !== "undefined" ? window.location.href : ""} />
      </Helmet>

      <main className="min-h-screen bg-background px-4 py-8">
        <section className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center justify-between">
            <Button asChild variant="link" className="px-0">
              <Link to="/lists">← Back to My Lists</Link>
            </Button>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link to={id ? `/lists/${id}/edit` : "/lists"}>Edit List</Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Delete List</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this list?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the list and its items.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {isLoading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : error ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-destructive">{(error as Error).message}</p>
              </CardContent>
            </Card>
          ) : !list ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground">List not found or you don’t have access.</p>
              </CardContent>
            </Card>
          ) : (
            <article>
              <Card className="hover:shadow-sm transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-3xl font-bold">{list.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{list.category}</Badge>
                    <Badge variant="outline">{list.visibility}</Badge>
                  </div>
                  {list.description ? (
                    <p className="text-muted-foreground whitespace-pre-wrap">{list.description}</p>
                  ) : null}

                  <section aria-label="List items">
                    {items.length === 0 ? (
                      <p className="text-muted-foreground">No items in this list yet.</p>
                    ) : (
                      <div>
                        {items.map((item, idx) => (
                          <ListItemRow
                            key={item.id}
                            number={idx + 1}
                            name={item.content}
                            url={item.url}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                </CardContent>
              </Card>
            </article>
          )}
        </section>
      </main>
    </>
  );
};

export default ListDetail;
