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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

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

const ListEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
            .select("id,title,description,category,visibility")
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

  const onSubmit = async (values: ListFormValues) => {
    if (!id) return;
    try {
      setSaving(true);
      // Update list fields
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

      // Replace all items with new set (simple, reliable for MVP)
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
            <h1 className="text-3xl font-bold">Edit List</h1>
            <Button asChild variant="link" className="px-0">
              <Link to={id ? `/lists/${id}` : "/lists"}>← Back to List</Link>
            </Button>
          </header>

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
                          <Textarea placeholder="Optional short description" {...field} />
                        </FormControl>
                        <FormDescription>Keep it concise and helpful.</FormDescription>
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
                          <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
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
                          <FormDescription>Public lists are visible to everyone.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">Items</h2>
                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <div key={field.id} className="grid gap-3 rounded-md border border-input p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{index + 1}.</span>
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
                        </div>

                        <FormField
                          control={form.control}
                          name={`items.${index}.content` as const}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Content</FormLabel>
                              <FormControl>
                                <Input placeholder="One-line recommendation" {...field} />
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
                                <Input placeholder="https://example.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ))}
                  </div>

                  <Button type="button" variant="secondary" onClick={() => append({ content: "", url: "" })}>
                    + Add Item
                  </Button>
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
