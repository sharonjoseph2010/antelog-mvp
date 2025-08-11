import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const verifySchema = z.object({
  student_id_number: z.string().min(3, "Enter your SRFTI registration number"),
  id_card_image: z.any().refine((file) => file instanceof File, "Please upload your ID card image"),
});

type VerifyValues = z.infer<typeof verifySchema>;

type Profile = {
  verification_status: "pending" | "verified" | "rejected";
  id_card_image_url: string | null;
  student_id_number: string | null;
};

const sanitizeHandle = (email?: string | null) => {
  const base = (email?.split("@")[0] || "user").toLowerCase();
  return base.replace(/[^a-z0-9._-]/g, "");
};

const Verify = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const form = useForm<VerifyValues>({
    resolver: zodResolver(verifySchema),
    defaultValues: { student_id_number: "", id_card_image: undefined as any },
    mode: "onSubmit",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session?.user) {
        navigate("/signup", { replace: true });
        return;
      }
      setUserId(session.user.id);
      setEmail(session.user.email ?? null);

      const { data: p } = await supabase
        .from("profiles")
        .select("verification_status,id_card_image_url,student_id_number")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!mounted) return;
      if (p) {
        setProfile(p as Profile);
        if ((p as Profile).verification_status === "verified") {
          navigate("/", { replace: true });
        }
      }
    })();
    return () => { mounted = false; };
  }, [navigate]);

  const statusBanner = useMemo(() => {
    if (!profile) return null;
    const status = profile.verification_status;
    if (status === "verified") return null;
    if (status === "pending") return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground">
        Your verification is pending. You’ll be notified once approved.
      </div>
    );
    if (status === "rejected") return (
      <div className="rounded-md border p-3 text-sm text-destructive">
        Your previous submission was rejected. Please re-submit your details.
      </div>
    );
    return null;
  }, [profile]);

  const ensureProfileExists = async (uid: string) => {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", uid)
      .maybeSingle();

    if (!existing) {
      const candidate = sanitizeHandle(email);
      await supabase.from("profiles").insert({
        id: uid,
        handle: candidate,
      });
    }
  };

  const onSubmit = async (values: VerifyValues) => {
    if (!userId) return;
    if (!file) {
      toast.error("Please upload your ID card image.");
      return;
    }

    setLoading(true);
    try {
      await ensureProfileExists(userId);

      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/id-card-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("id-cards")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          student_id_number: values.student_id_number,
          id_card_image_url: path,
          verification_status: "pending",
        })
        .eq("id", userId);
      if (updateError) throw updateError;

      toast.success("Verification submitted. We’ll review it shortly.");
      setProfile((prev) => ({
        verification_status: "pending",
        id_card_image_url: path,
        student_id_number: values.student_id_number,
      }));
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to submit verification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Verify your SRFTI student ID | Antelog</title>
        <meta
          name="description"
          content="Upload your SRFTI student ID and registration number to get verified and access Antelog."
        />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <section className="w-full max-w-md">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Student verification</CardTitle>
              <CardDescription>
                Upload your SRFTI ID card photo and enter your registration number.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {statusBanner}
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="student_id_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration number</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., SRFTI/2023/00123" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="id_card_image"
                    render={() => (
                      <FormItem>
                        <FormLabel>ID card image</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              setFile(f || null);
                              form.setValue("id_card_image", f as any, { shouldValidate: true });
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={loading || profile?.verification_status === "pending"}>
                    {loading ? "Submitting…" : profile?.verification_status === "pending" ? "Pending review" : "Submit for verification"}
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

export default Verify;
