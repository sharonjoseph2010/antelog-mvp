import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowRight,
  Inbox,
  List as ListIcon,
  MessageSquare,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";

interface ActivityItem {
  id: string;
  kind: "response" | "request" | "friend" | "notification";
  title: string;
  subtitle?: string;
  href: string;
  at: Date;
}

interface OpenRequest {
  id: string;
  title: string;
  created_at: string;
  response_count: number;
}

interface Suggestion {
  id: string;
  suggested_user_id: string;
  full_name: string;
  handle: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [newResponses, setNewResponses] = useState(0);
  const [openRequestCount, setOpenRequestCount] = useState(0);
  const [listCount, setListCount] = useState(0);
  const [networkCount, setNetworkCount] = useState(0);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [openRequests, setOpenRequests] = useState<OpenRequest[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session?.user) {
        navigate("/login", { replace: true });
        return;
      }
      const userId = session.user.id;

      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [
        profRes,
        openReqRes,
        listCountRes,
        friendsRes,
        suggestionRes,
      ] = await Promise.all([
        supabase.from("profiles").select("full_name, handle").eq("id", userId).maybeSingle(),
        supabase
          .from("requests")
          .select("id, title, created_at")
          .eq("creator_id", userId)
          .eq("status", "open")
          .order("created_at", { ascending: false }),
        supabase.from("lists").select("id", { count: "exact", head: true }).eq("owner_id", userId),
        supabase
          .from("friendships")
          .select("id", { count: "exact", head: true })
          .or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
        supabase
          .from("friend_suggestions")
          .select("id, suggested_user_id, created_at")
          .eq("user_id", userId)
          .eq("is_dismissed", false)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

      if (!mounted) return;

      const prof = profRes.data;
      const displayName = (prof?.full_name as string) || (prof?.handle as string) || "there";
      setFirstName(displayName.split(" ")[0]);

      const allOpen = (openReqRes.data || []) as Array<{ id: string; title: string; created_at: string }>;
      setOpenRequestCount(allOpen.length);
      const openIds = allOpen.map((r) => r.id);

      let recentResponses: Array<{ id: string; request_id: string; responder_id: string; created_at: string }> = [];
      if (openIds.length > 0) {
        const { data: respData } = await supabase
          .from("request_responses")
          .select("id, request_id, responder_id, created_at")
          .in("request_id", openIds)
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(50);
        recentResponses = (respData || []) as typeof recentResponses;
      }
      setNewResponses(recentResponses.length);

      // Response counts per open request (top 3 most recent)
      const top3 = allOpen.slice(0, 3);
      const responseCounts: Record<string, number> = {};
      if (top3.length) {
        const ids3 = top3.map((r) => r.id);
        const { data: allResp } = await supabase
          .from("request_responses")
          .select("id, request_id")
          .in("request_id", ids3);
        (allResp || []).forEach((r: any) => {
          responseCounts[r.request_id] = (responseCounts[r.request_id] || 0) + 1;
        });
      }
      setOpenRequests(
        top3.map((r) => ({ ...r, response_count: responseCounts[r.id] || 0 }))
      );

      setListCount(listCountRes.count || 0);
      setNetworkCount(friendsRes.count || 0);

      // Suggestions: enrich with profile
      const sList = (suggestionRes.data || []) as Array<{ id: string; suggested_user_id: string }>;
      if (sList.length > 0) {
        const ids = sList.map((s) => s.suggested_user_id);
        const { data: sp } = await supabase
          .from("profiles")
          .select("id, full_name, handle")
          .in("id", ids);
        setSuggestions(
          sList.map((s) => {
            const p = sp?.find((x: any) => x.id === s.suggested_user_id);
            return {
              id: s.id,
              suggested_user_id: s.suggested_user_id,
              full_name: (p?.full_name as string) || "Someone",
              handle: (p?.handle as string) || "",
            };
          })
        );
      }

      // Build activity stream from responses + recent notifications
      const activityItems: ActivityItem[] = [];

      // Get responder names
      const responderIds = Array.from(new Set(recentResponses.map((r) => r.responder_id)));
      let responderMap: Record<string, string> = {};
      if (responderIds.length) {
        const { data: rp } = await supabase
          .from("profiles")
          .select("id, full_name, handle")
          .in("id", responderIds);
        (rp || []).forEach((p: any) => {
          responderMap[p.id] = (p.full_name as string) || (p.handle as string) || "Someone";
        });
      }
      const reqTitleMap: Record<string, string> = {};
      allOpen.forEach((r) => (reqTitleMap[r.id] = r.title));

      recentResponses.forEach((r) => {
        activityItems.push({
          id: `resp-${r.id}`,
          kind: "response",
          title: `${responderMap[r.responder_id] || "Someone"} responded`,
          subtitle: reqTitleMap[r.request_id],
          href: `/requests/${r.request_id}`,
          at: new Date(r.created_at),
        });
      });

      const { data: notifs } = await supabase
        .from("notifications")
        .select("id, title, message, created_at, type, metadata")
        .eq("user_id", userId)
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(20);
      (notifs || []).forEach((n: any) => {
        activityItems.push({
          id: `notif-${n.id}`,
          kind: "notification",
          title: n.title,
          subtitle: n.message,
          href: "/dashboard",
          at: new Date(n.created_at),
        });
      });

      activityItems.sort((a, b) => b.at.getTime() - a.at.getTime());
      setActivity(activityItems.slice(0, 20));

      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  const groupedActivity = groupActivityByDate(activity);

  return (
    <>
      <Helmet>
        <title>Dashboard | Antelog</title>
        <meta name="description" content="Your recommendations, requests, and network activity." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      <div className="mx-auto w-full max-w-[860px] px-6 py-10 lg:px-10 lg:py-12">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-10">
            {/* 1. Welcome header */}
            <header className="space-y-2">
              <h1 className="text-[32px] font-semibold tracking-tight text-foreground">
                Welcome back, {firstName}.
              </h1>
              <p className="text-[14px] text-muted-foreground">
                {newResponses > 0
                  ? `${newResponses} new ${newResponses === 1 ? "response" : "responses"} this week`
                  : "No new activity this week"}
                {" · "}
                {openRequestCount} open {openRequestCount === 1 ? "request" : "requests"}
                {" · "}
                {networkCount} in your network
              </p>
            </header>

            {/* 2. Black summary bar */}
            <Link
              to="/requests/new"
              className="group flex items-center justify-between rounded-lg bg-foreground px-5 py-4 text-background transition-opacity hover:opacity-90"
            >
              <span className="text-[14px]">
                <span className="font-medium">{newResponses}</span> new{" "}
                {newResponses === 1 ? "response" : "responses"} ·{" "}
                <span className="font-medium">{openRequestCount}</span> open{" "}
                {openRequestCount === 1 ? "request" : "requests"}
              </span>
              <span className="flex items-center gap-1.5 text-[13px]">
                Ask your network
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
              </span>
            </Link>

            {/* 3. Three softened stat cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard icon={ListIcon} label="Lists" value={listCount} to="/lists" />
              <StatCard icon={Inbox} label="Open Requests" value={openRequestCount} to="/requests" />
              <StatCard icon={Users} label="Network" value={networkCount} to="/friends" />
            </div>

            {/* 4. Recent activity */}
            <section className="space-y-5">
              <h2 className="text-[15px] font-medium text-foreground">Recent activity</h2>
              {activity.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Nothing yet. When your network responds to a request, it'll show up here.</p>
              ) : (
                <div className="space-y-6">
                  {(["TODAY", "EARLIER THIS WEEK", "EARLIER THIS MONTH"] as const).map((bucket) =>
                    groupedActivity[bucket].length > 0 ? (
                      <div key={bucket} className="space-y-3">
                        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {bucket.replace(/_/g, " ")}
                        </div>
                        <ul className="space-y-2">
                          {groupedActivity[bucket].map((a) => (
                            <li key={a.id}>
                              <Link
                                to={a.href}
                                className="-mx-2 flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
                              >
                                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
                                  {a.kind === "response" ? (
                                    <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  ) : (
                                    <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[14px] text-foreground">{a.title}</span>
                                  {a.subtitle && (
                                    <span className="block truncate text-[13px] text-muted-foreground">{a.subtitle}</span>
                                  )}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </section>

            {/* 5. Continue where you left off — black panel */}
            {openRequests.length > 0 && (
              <section className="rounded-lg bg-foreground p-6 text-background">
                <h2 className="text-[15px] font-medium">Continue where you left off</h2>
                <ul className="mt-4 divide-y divide-background/10">
                  {openRequests.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={`/requests/${r.id}`}
                        className="group flex items-center justify-between gap-4 py-3 transition-opacity hover:opacity-80"
                      >
                        <span className="min-w-0 flex-1 truncate text-[14px]">{r.title}</span>
                        <span className="flex items-center gap-3 text-[12px] text-background/70">
                          <span>
                            {r.response_count} {r.response_count === 1 ? "response" : "responses"}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 6. People you may know */}
            {suggestions.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-[15px] font-medium text-foreground">People you may know</h2>
                <ul className="space-y-2">
                  {suggestions.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-medium text-foreground">
                          {(s.full_name || s.handle || "?").trim().charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[14px] text-foreground">{s.full_name}</div>
                          <div className="truncate text-[12px] text-muted-foreground">@{s.handle}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => connect(s.suggested_user_id, s.id, setSuggestions)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-muted"
                      >
                        <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Connect
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 7. Trust foundation footer band */}
            <section className="rounded-lg border border-border bg-muted/30 p-6">
              <div className="flex items-start gap-4">
                <Shield className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <div className="space-y-2">
                  <h3 className="text-[14px] font-medium text-foreground">Built on real trust</h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Every recommendation on Antelog comes from someone in your network — friends, friends of friends, real people.
                    {" "}No ads. No influencers. No fake reviews.
                    {" "}Just answers from people you'd actually listen to.
                  </p>
                  <Link
                    to="/"
                    className="inline-flex items-center gap-1 text-[13px] text-foreground underline-offset-4 hover:underline"
                  >
                    Learn about trust
                    <ArrowRight className="h-3 w-3" strokeWidth={1.5} />
                  </Link>
                </div>
              </div>
            </section>

            {/* 8. Page footer */}
            <footer className="flex flex-col items-start justify-between gap-2 border-t border-border pt-6 text-[12px] text-muted-foreground sm:flex-row sm:items-center">
              <span>© 2026 Antelog · network powered</span>
              <nav className="flex items-center gap-4">
                <Link to="/" className="hover:text-foreground">About</Link>
                <Link to="/" className="hover:text-foreground">Privacy</Link>
                <Link to="/" className="hover:text-foreground">Terms</Link>
                <Link to="/" className="hover:text-foreground">Help</Link>
              </nav>
            </footer>
          </div>
        )}
      </div>
    </>
  );
};

function StatCard({
  icon: Icon,
  label,
  value,
  to,
}: {
  icon: typeof ListIcon;
  label: string;
  value: number;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 transition-colors hover:bg-muted/40"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground">
        <Icon className="h-4 w-4" strokeWidth={1.5} />
      </span>
      <span className="flex flex-col">
        <span className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="text-[20px] font-normal text-foreground">{value}</span>
      </span>
    </Link>
  );
}

async function connect(
  targetId: string,
  suggestionId: string,
  setSuggestions: React.Dispatch<React.SetStateAction<Suggestion[]>>
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("friend_requests").insert({
    requester_id: user.id,
    addressee_id: targetId,
    status: "pending",
  });
  await supabase
    .from("friend_suggestions")
    .update({ is_dismissed: true })
    .eq("id", suggestionId);
  setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
}

function groupActivityByDate(items: ActivityItem[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenAgo = now.getTime() - 7 * 86400000;
  const thirtyAgo = now.getTime() - 30 * 86400000;
  const groups: Record<"TODAY" | "EARLIER THIS WEEK" | "EARLIER THIS MONTH", ActivityItem[]> = {
    TODAY: [],
    "EARLIER THIS WEEK": [],
    "EARLIER THIS MONTH": [],
  };
  for (const it of items) {
    const t = it.at.getTime();
    if (t >= startOfToday) groups.TODAY.push(it);
    else if (t >= sevenAgo) groups["EARLIER THIS WEEK"].push(it);
    else if (t >= thirtyAgo) groups["EARLIER THIS MONTH"].push(it);
  }
  return groups;
}

export default Dashboard;
