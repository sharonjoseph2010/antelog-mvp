import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Helmet } from "react-helmet-async";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const profileSchema = z.object({
  full_name: z.string().min(1, "Full name is required").max(120, "Too long"),
  handle: z
    .string()
    .min(3, "Handle must be at least 3 characters")
    .max(30, "Handle must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, or underscores"),
  student_id_number: z.string().min(1, "Student registration number is required").max(80, "Too long"),
});

type ProfileValues = z.infer<typeof profileSchema>;

const ProfileSetup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: "",
      handle: "",
      student_id_number: "",
    },
    mode: "onSubmit",
  });

  // Block direct access unless coming from internal flow
  useEffect(() => {
    const state: any = location.state || {};
    if (state.internal !== true) {
      navigate("/dashboard", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_evt, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        navigate("/signup", { replace: true });
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        navigate("/signup", { replace: true });
      } else {
        // Prefill if profile exists
        supabase
          .from("profiles")
          .select("full_name, handle, student_id_number, id_card_image_url")
          .eq("id", uid)
          .maybeSingle()
          .then(({ data, error }) => {
            if (!error && data) {
              form.reset({
                full_name: data.full_name ?? "",
                handle: data.handle ?? "",
                student_id_number: data.student_id_number ?? "",
              });
            }
          });
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, [navigate, form]);

  const onSubmit = async (values: ProfileValues) => {
    if (!userId) {
      toast.error("You need to be signed in to set up your profile.");
      navigate("/signup", { replace: true });
      return;
    }

    setLoading(true);

    try {
      let imagePath: string | undefined = undefined;

      if (selectedFile) {
        const filePath = `${userId}/${Date.now()}-${selectedFile.name}`;
        const { data: uploadData, error: uploadError } = await supabase
          .storage
          .from("id-cards")
          .upload(filePath, selectedFile, { upsert: true });

        if (uploadError) {
          console.error(uploadError);
          toast.error("Failed to upload ID card. Please try again.");
          setLoading(false);
          return;
        }

        imagePath = uploadData?.path;
      }

      const payload: any = {
        id: userId,
        full_name: values.full_name.trim(),
        handle: values.handle.trim().toLowerCase(),
        student_id_number: values.student_id_number.trim(),
        verification_status: "pending",
      };

      if (imagePath) payload.id_card_image_url = imagePath;

      const { error: upsertError } = await supabase.from("profiles").upsert(payload, {
        onConflict: "id",
      });

      if (upsertError) {
        console.error(upsertError);
        toast.error("Could not save your profile. Please try again.");
        return;
      }

      toast.success("Profile saved. We’ll verify your details soon.");
      navigate("/verify", { replace: true, state: { internal: true } });
    } catch (e) {
      console.error(e);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Profile setup | Antelog</title>
        <meta name="description" content="Set up your Antelog profile to start creating and sharing lists." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <section className="w-full max-w-xl">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Set up your profile</CardTitle>
              <CardDescription>Tell us who you are and upload your student ID for verification.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="full_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full name</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="Your full name" autoComplete="name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="handle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Handle</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="username"
                            {...field}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^a-zA-Z0-9_]/g, "");
                              field.onChange(v);
                            }}
                          />
                        </FormControl>
                        <p className="text-sm text-muted-foreground">Only letters, numbers, and underscores. Will be lowercased.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="student_id_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Student registration number</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="e.g. SRFTI-23-XXXX" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <FormLabel>Student ID photo</FormLabel>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    />
                    <p className="text-sm text-muted-foreground">Upload a clear photo of your SRFTI ID card.</p>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Saving…" : "Save and continue"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </section>
      </main>
    </>
  );
};

export default ProfileSetup;
