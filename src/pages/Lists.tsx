import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";

interface ListWithCount {
  id: string;
  title: string;
  category: string;
  visibility: string;
  created_at: string;
  itemCount: number;
}

const fetchMyLists = async (): Promise<ListWithCount[]> => {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return [];
  const userId = userRes.user.id;

  const { data: lists, error: listsError } = await supabase
    .from("lists")
    .select("id,title,category,visibility,created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (listsError) {
    throw new Error(listsError.message);
  }

  if (!lists || lists.length === 0) return [];

  const listIds = lists.map((l) => l.id);
  const { data: items, error: itemsError } = await supabase
    .from("list_items")
    .select("id,list_id")
    .in("list_id", listIds);

  if (itemsError) {
    // Non-fatal: show toast but still render lists with count 0
    console.warn("Items fetch error", itemsError);
  }

  const counts = new Map<string, number>();
  for (const it of items ?? []) {
    counts.set(it.list_id as string, (counts.get(it.list_id as string) ?? 0) + 1);
  }

  return (lists ?? []).map((l) => ({
    id: l.id as string,
    title: l.title as string,
    category: l.category as string,
    visibility: l.visibility as string,
    created_at: l.created_at as string,
    itemCount: counts.get(l.id as string) ?? 0,
  }));
};

const Lists = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-lists"],
    queryFn: fetchMyLists,
  });

  if (error) {
    toast({ title: "Failed to load lists", description: (error as Error).message });
  }

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
              <p className="mb-4 text-muted-foreground">You haven’t created any lists yet.</p>
              <Button asChild>
                <Link to="/lists/new">Create Your First List</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data!.map((list) => (
                <Card key={list.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{list.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{list.category}</Badge>
                      <Badge variant="outline">{list.visibility}</Badge>
                    </div>
                    <div className="text-muted-foreground">{list.itemCount} items</div>
                    <Button asChild variant="link" className="p-0">
                      <Link to={`/lists/${list.id}`}>View details</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
};

export default Lists;
