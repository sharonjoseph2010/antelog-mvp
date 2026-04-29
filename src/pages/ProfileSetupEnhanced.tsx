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
import { PhoneInput } from "@/components/ui/phone-input";
import { Phone, Users } from "lucide-react";

const profileSchema = z.object({
  full_name: z.string().min(1, "Full name is required").max(120, "Too long"),
  handle: z
    .string()
    .min(3, "Handle must be at least 3 characters")
    .max(30, "Handle must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, or underscores"),
  phone_number: z
    .string()
    .min(1, "Phone number is required")
    .refine((val) => val && val.startsWith('+') && val.length >= 12, "Enter a valid phone number with country code"),
});

type ProfileValues = z.infer<typeof profileSchema>;

const ProfileSetupEnhanced = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: "",
      handle: "",
      phone_number: "",
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
          .select("full_name, handle, phone_number")
          .eq("id", uid)
          .maybeSingle()
          .then(({ data, error }) => {
            if (!error && data) {
              form.reset({
                full_name: data.full_name ?? "",
                handle: data.handle ?? "",
                phone_number: data.phone_number ?? "",
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
      // Phone is already in E.164 format from PhoneInput component
      const normalizedPhone = values.phone_number;
      
      const payload: any = {
        id: userId,
        full_name: values.full_name.trim(),
        handle: values.handle.trim().toLowerCase(),
        phone_number: normalizedPhone,
        verification_status: "pending",
      };

      const { error: upsertError } = await supabase.from("profiles").upsert(payload, {
        onConflict: "id",
      });

      if (upsertError) {
        console.error(upsertError);
        toast.error("Could not save your profile. Please try again.");
        return;
      }

      toast.success("Profile saved! Now let's add your trusted contacts.");
      navigate("/contacts/import", { replace: true, state: { internal: true } });
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
              <CardDescription>Tell us who you are and we'll help you find your trusted network.</CardDescription>
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
                    name="phone_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          Phone Number *
                        </FormLabel>
                        <FormControl>
                          <PhoneInput {...field} />
                        </FormControl>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">
                            We use your phone number to connect you with friends who have you in their contacts.
                          </p>
                          <p className="text-xs text-muted-foreground">
                            🔒 Your phone number is private and only used for matching.
                          </p>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={loading}>
                    <Users className="h-4 w-4 mr-2" />
                    {loading ? "Saving…" : "Continue to Add Contacts"}
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

export default ProfileSetupEnhanced;