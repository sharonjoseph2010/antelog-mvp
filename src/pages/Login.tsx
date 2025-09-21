import { useState, useEffect, useRef } from "react";
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
  const authListenerRef = useRef(null);
  const loginAttemptRef = useRef(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  // Cleanup auth listener on unmount
  useEffect(() => {
    return () => {
      if (authListenerRef.current) {
        console.log("🔍 [DEBUG] Cleaning up auth listener");
        supabase.removeChannel(authListenerRef.current);
      }
    };
  }, []);

  const postLoginRedirect = async (existingSession = null) => {
    console.log("🔍 [DEBUG] Starting postLoginRedirect", { hasExistingSession: !!existingSession });
    
    try {
      let session = existingSession;
      
      if (!existingSession) {
        console.log("🔍 [DEBUG] No existing session, calling supabase.auth.getSession()");
        
        // Add timeout to getSession as well
        const getSessionTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getSession timeout after 10 seconds')), 10000)
        );
        
        const getSessionPromise = supabase.auth.getSession();
        console.log("🔍 [DEBUG] Racing getSession with timeout...");
        
        const sessionResult = await Promise.race([getSessionPromise, getSessionTimeout]);
        console.log("🔍 [DEBUG] getSession() completed. Result:", {
          hasData: !!sessionResult.data,
          hasSession: !!sessionResult.data?.session,
          hasUser: !!sessionResult.data?.session?.user,
          userId: sessionResult.data?.session?.user?.id,
          error: sessionResult.error
        });

        session = sessionResult.data?.session;
      } else {
        console.log("🔍 [DEBUG] Using existing session from auth state change");
      }
      const userId = session?.user?.id;
      
      if (!userId) {
        console.log("🔍 [DEBUG] No userId found, returning early");
        return;
      }

      console.log("🔍 [DEBUG] About to query profiles table for userId:", userId);
      console.log("🔍 [DEBUG] Current auth state before profile query:", {
        isAuthenticated: !!session,
        userEmail: session?.user?.email,
        accessToken: session?.access_token ? "present" : "missing"
      });

      const profileQueryStart = Date.now();
      
      // Add timeout to profile query
      const profileQueryTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile query timeout after 10 seconds')), 10000)
      );
      
      const profileQueryPromise = supabase
        .from("profiles")
        .select("full_name, handle, verification_status")
        .eq("id", userId)
        .maybeSingle();
      
      console.log("🔍 [DEBUG] Racing profile query with timeout...");
      const profileResult = await Promise.race([profileQueryPromise, profileQueryTimeout]);
      
      const profileQueryDuration = Date.now() - profileQueryStart;
      console.log("🔍 [DEBUG] Profile query completed in", profileQueryDuration, "ms");
      console.log("🔍 [DEBUG] Profile query result:", {
        hasData: !!profileResult.data,
        profile: profileResult.data,
        error: profileResult.error,
        errorCode: profileResult.error?.code,
        errorMessage: profileResult.error?.message,
        errorDetails: profileResult.error?.details,
        errorHint: profileResult.error?.hint
      });

      const { data: profile, error } = profileResult;

      if (error) {
        console.log("🔍 [DEBUG] Profile query error, navigating to profile-setup");
        console.log("🔍 [DEBUG] Error details:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        navigate("/profile-setup", { replace: true });
        return;
      }

      // No profile or missing essentials -> setup
      if (!profile || !profile.full_name || !profile.handle) {
        console.log("🔍 [DEBUG] No profile or missing essentials, navigating to profile-setup");
        console.log("🔍 [DEBUG] Profile state:", {
          hasProfile: !!profile,
          hasFullName: !!profile?.full_name,
          hasHandle: !!profile?.handle
        });
        navigate("/profile-setup", { replace: true });
        return;
      }

      console.log("🔍 [DEBUG] Profile found, checking verification status:", profile.verification_status);

      if (profile.verification_status === "verified") {
        console.log("🔍 [DEBUG] User is verified, navigating to dashboard");
        navigate("/dashboard", { replace: true });
        return;
      }

      // Otherwise pending/rejected -> verify
      console.log("🔍 [DEBUG] User not verified, navigating to verify page");
      navigate("/verify", { replace: true });
      
    } catch (error) {
      console.error("🔍 [ERROR] Exception in postLoginRedirect:", error);
      console.error("🔍 [ERROR] Error stack:", error.stack);
      console.error("🔍 [ERROR] Error details:", {
        name: error.name,
        message: error.message,
        cause: error.cause
      });
      
      // Instead of throwing, let's navigate to dashboard as fallback
      console.log("🔍 [DEBUG] Exception caught, falling back to dashboard navigation");
      navigate("/dashboard", { replace: true });
      return;
    }
    
    console.log("🔍 [DEBUG] postLoginRedirect completed successfully");
  };

  const onSubmit = async (values: LoginValues) => {
    console.log("🔍 [DEBUG] ========== LOGIN ATTEMPT STARTED ==========");
    console.log("🔍 [DEBUG] Form values:", { email: values.email, hasPassword: !!values.password });
    
    setLoading(true);
    console.log("🔍 [DEBUG] Loading state set to true");
    
    try {
      console.log("🔍 [DEBUG] About to call supabase.auth.signInWithPassword");
      const signInStart = Date.now();
      
      // Add timeout to prevent infinite hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('signInWithPassword timeout after 30 seconds')), 30000)
      );
      
      const signInPromise = supabase.auth.signInWithPassword({
        email: values.email.toLowerCase(),
        password: values.password,
      });
      
      console.log("🔍 [DEBUG] Racing signIn promise with timeout...");
      const authResult = await Promise.race([signInPromise, timeoutPromise]);
      
      const signInDuration = Date.now() - signInStart;
      console.log("🔍 [DEBUG] signInWithPassword completed in", signInDuration, "ms");
      console.log("🔍 [DEBUG] Auth result:", {
        hasData: !!authResult.data,
        hasUser: !!authResult.data?.user,
        hasSession: !!authResult.data?.session,
        userId: authResult.data?.user?.id,
        userEmail: authResult.data?.user?.email,
        hasError: !!authResult.error,
        errorMessage: authResult.error?.message
      });

      const { data, error } = authResult;

      if (error) {
        console.log("🔍 [DEBUG] Sign-in error detected:", error);
        const msg =
          error.message?.toLowerCase().includes("invalid login")
            ? "Invalid email or password."
            : error.message;
        toast.error(msg);
        setLoading(false);
        console.log("🔍 [DEBUG] Loading state set to false (error case)");
        return;
      }

      if (data?.user) {
        console.log("🔍 [DEBUG] Sign-in successful, user data received");
        console.log("🔍 [DEBUG] User details:", {
          id: data.user.id,
          email: data.user.email,
          emailConfirmed: data.user.email_confirmed_at,
          lastSignIn: data.user.last_sign_in_at
        });
        
        toast.success("Welcome back!");
        console.log("🔍 [DEBUG] Success toast shown, about to call postLoginRedirect");
        
        try {
          const redirectStart = Date.now();
          await postLoginRedirect();
          const redirectDuration = Date.now() - redirectStart;
          console.log("🔍 [DEBUG] postLoginRedirect completed successfully in", redirectDuration, "ms");
        } catch (redirectError) {
          console.error("🔍 [ERROR] postLoginRedirect failed:", redirectError);
          console.error("🔍 [ERROR] Redirect error details:", {
            name: redirectError.name,
            message: redirectError.message,
            stack: redirectError.stack
          });
          // Don't throw, just navigate to a safe page
          console.log("🔍 [DEBUG] Falling back to dashboard navigation");
          navigate("/dashboard", { replace: true });
        }
        
        console.log("🔍 [DEBUG] All post-login logic completed");
        setLoading(false);
        console.log("🔍 [DEBUG] Loading state set to false (success case)");
        return;
      }

      console.log("🔍 [DEBUG] No user data in response, showing error");
      toast.error("Could not sign in. Please try again.");
      setLoading(false);
      console.log("🔍 [DEBUG] Loading state set to false (no user case)");
      
    } catch (e) {
      console.error("🔍 [ERROR] Exception in onSubmit:", e);
      console.error("🔍 [ERROR] Exception details:", {
        name: e.name,
        message: e.message,
        stack: e.stack
      });
      toast.error("Something went wrong. Please try again.");
      setLoading(false);
      console.log("🔍 [DEBUG] Loading state set to false (exception case)");
    }
    
    console.log("🔍 [DEBUG] ========== LOGIN ATTEMPT ENDED ==========");
  };

  // Alternative login method using auth state changes
  const onSubmitAlternative = async (values: LoginValues) => {
    console.log("🔍 [DEBUG] ========== ALTERNATIVE LOGIN ATTEMPT STARTED ==========");
    console.log("🔍 [DEBUG] Form values:", { email: values.email, hasPassword: !!values.password });
    
    setLoading(true);
    loginAttemptRef.current = true;
    
    try {
      // Set up auth listener before making the call
      console.log("🔍 [DEBUG] Setting up auth state listener...");
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log("🔍 [DEBUG] Auth state change during login:", event, {
          hasSession: !!session,
          userId: session?.user?.id,
          loginAttemptActive: loginAttemptRef.current
        });
        
        if (event === 'SIGNED_IN' && loginAttemptRef.current && session?.user) {
          console.log("🔍 [DEBUG] Login successful via auth state change!");
          loginAttemptRef.current = false;
          
          // Clean up listener
          supabase.removeChannel(subscription);
          
          toast.success("Welcome back!");
          
          try {
            // Let's try a simple redirect first to test if navigation works
            console.log("🔍 [DEBUG] Testing simple navigation to dashboard...");
            navigate("/dashboard", { replace: true });
            console.log("🔍 [DEBUG] Simple navigation called");
            
            // Uncomment this to test the full postLoginRedirect flow:
            // await postLoginRedirect(session);
            // console.log("🔍 [DEBUG] Alternative login completed successfully");
          } catch (redirectError) {
            console.error("🔍 [ERROR] Redirect failed in alternative login:", redirectError);
            navigate("/dashboard", { replace: true });
          }
          
          setLoading(false);
        }
      });
      
      authListenerRef.current = subscription;
      
      // Now make the sign-in call (don't await it)
      console.log("🔍 [DEBUG] Making signInWithPassword call (no await)...");
      supabase.auth.signInWithPassword({
        email: values.email.toLowerCase(),
        password: values.password,
      }).then((result) => {
        console.log("🔍 [DEBUG] signInWithPassword eventually resolved:", {
          hasData: !!result.data,
          hasUser: !!result.data?.user,
          hasError: !!result.error,
          error: result.error?.message
        });
        
        if (result.error && loginAttemptRef.current) {
          console.log("🔍 [DEBUG] Sign-in error in alternative method:", result.error);
          loginAttemptRef.current = false;
          setLoading(false);
          supabase.removeChannel(subscription);
          
          const msg = result.error.message?.toLowerCase().includes("invalid login")
            ? "Invalid email or password."
            : result.error.message;
          toast.error(msg);
        }
      }).catch((error) => {
        console.error("🔍 [ERROR] signInWithPassword threw exception:", error);
        if (loginAttemptRef.current) {
          loginAttemptRef.current = false;
          setLoading(false);
          supabase.removeChannel(subscription);
          toast.error("Something went wrong. Please try again.");
        }
      });
      
      // Set a fallback timeout
      setTimeout(() => {
        if (loginAttemptRef.current) {
          console.log("🔍 [DEBUG] Alternative login timeout reached");
          loginAttemptRef.current = false;
          setLoading(false);
          supabase.removeChannel(subscription);
          toast.error("Login timeout. Please try again.");
        }
      }, 15000);
      
    } catch (e) {
      console.error("🔍 [ERROR] Exception in alternative login:", e);
      loginAttemptRef.current = false;
      setLoading(false);
      toast.error("Something went wrong. Please try again.");
    }
    
    console.log("🔍 [DEBUG] ========== ALTERNATIVE LOGIN SETUP COMPLETED ==========");
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
                <form onSubmit={form.handleSubmit(onSubmitAlternative)} className="space-y-6">
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
