import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const Dashboard = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session?.user) {
        navigate("/login", { replace: true });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("verification_status, full_name")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!mounted) return;
      if (!profile) {
        navigate("/profile-setup", { replace: true });
        return;
      }
      setChecking(false);
    })();
    return () => { setChecking(false); mounted = false; };
  }, [navigate]);

  return (
    <>
      <Helmet>
        <title>Dashboard | Antelog</title>
        <meta name="description" content="Your Antelog dashboard." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <section className="w-full max-w-2xl text-center space-y-6">
          {checking ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <>
              <h1 className="text-3xl font-bold">Welcome to Antelog</h1>
              <p className="text-muted-foreground">We’ll add list features next.</p>
              <Button onClick={async () => { await supabase.auth.signOut(); navigate("/", { replace: true }); }}>Sign out</Button>
            </>
          )}
        </section>
      </main>
    </>
  );
};

export default Dashboard;
