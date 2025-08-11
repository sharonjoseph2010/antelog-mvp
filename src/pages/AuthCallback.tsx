import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";

const AuthCallback = () => {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        window.location.replace("/verify");
      }
    });

    // Handle case where session is already set from URL hash
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location.replace("/verify");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <Helmet>
        <title>Email verification | Antelog</title>
        <meta name="description" content="Completing your Antelog email verification." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <section className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-2">Verifying your email…</h1>
          <p className="text-muted-foreground">Please wait while we complete the sign-in. You will be redirected.</p>
        </section>
      </main>
    </>
  );
};

export default AuthCallback;
