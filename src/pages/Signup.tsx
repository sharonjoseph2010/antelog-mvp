import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";

const signupSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone_number: z
    .string()
    .min(1, "Phone number is required")
    .refine((val) => {
      // Check if it's in +91XXXXXXXXXX format with exactly 10 digits after +91
      const match = val.match(/^\+91(\d{10})$/);
      return match !== null;
    }, "Please enter a valid 10-digit phone number"),
});

type SignupValues = z.infer<typeof signupSchema>;

const Signup = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { full_name: "", email: "", password: "", phone_number: "" },
    mode: "onSubmit",
  });

const onSubmit = async (values: SignupValues) => {
  setLoading(true);
  try {
    const normalizedPhone = values.phone_number;

    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get("request_id");
    const shareLinkId = urlParams.get("share_link_id");
    const redirectUrl = requestId
      ? `${window.location.origin}/auth/callback?request_id=${encodeURIComponent(requestId)}`
      : `${window.location.origin}/auth/callback`;
    const isShareLinkSignup = Boolean(requestId || shareLinkId);

    const { data, error } = await supabase.auth.signUp({
      email: values.email.toLowerCase(),
      password: values.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          user_type: "verified",
          phone_number: normalizedPhone,
          full_name: values.full_name.trim(),
          is_share_signup: isShareLinkSignup,
          share_request_id: requestId,
          share_link_id: shareLinkId,
        }
      },
    });

    if (error) {
      const msg = error.message?.toLowerCase().includes("already registered")
        ? "This email is already registered. Try logging in or reset your password."
        : error.message;
      toast.error(msg);
      return;
    }

    // Convert guest contribution if coming from share link flow
    if (data?.user && shareLinkId) {
      try {
        await supabase
          .from("guest_contributions")
          .update({ joined_antelog: true, converted_user_id: data.user.id })
          .eq("share_link_id", shareLinkId);
      } catch (e) {
        console.error("Failed to update guest contribution:", e);
      }
    }

    if (data?.session) {
      toast.success("Account created. Redirecting…");
      if (requestId) {
        navigate(`/requests/${requestId}/respond?welcome=1`, { replace: true });
      } else {
        navigate("/profile-setup", { replace: true });
      }
      return;
    }

    toast.success("Check your inbox to verify your email.");
    form.reset({ email: values.email.toLowerCase(), password: "", full_name: "", phone_number: "" });
  } catch (e) {
    toast.error("Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
};

  return (
    <>
      <Helmet>
        <title>Sign up | Antelog</title>
        <meta
          name="description"
          content="Create your Antelog account with any email. We'll send a verification link to complete signup."
        />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <section className="w-full max-w-md">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Create your account</CardTitle>
              <CardDescription>Use any email. We'll email you a verification link.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="full_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name *</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="e.g., Mike Johnson" autoComplete="name" {...field} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          This is how you'll appear to people in your network
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" autoComplete="new-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <PhoneInput {...field} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground mt-1">
                          We'll use this to connect you with friends who have you in their contacts
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating account…" : "Create account"}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    Already have an account? <Link to="/login" className="underline underline-offset-4">Sign in</Link>
                  </p>
                </form>
              </Form>
            </CardContent>
          </Card>
        </section>
      </main>
    </>
  );
};

export default Signup;
