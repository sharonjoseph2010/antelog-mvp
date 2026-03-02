import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Lock, AlertTriangle } from "lucide-react";

const categoryOptions = [
  { label: "Films", value: "films" as const },
  { label: "Places", value: "places" as const },
  { label: "Products", value: "products" as const },
  { label: "Services", value: "services" as const },
  { label: "Other", value: "other" as const },
];

const visibilityOptions = [
  { label: "Private", value: "private" as const },
  { label: "Friends", value: "friends" as const },
  { label: "Public", value: "public" as const },
];

const ItemSchema = z.object({
  content: z.string().min(1, "Content is required"),
  url: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val === "" ? undefined : val))
    .refine((val) => !val || /^https?:\/\//i.test(val), {
      message: "Use a valid URL starting with http(s)://",
    }),
});

const ListSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: z.enum(["films", "places", "products", "services", "other"]),
  visibility: z.enum(["private", "friends", "public"]),
  items: z.array(ItemSchema).min(1, "Add at least one item"),
});

type ListFormValues = z.infer<typeof ListSchema>;

interface DirectoryItemInfo {
  item_name: string;
  vote_count: number;
}

const ListEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [directoryListId, setDirectoryListId] = useState<string | null>(null);
  const [lockedItems, setLockedItems] = useState<Set<string>>(new Set()); // content strings that are locked
  const [directoryItems, setDirectoryItems] = useState<DirectoryItemInfo[]>([]);

  const form = useForm<ListFormValues>({
    resolver: zodResolver(ListSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "films",
      visibility: "private",
      items: [],
    },
  });

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "items",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!id) return;
      try {
        setLoading(true);
        const [{ data: list, error: listError }, { data: items, error: itemsError }] = await Promise.all([
          supabase
            .from("lists")
            .select("id,title,description,category,visibility,directory_list_id" as any)
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("list_items")
            .select("id,content,url,position,created_at")
            .eq("list_id", id)
            .order("position", { ascending: true }),
        ]);
        if (listError) throw listError;
        if (!list) {
          toast({ title: "Not found", description: "List not found or access denied." });
          navigate("/lists", { replace: true });
          return;
        }
        if (itemsError) console.warn("[ListEdit] items fetch warning", itemsError);

        const dirListId = (list as any).directory_list_id as string | null;
        const published = !!dirListId;

        // If published, fetch directory items to check vote_count for hard lock
        let lockedContentSet = new Set<string>();
        let dirItems: DirectoryItemInfo[] = [];
        if (published && dirListId) {
          const { data: mdItems } = await supabase
            .from("master_directory_items")
            .select("item_name,vote_count,item_name_normalized")
            .eq("list_id", dirListId);

          if (mdItems) {
            dirItems = mdItems.map((i) => ({
              item_name: i.item_name,
              vote_count: i.vote_count ?? 0,
            }));
            // Items with votes > 0 are locked
            for (const di of dirItems) {
              if (di.vote_count > 0) {
                lockedContentSet.add(di.item_name.trim().toLowerCase());
              }
            }
          }
        }

        const sortedItems = (items ?? [])
          .slice()
          .sort((a, b) => {
            const pa = (a as any).position ?? Number.MAX_SAFE_INTEGER;
            const pb = (b as any).position ?? Number.MAX_SAFE_INTEGER;
            if (pa !== pb) return pa - pb;
            return new Date((a as any).created_at).getTime() - new Date((b as any).created_at).getTime();
          })
          .map((it) => ({ content: (it as any).content as string, url: ((it as any).url as string | null) ?? "" }));

        if (!mounted) return;
        setIsPublished(published);
        setDirectoryListId(dirListId);
        setLockedItems(lockedContentSet);
        setDirectoryItems(dirItems);
        form.reset({
          title: (list as any).title,
          description: ((list as any).description as string | null) ?? "",
          category: (list as any).category,
          visibility: (list as any).visibility,
          items: sortedItems.length > 0 ? sortedItems : [{ content: "", url: "" }],
        });
      } catch (e: any) {
        console.error("[ListEdit] Load error", e);
        toast({ title: "Failed to load list", description: e?.message ?? "Please try again" });
        navigate("/lists", { replace: true });
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id, form, navigate]);

  const isItemLocked = (content: string) => {
    return lockedItems.has(content.trim().toLowerCase());
  };

  const isItemInDirectory = (content: string) => {
    return directoryItems.some(
      (di) => di.item_name.trim().toLowerCase() === content.trim().toLowerCase()
    );
  };

  const onSubmit = async (values: ListFormValues) => {
    if (!id) return;
    try {
      setSaving(true);

      if (isPublished) {
        // RESTRICTED EDIT: only title and category
        const { error: listErr } = await supabase
          .from("lists")
          .update({
            title: values.title,
            category: values.category,
          })
          .eq("id", id);
        if (listErr) throw listErr;

        // Sync to master_directory_lists via SECURITY DEFINER function
        if (directoryListId) {
          const { error: syncErr } = await supabase.rpc("sync_directory_list_edits", {
            p_list_id: id,
            p_new_title: values.title,
            p_new_category: values.category,
          });
          if (syncErr) {
            console.warn("[ListEdit] Directory sync warning:", syncErr);
          }
        }

        toast({ title: "List updated", description: "Title and category synced to Master Directory." });
      } else {
        // FULL EDIT: update everything
        const { error: listErr } = await supabase
          .from("lists")
          .update({
            title: values.title,
            description: values.description || null,
            category: values.category,
            visibility: values.visibility,
          })
          .eq("id", id);
        if (listErr) throw listErr;

        // Replace all items
        const { error: delErr } = await supabase.from("list_items").delete().eq("list_id", id);
        if (delErr) throw delErr;

        const preparedItems = values.items
          .map((it, idx) => ({
            list_id: id,
            content: it.content,
            url: it.url || null,
            position: idx + 1,
          }))
          .filter((it) => it.content.trim().length > 0);

        if (preparedItems.length > 0) {
          const { error: insErr } = await supabase.from("list_items").insert(preparedItems);
          if (insErr) throw insErr;
        }

        toast({ title: "List updated", description: "Your changes have been saved." });
      }

      navigate(`/lists/${id}`, { replace: true });
    } catch (e: any) {
      console.error("[ListEdit] Save error", e);
      toast({ title: "Could not save changes", description: e?.message ?? "Try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Edit List | Antelog</title>
        <meta name="description" content="Edit your Antelog list and items." />
        <link rel="canonical" href={typeof window !== "undefined" ? window.location.href : ""} />
      </Helmet>
      <main className="min-h-screen bg-background px-4 py-10">
        <section className="mx-auto max-w-3xl space-y-6">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Edit List</h1>
              {isPublished && (
                <Badge variant="default" className="text-xs">In Directory</Badge>
              )}
            </div>
            <Button asChild variant="link" className="px-0">
              <Link to={id ? `/lists/${id}` : "/lists"}>← Back to List</Link>
            </Button>
          </header>

          {isPublished && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This list has been published to the Master Directory. Only the title and category can be edited. Items, description, and visibility are locked.
              </AlertDescription>
            </Alert>
          )}

          {loading ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground">Loading…</p>
              </CardContent>
            </Card>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <section className="space-y-6">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Essential Films of the 90s" {...field} />
                        </FormControl>
                        {isPublished && (
                          <FormDescription>Typo fixes will sync to the Master Directory.</FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Optional short description"
                            {...field}
                            disabled={isPublished}
                            className={isPublished ? "opacity-50 cursor-not-allowed" : ""}
                          />
                        </FormControl>
                        <FormDescription>
                          {isPublished ? "Locked — list is in the Master Directory." : "Keep it concise and helpful."}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-6 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categoryOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {isPublished && (
                            <FormDescription>Category correction will sync to the directory.</FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="visibility"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Visibility</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            value={field.value}
                            disabled={isPublished}
                          >
                            <FormControl>
                              <SelectTrigger className={isPublished ? "opacity-50 cursor-not-allowed" : ""}>
                                <SelectValue placeholder="Select visibility" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {visibilityOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            {isPublished ? "Locked — published lists must remain public." : "Public lists are visible to everyone."}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">Items</h2>
                  {isPublished && (
                    <p className="text-sm text-muted-foreground">
                      Items cannot be added or removed for published lists.
                    </p>
                  )}
                  <div className="space-y-3">
                    <TooltipProvider>
                      {fields.map((field, index) => {
                        const content = form.watch(`items.${index}.content`);
                        const locked = isItemLocked(content);
                        const inDirectory = isItemInDirectory(content);

                        return (
                          <div
                            key={field.id}
                            className={`grid gap-3 rounded-md border p-3 ${
                              locked ? "border-destructive/30 bg-destructive/5" : "border-input"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">{index + 1}.</span>
                                {locked && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Lock className="h-3.5 w-3.5 text-destructive" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      This item has community votes and cannot be removed
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {!locked && inDirectory && isPublished && (
                                  <Badge variant="outline" className="text-xs">In Directory</Badge>
                                )}
                              </div>
                              {!isPublished && (
                                <div className="flex items-center gap-1">
                                  <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label={`Move item ${index + 1} up`}>
                                    ↑
                                  </Button>
                                  <Button type="button" variant="ghost" size="sm" disabled={index === fields.length - 1} onClick={() => move(index, index + 1)} aria-label={`Move item ${index + 1} down`}>
                                    ↓
                                  </Button>
                                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} aria-label={`Remove item ${index + 1}`}>
                                    Remove
                                  </Button>
                                </div>
                              )}
                            </div>

                            <FormField
                              control={form.control}
                              name={`items.${index}.content` as const}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Content</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="One-line recommendation"
                                      {...field}
                                      disabled={isPublished}
                                      className={isPublished ? "opacity-60 cursor-not-allowed" : ""}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`items.${index}.url` as const}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>URL (optional)</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="https://example.com"
                                      {...field}
                                      disabled={isPublished}
                                      className={isPublished ? "opacity-60 cursor-not-allowed" : ""}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        );
                      })}
                    </TooltipProvider>
                  </div>

                  {!isPublished && (
                    <Button type="button" variant="secondary" onClick={() => append({ content: "", url: "" })}>
                      + Add Item
                    </Button>
                  )}
                </section>

                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => navigate(id ? `/lists/${id}` : "/lists")}>Cancel</Button>
                </div>
              </form>
            </Form>
          )}
        </section>
      </main>
    </>
  );
};

export default ListEdit;
