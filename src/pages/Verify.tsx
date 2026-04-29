import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Profile = {
  verification_status: "pending" | "verified" | "rejected";
};

const Verify = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    // Block direct access unless coming from internal flow
    const state: any = (window.history.state && (window.history.state.usr || window.history.state.state)) || {};
    if (!(state && state.internal === true)) {
      navigate("/dashboard", { replace: true });
      return;
    }
  }, [navigate]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session?.user) {
        navigate("/signup", { replace: true });
        return;
      }

      const { data: p } = await supabase
        .from("profiles")
        .select("verification_status")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!mounted) return;
      if (p) {
        setProfile(p as unknown as Profile);
        if ((p as unknown as Profile).verification_status === "verified") {
          navigate("/dashboard", { replace: true });
        }
      }
    })();
    return () => { mounted = false; };
  }, [navigate]);

  const statusBanner = useMemo(() => {
    if (!profile) return null;
    const status = profile.verification_status;
    if (status === "verified") return null;
    if (status === "pending") return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground">
        Your verification is pending. You'll be notified once approved.
      </div>
    );
    if (status === "rejected") return (
      <div className="rounded-md border p-3 text-sm text-destructive">
        Your previous submission was rejected. Please contact support.
      </div>
    );
    return null;
  }, [profile]);

  return (
    <>
      <Helmet>
        <title>Verification | Antelog</title>
        <meta name="description" content="Verification status for your Antelog account." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <section className="w-full max-w-md">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Verification</CardTitle>
              <CardDescription>
                Your account verification status.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {statusBanner}
              <Button className="w-full" onClick={() => navigate("/dashboard")}>
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    </>
  );
};

export default Verify;
