import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("verification_status")
          .eq("id", session.user.id)
          .maybeSingle();
        if (!mounted) return;
        if (!profile || profile.verification_status !== "verified") {
          navigate("/verify", { replace: true });
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <>
      <Helmet>
        <title>Antelog — Trusted Lists</title>
        <meta name="description" content="Discover and share trusted, verified lists. Create your account to join Antelog." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen flex items-center justify-center bg-background">
        <section className="text-center space-y-6">
          <h1 className="text-4xl font-bold">Welcome to Antelog</h1>
          <p className="text-xl text-muted-foreground">A people‑powered directory of verified recommendations.</p>
          <div>
            <Button asChild size="lg">
              <Link to="/signup">Create account</Link>
            </Button>
          </div>
        </section>
      </main>
    </>
  );
};

export default Index;
