import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { useState } from "react";

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

const ListsNew = () => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const form = useForm<ListFormValues>({
    resolver: zodResolver(ListSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "films",
      visibility: "private",
      items: [{ content: "", url: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });


  const onSubmit = async (values: ListFormValues) => {
    try {
      setSaving(true);
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) {
        toast({ title: "Not authenticated", description: "Please log in again." });
        return navigate("/login");
      }

      const ownerId = userRes.user.id;

      const { data: listInsert, error: listError } = await supabase
        .from("lists")
        .insert([
          {
            owner_id: ownerId,
            title: values.title,
            description: values.description || null,
            category: values.category,
            visibility: values.visibility,
          },
        ])
        .select("id")
        .maybeSingle();

      if (listError || !listInsert) {
        console.error("List insert error", listError);
        toast({ title: "Could not save list", description: listError?.message ?? "Try again." });
        return;
      }

      const listId = listInsert.id as string;

      const preparedItems = values.items
        .map((it, idx) => ({
          list_id: listId,
          content: it.content,
          url: it.url || null,
          position: idx + 1,
        }))
        .filter((it) => it.content.trim().length > 0);

      if (preparedItems.length > 0) {
        const { error: itemsError } = await supabase.from("list_items").insert(preparedItems);
        if (itemsError) {
          console.error("Items insert error", itemsError);
          toast({ title: "Saved list, but items failed", description: itemsError.message });
          // Still navigate to lists page since the list itself exists
          navigate("/lists");
          return;
        }
      }

      toast({ title: "List created", description: "Your list has been saved." });
      navigate("/lists");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Create New List | Antelog</title>
        <meta name="description" content="Create a minimalist, text-only list on Antelog." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background px-4 py-10">
        <section className="mx-auto max-w-3xl space-y-6">
          <header>
            <h1 className="text-3xl font-bold">Create a New List</h1>
            <p className="text-muted-foreground">Build a clean, text-only list. Keep it simple.</p>
          </header>

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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}
                          aria-label={`Remove item ${index + 1}`}
                        >
                          Remove
                        </Button>
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
                              <Input placeholder="https://example.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => append({ content: "", url: "" })}
                >
                  + Add Item
                </Button>
              </section>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save List"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => navigate("/lists")}>Cancel</Button>
              </div>
            </form>
          </Form>
        </section>
      </main>
    </>
  );
};

export default ListsNew;
