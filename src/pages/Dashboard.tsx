import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { FriendSuggestions } from "@/components/FriendSuggestions";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Users } from "lucide-react";

const Dashboard = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [userName, setUserName] = useState<string>("");
  const [listCount, setListCount] = useState<number>(0);
  const [recentLists, setRecentLists] = useState<Array<{ id: string; title: string; created_at: string }>>([]);
  const [hasImportedContacts, setHasImportedContacts] = useState<boolean>(true);

useEffect(() => {
  let mounted = true;
  (async () => {
    console.info("[Dashboard] Checking session...");
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    console.info("[Dashboard] getSession:", { hasSession: !!session, userId: session?.user?.id, sessionError });
    if (!mounted) return;
    if (!session?.user) {
      console.info("[Dashboard] No session, redirecting to /login");
      navigate("/login", { replace: true });
      return;
    }

    const userId = session.user.id;
    const isAdmin = session.user.email?.toLowerCase() === "sharonjoseph2010@gmail.com";

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, handle, is_verified")
      .eq("id", userId)
      .maybeSingle();
    console.info("[Dashboard] Profile lookup:", { profile, profileError });

    if (!mounted) return;
    if (!profile) {
      if (isAdmin) {
        console.info("[Dashboard] No profile found but user is admin — allowing dashboard access.");
      } else {
        console.info("[Dashboard] Missing profile, redirecting to /profile-setup with internal state");
        navigate("/profile-setup", { replace: true, state: { internal: true, from: "/dashboard" } });
        return;
      }
    }

    const name = (profile?.full_name as string) || (profile?.handle as string) || (session.user.email ?? "there");
    setUserName(name);

    const { count, error: countError } = await supabase
      .from("lists")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId);
    if (countError) {
      console.warn("[Dashboard] lists count error", countError);
    }
    setListCount(count ?? 0);

    const { data: recent, error: recentError } = await supabase
      .from("lists")
      .select("id,title,created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);
    if (recentError) {
      console.warn("[Dashboard] recent lists error", recentError);
    }
    setRecentLists((recent ?? []) as any);

    // Check if user has imported contacts
    const { count: contactCount } = await supabase
      .from("contact_imports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    setHasImportedContacts((contactCount ?? 0) > 0);

    setChecking(false);
  })();
  return () => { setChecking(false); mounted = false; };
}, [navigate]);

return (
  <>
    <Helmet>
      <title>Dashboard | Antelog</title>
      <meta name="description" content="Overview of your lists and quick actions." />
      <link rel="canonical" href={window.location.href} />
    </Helmet>
    <main className="min-h-screen bg-background px-4 py-10">
      <section className="mx-auto w-full max-w-4xl space-y-6">
        {checking ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <>
            <header className="space-y-1">
              <h1 className="text-3xl font-bold">Welcome back{userName ? `, ${userName}` : ""}!</h1>
              <p className="text-muted-foreground">Here’s a quick snapshot of your activity.</p>
            </header>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Your Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="text-3xl font-semibold">{listCount}</div>
                  <div className="text-muted-foreground">lists</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link to="/lists/new">{listCount === 0 ? "Create Your First List" : "Create New List"}</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/lists">View My Lists</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Friend Suggestions and Notifications */}
            <div className="grid gap-6 lg:grid-cols-2">
              <FriendSuggestions />
              <NotificationCenter />
            </div>

            {recentLists.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Recent Lists</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <ul className="space-y-2">
                    {recentLists.map((l) => (
                      <li key={l.id} className="flex items-center justify-between">
                        <Link to={`/lists/${l.id}`} className="text-primary underline-offset-4 hover:underline">
                          {l.title}
                        </Link>
                        <span className="text-sm text-muted-foreground">
                          {new Date(l.created_at).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </section>
    </main>
  </>
);
};

export default Dashboard;
