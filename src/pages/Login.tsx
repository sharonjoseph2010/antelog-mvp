import { useState, useEffect } from "react";
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
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [shouldBlockLogin, setShouldBlockLogin] = useState(false);
  const navigate = useNavigate();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  // Check if user is already authenticated
  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        // Add timeout to prevent hanging
        const authTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth check timeout')), 5000)
        );
        
        const { data: { session }, error } = await Promise.race([
          supabase.auth.getSession(),
          authTimeout
        ]);
        
        if (session?.user && !error) {
          console.log("User already authenticated, redirecting to dashboard");
          navigate("/dashboard", { replace: true });
          return;
        }
        
        // Double check with getUser as fallback
        try {
          const getUserTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('getUser timeout')), 3000)
          );
          
          const { data: userData, error: userError } = await Promise.race([
            supabase.auth.getUser(),
            getUserTimeout
          ]);
          
          if (userData?.user && !userError) {
            console.log("User authenticated via getUser, redirecting to dashboard");
            navigate("/dashboard", { replace: true });
            return;
          }
        } catch (userCheckError) {
          console.warn("getUser check failed:", userCheckError.message);
        }
        
      } catch (error) {
        console.warn("Auth check error:", error.message);
        // Continue to login form if auth check fails or times out
      }
      
      setCheckingAuth(false);
    };

    checkExistingAuth();
  }, [navigate]);

  const postLoginRedirect = async (existingSession = null) => {
    
    try {
      let session = existingSession;
      
      if (!existingSession) {
        // Add timeout to getSession as well
        const getSessionTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getSession timeout after 10 seconds')), 10000)
        );
        
        const sessionResult = await Promise.race([
          supabase.auth.getSession(), 
          getSessionTimeout
        ]);

        session = sessionResult.data?.session;
      }
      const userId = session?.user?.id;
      
      if (!userId) {
        return;
      }

      // Add timeout to profile query
      const profileQueryTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile query timeout after 10 seconds')), 10000)
      );
      
      const profileResult = await Promise.race([
        supabase
          .from("profiles")
          .select("full_name, handle, verification_status")
          .eq("id", userId)
          .maybeSingle(),
        profileQueryTimeout
      ]);

      const { data: profile, error } = profileResult;

      if (error) {
        console.log("Profile query error - redirecting to profile-setup:", error);
        navigate("/profile-setup", { replace: true });
        return;
      }

      // No profile or missing essentials -> setup
      if (!profile || !profile.full_name || !profile.handle) {
        console.log("Profile missing or incomplete - redirecting to profile-setup:", {
          hasProfile: !!profile,
          hasFullName: !!profile?.full_name,
          hasHandle: !!profile?.handle,
          profile: profile
        });
        navigate("/profile-setup", { replace: true });
        return;
      }

      console.log("Profile complete, checking verification:", profile.verification_status);

      if (profile.verification_status === "verified") {
        console.log("User verified - redirecting to dashboard");
        navigate("/dashboard", { replace: true });
        return;
      }

      // Otherwise pending/rejected -> verify
      console.log("User not verified - redirecting to verify");
      navigate("/verify", { replace: true });
      
    } catch (error) {
      console.warn("Post-login redirect error:", error.message);
      // Fallback to dashboard navigation
      navigate("/dashboard", { replace: true });
    }
  };

  const onSubmit = async (values: LoginValues) => {
    // Prevent form submission if login is blocked
    if (shouldBlockLogin) {
      console.log("Login submission blocked - user already authenticated");
      toast.success("Already logged in!");
      navigate("/dashboard", { replace: true });
      return;
    }
    
    setLoading(true);
    
    try {
      // Double-check auth state before attempting login with timeout
      console.log("Checking auth state before login attempt...");
      try {
        const preAuthTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Pre-login auth check timeout')), 3000)
        );
        
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          preAuthTimeout
        ]);
        
        if (session?.user) {
          console.log("User already authenticated during login attempt, redirecting...");
          toast.success("Already logged in!");
          setShouldBlockLogin(true);
          navigate("/dashboard", { replace: true });
          setLoading(false);
          return;
        }
      } catch (checkError) {
        console.warn("Pre-login auth check failed:", checkError.message);
        // Continue with login attempt only if no other auth state detected
      }
      
      // Final safety check - prevent signInWithPassword if any blocking state
      if (shouldBlockLogin) {
        console.log("Login blocked during pre-auth check");
        toast.success("Already logged in!");
        navigate("/dashboard", { replace: true });
        setLoading(false);
        return;
      }
      
      console.log("Proceeding with login attempt...");
      
      // Add timeout to prevent infinite hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('signInWithPassword timeout after 30 seconds')), 30000)
      );
      
      const signInPromise = supabase.auth.signInWithPassword({
        email: values.email.toLowerCase(),
        password: values.password,
      });
      
      const authResult = await Promise.race([signInPromise, timeoutPromise]);

      const { data, error } = authResult;

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
        
        try {
          // Try the proper post-login redirect with timeout
          const redirectTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('postLoginRedirect timeout')), 10000)
          );
          
          await Promise.race([
            postLoginRedirect(),
            redirectTimeout
          ]);
        } catch (redirectError) {
          console.warn("Post-login redirect failed, using fallback:", redirectError.message);
          navigate("/dashboard", { replace: true });
        }
        
        setLoading(false);
        return;
      }

      toast.error("Could not sign in. Please try again.");
      setLoading(false);
      
    } catch (e) {
      console.error("Login error:", e);
      toast.error("Something went wrong. Please try again.");
      setLoading(false);
    }
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

  // Show loading while checking existing authentication
  if (checkingAuth) {
    return (
      <>
        <Helmet>
          <title>Sign in | Antelog</title>
        </Helmet>
        <main className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-muted-foreground">Checking authentication...</p>
          </div>
        </main>
      </>
    );
  }

  // Additional safeguard: quick auth check every few seconds while on login page
  useEffect(() => {
    const quickAuthCheck = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setShouldBlockLogin(true);
          console.log("Login form blocked - user authenticated");
          toast.success("Already logged in!");
          navigate("/dashboard", { replace: true });
        }
      } catch (error) {
        console.warn("Quick auth check failed:", error.message);
      }
    };
    
    // Run initial check
    quickAuthCheck();
    
    // Set up periodic check while on login page
    const interval = setInterval(quickAuthCheck, 2000);
    
    return () => clearInterval(interval);
  }, [navigate, setShouldBlockLogin]);

  if (shouldBlockLogin) {
    return (
      <>
        <Helmet>
          <title>Sign in | Antelog</title>
        </Helmet>
        <main className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-muted-foreground">Already logged in, redirecting...</p>
          </div>
        </main>
      </>
    );
  }

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

                  <Button type="submit" className="w-full" disabled={loading || shouldBlockLogin}>
                    {shouldBlockLogin ? "Already logged in..." : loading ? "Signing in…" : "Sign in"}
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
