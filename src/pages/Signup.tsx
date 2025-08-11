import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const signupSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignupValues = z.infer<typeof signupSchema>;

const Signup = () => {
  const [loading, setLoading] = useState(false);

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  const onSubmit = async (values: SignupValues) => {
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signUp({
        email: values.email.toLowerCase(),
        password: values.password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        const msg =
          error.message?.toLowerCase().includes("already registered")
            ? "This email is already registered. Try logging in or reset your password."
            : error.message;
        toast.error(msg);
        return;
      }

      toast.success("Check your inbox to verify your email.");
      form.reset({ email: values.email.toLowerCase(), password: "" });
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

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating account…" : "Create account"}
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

export default Signup;
