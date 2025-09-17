import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Users, Zap } from "lucide-react";

const guestSignupSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type GuestSignupValues = z.infer<typeof guestSignupSchema>;

export default function GuestSignup() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const form = useForm<GuestSignupValues>({
    resolver: zodResolver(guestSignupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: GuestSignupValues) => {
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/directory`;
      
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            user_type: 'guest'
          }
        }
      });

      if (error) {
        toast({
          title: "Signup failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (data?.user && !data.session) {
        toast({
          title: "Check your email",
          description: "We've sent you a confirmation link to complete your signup.",
        });
        return;
      }

      if (data?.user && data.session) {
        // Create guest profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            handle: values.email.split('@')[0] + Math.random().toString(36).substr(2, 4),
            user_type: 'guest',
            is_verified: false
          });

        if (profileError) {
          console.error('Profile creation error:', profileError);
        }

        toast({
          title: "Welcome to Antelog!",
          description: "Your account has been created. You now have access to our directory.",
        });

        navigate("/directory");
      }
    } catch (error: any) {
      toast({
        title: "Signup failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Join as Guest - Antelog Directory</title>
        <meta 
          name="description" 
          content="Sign up for free access to Antelog's curated directory of recommendations from verified users." 
        />
      </Helmet>

      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-8">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold">Join Antelog Directory</h1>
            <p className="mt-2 text-muted-foreground">
              Get free access to curated recommendations from our verified community
            </p>
          </div>

          {/* Benefits */}
          <Card className="border-primary/20">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">What you get:</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start space-x-3">
                <Search className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium">Full Directory Access</h3>
                  <p className="text-sm text-muted-foreground">Search through all public recommendations</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Users className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium">Community Insights</h3>
                  <p className="text-sm text-muted-foreground">Discover what verified users recommend</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Zap className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium">Fast & Clean</h3>
                  <p className="text-sm text-muted-foreground">No ads, no clutter, just recommendations</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Signup Form */}
          <Card>
            <CardHeader>
              <CardTitle>Create Your Account</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="your@email.com"
                            {...field}
                          />
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
                          <Input
                            type="password"
                            placeholder="Choose a secure password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Confirm your password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading}
                  >
                    {loading ? "Creating Account..." : "Sign Up for Free"}
                  </Button>
                </form>
              </Form>

              <div className="mt-6 text-center text-sm">
                <p className="text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/login" className="text-primary hover:underline">
                    Sign in
                  </Link>
                </p>
                <p className="mt-2 text-muted-foreground">
                  Want to create and share lists?{" "}
                  <Link to="/signup" className="text-primary hover:underline">
                    Become a verified member
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-xs text-muted-foreground">
            By signing up, you agree to our terms of service and privacy policy.
          </div>
        </div>
      </div>
    </>
  );
}