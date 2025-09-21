import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

const Login = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  const postLoginRedirect = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("full_name, handle, verification_status")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      // If we can't fetch profile, default to setup
      navigate("/profile-setup", { replace: true });
      return;
    }

    // No profile or missing essentials -> setup
    if (!profile || !profile.full_name || !profile.handle) {
      navigate("/profile-setup", { replace: true });
      return;
    }

    if (profile.verification_status === "verified") {
      navigate("/dashboard", { replace: true });
      return;
    }

    // Otherwise pending/rejected -> verify
    navigate("/verify", { replace: true });
  };

  const onSubmit = async (values: LoginValues) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email.toLowerCase(),
        password: values.password,
      });

      if (error) {
        const msg =
          error.message?.toLowerCase().includes("invalid login")
            ? "Invalid email or password."
            : error.message;
        toast.error(msg);
        setLoading(false);
        return;
      }

      if (data?.user) {
        toast.success("Welcome back!");
        await postLoginRedirect();
        setLoading(false);
        return;
      }

      toast.error("Could not sign in. Please try again.");
      setLoading(false);
    } catch (e) {
      toast.error("Something went wrong. Please try again.");
      setLoading(false);
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    const email = form.getValues("email").trim().toLowerCase();
    if (!email) {
      toast.message("Enter your email above, then click Forgot password.");
      return;
    }
    const redirectUrl = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password reset email sent. Check your inbox.");
    }
  };

  return (
    <>
      <Helmet>
        <title>Sign in | Antelog</title>
        <meta
          name="description"
          content="Sign in to your Antelog account to continue creating and discovering trusted lists."
        />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <section className="w-full max-w-md">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Sign in</CardTitle>
              <CardDescription>Welcome back to Antelog.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        <div className="flex items-center justify-between">
                          <FormLabel>Password</FormLabel>
                          <button
                            type="button"
                            className="text-sm underline underline-offset-4 hover:opacity-80"
                            onClick={handleForgotPassword}
                          >
                            Forgot password?
                          </button>
                        </div>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" autoComplete="current-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in…" : "Sign in"}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    Don’t have an account? {" "}
                    <Link to="/signup" className="underline underline-offset-4">Sign up</Link>
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

export default Login;
