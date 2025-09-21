import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { FriendSuggestions } from "@/components/FriendSuggestions";
import { NotificationCenter } from "@/components/NotificationCenter";

const Dashboard = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [userName, setUserName] = useState<string>("");
  const [listCount, setListCount] = useState<number>(0);
  const [recentLists, setRecentLists] = useState<Array<{ id: string; title: string; created_at: string }>>([]);

useEffect(() => {
  let mounted = true;
  (async () => {
    try {
      // Robust auth check with timeout fallback
      
      let session = null;
      try {
        // Try getSession with timeout first
        const getSessionTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getSession timeout')), 5000)
        );
        
        const sessionResult = await Promise.race([
          supabase.auth.getSession(), 
          getSessionTimeout
        ]);
        session = sessionResult.data?.session;
        
        if (!session) {
          // Fallback to getUser if getSession fails
          const getUserTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('getUser timeout')), 5000)
          );
          
          const userResult = await Promise.race([
            supabase.auth.getUser(),
            getUserTimeout
          ]);
          
          if (userResult.data?.user) {
            // Create minimal session from user data
            session = {
              user: userResult.data.user,
              access_token: 'present'
            };
          }
        }
      } catch (error) {
        console.warn("Dashboard auth calls timed out:", error.message);
        // Route guards ensure authenticated users only reach this point
      }
      
      if (!mounted) return;
      
      // If no session but we're on a protected route, show fallback state
      if (!session?.user) {
        setUserName("User");
        setListCount(0);
        setRecentLists([]);
        setChecking(false);
        return;
      }
      const userId = session.user.id;
      const isAdmin = session.user.email?.toLowerCase() === "sharonjoseph2010@gmail.com";

      let profile = null;
      let profileError = null;
      
      try {
        // Add timeout to profile query
        const profileTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Profile query timeout')), 5000)
        );
        
        const profileResult = await Promise.race([
          supabase
            .from("profiles")
            .select("full_name, handle, is_verified")
            .eq("id", userId)
            .maybeSingle(),
          profileTimeout
        ]);
        profile = profileResult.data;
        profileError = profileResult.error;
      } catch (error) {
        console.warn("Dashboard profile query failed:", error.message);
        // Continue without profile data
      }

      if (!mounted) return;
      if (!profile) {
        if (isAdmin) {
          // Admin can access without profile
        } else {
          navigate("/profile-setup", { replace: true, state: { internal: true, from: "/dashboard" } });
          return;
        }
      }

      const name = (profile?.full_name as string) || (profile?.handle as string) || (session.user.email ?? "User");
      setUserName(name);

      // Lists count query with timeout
      try {
        const countTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Lists count timeout')), 5000)
        );
        
        const countResult = await Promise.race([
          supabase
            .from("lists")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", userId),
          countTimeout
        ]);
        const { count, error: countError } = countResult;
        if (countError) {
          console.warn("Dashboard lists count error:", countError);
        }
        setListCount(count ?? 0);
      } catch (error) {
        console.warn("Dashboard lists count query failed:", error.message);
        setListCount(0);
      }

      // Recent lists query with timeout
      try {
        const recentTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Recent lists timeout')), 5000)
        );
        
        const recentResult = await Promise.race([
          supabase
            .from("lists")
            .select("id,title,created_at")
            .eq("owner_id", userId)
            .order("created_at", { ascending: false })
            .limit(3),
          recentTimeout
        ]);
        const { data: recent, error: recentError } = recentResult;
        if (recentError) {
          console.warn("Dashboard recent lists error:", recentError);
        }
        setRecentLists((recent ?? []) as any);
      } catch (error) {
        console.warn("Dashboard recent lists query failed:", error.message);
        setRecentLists([]);
      }

      setChecking(false);
      
    } catch (error) {
      console.error("Dashboard load failed:", error.message);
      
      // Set fallback values and continue
      if (!mounted) return;
      
      setUserName("User");
      setListCount(0);
      setRecentLists([]);
      setChecking(false);
    }
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
