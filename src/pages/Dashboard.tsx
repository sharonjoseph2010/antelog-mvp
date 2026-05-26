import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowRight,
  Inbox,
  List as ListIcon,
  MessageSquare,
  Users,
  UserCheck,
  UserPlus,
  Star,
  type LucideIcon,
} from "lucide-react";

interface ActivityItem {
  id: string;
  kind: "response" | "notification";
  iconType: "response" | "vote" | "friend_accepted" | "contact_joined" | "other";
  title: string;
  subtitle?: string;
  href: string;
  at: Date;
  isRead: boolean;
}

interface OpenRequest {
  id: string;
  title: string;
  created_at: string;
  response_count: number;
}

interface PendingRequest {
  id: string;
  title: string;
  asker_name: string;
  response_count: number;
}

interface RecentList {
  id: string;
  title: string;
  updated_at: string;
}

function getIconType(notifType: string): ActivityItem["iconType"] {
  switch (notifType) {
    case "friend_request_accepted":
    case "connection_accepted":
      return "friend_accepted";
    case "contact_joined":
    case "network_addition":
    case "friend_suggestion":
      return "contact_joined";
    case "recommendation_voted":
    case "vote":
    case "endorsement":
      return "vote";
    case "request_response":
    case "response":
    case "new_request":
    case "forwarded_request":
    case "request_forwarded":
    case "forward":
      return "response";
    default:
      return "other";
  }
}

function getNotifLink(type: string, metadata: any, relatedUserId: string | null): string {
  const meta = metadata || {};
  switch (type) {
    case "request_response":
    case "response":
    case "vote":
    case "recommendation_voted":
    case "forwarded_request":
    case "request_forwarded":
    case "forward":
    case "new_request":
    case "endorsement":
    case "forward_suggestion":
      return meta.request_id ? `/requests/${meta.request_id}/respond` : "/requests";
    case "friend_request":
    case "connection_request":
      return relatedUserId ? `/friend-request/${relatedUserId}` : "/friends";
    case "friend_request_accepted":
    case "connection_accepted":
      return relatedUserId ? `/profile/${relatedUserId}` : "/friends";
    case "contact_joined":
    case "network_addition":
    case "friend_suggestion":
      return "/friends";
    default:
      return "/notifications";
  }
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [newResponses, setNewResponses] = useState(0);
  const [openRequestCount, setOpenRequestCount] = useState(0);
  const [listCount, setListCount] = useState(0);
  const [networkCount, setNetworkCount] = useState(0);
  const [latestConnection, setLatestConnection] = useState<{ name: string; at: Date } | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [openRequests, setOpenRequests] = useState<OpenRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [recentLists, setRecentLists] = useState<RecentList[]>([]);

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

      const [profRes, openReqRes, listCountRes, friendsRes, recentListsRes] = await Promise.all([
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
          .select("id, user1_id, user2_id")
          .or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
        supabase
          .from("lists")
          .select("id, title, updated_at")
          .eq("owner_id", userId)
          .order("updated_at", { ascending: false })
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
      setOpenRequests(top3.map((r) => ({ ...r, response_count: responseCounts[r.id] || 0 })));

      setListCount(listCountRes.count || 0);

      // Friend ids
      const friendships = (friendsRes.data || []) as Array<{ user1_id: string; user2_id: string }>;
      setNetworkCount(friendships.length);
      const friendIds = friendships.map((f) => (f.user1_id === userId ? f.user2_id : f.user1_id));

      // Most recently connected friend
      if (friendIds.length > 0) {
        const { data: latestFr } = await supabase
          .from("friendships")
          .select("user1_id, user2_id, created_at")
          .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestFr) {
          const otherId = latestFr.user1_id === userId ? latestFr.user2_id : latestFr.user1_id;
          const { data: op } = await supabase
            .from("profiles")
            .select("full_name, handle")
            .eq("id", otherId)
            .maybeSingle();
          const name = (op?.full_name as string) || (op?.handle as string) || "Someone";
          setLatestConnection({ name, at: new Date(latestFr.created_at) });
        }
      }

      // Recent lists
      setRecentLists((recentListsRes.data || []) as RecentList[]);

      // Requests waiting on you: from friends, status open, not responded, not own
      if (friendIds.length > 0) {
        const { data: networkReqs } = await supabase
          .from("requests")
          .select("id, title, creator_id, created_at")
          .in("creator_id", friendIds)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(15);

        const reqIds = (networkReqs || []).map((r: any) => r.id);
        let respondedSet = new Set<string>();
        if (reqIds.length) {
          const { data: myResps } = await supabase
            .from("request_responses")
            .select("request_id")
            .eq("responder_id", userId)
            .in("request_id", reqIds);
          respondedSet = new Set((myResps || []).map((r: any) => r.request_id));
        }
        const pending = (networkReqs || []).filter((r: any) => !respondedSet.has(r.id)).slice(0, 3);

        if (pending.length) {
          const creatorIds = Array.from(new Set(pending.map((r: any) => r.creator_id)));
          const { data: creatorProfiles } = await supabase
            .from("profiles")
            .select("id, full_name, handle")
            .in("id", creatorIds);
          const nameMap: Record<string, string> = {};
          (creatorProfiles || []).forEach((p: any) => {
            nameMap[p.id] = (p.full_name as string) || (p.handle as string) || "Someone";
          });
          const { data: respCounts } = await supabase
            .from("request_responses")
            .select("request_id")
            .in("request_id", pending.map((r: any) => r.id));
          const countMap: Record<string, number> = {};
          (respCounts || []).forEach((r: any) => {
            countMap[r.request_id] = (countMap[r.request_id] || 0) + 1;
          });
          setPendingRequests(
            pending.map((r: any) => ({
              id: r.id,
              title: r.title,
              asker_name: nameMap[r.creator_id] || "Someone",
              response_count: countMap[r.id] || 0,
            }))
          );
        }
      }

      // Activity stream
      const activityItems: ActivityItem[] = [];

      const responderIds = Array.from(new Set(recentResponses.map((r) => r.responder_id)));
      const responderMap: Record<string, string> = {};
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
          iconType: "response",
          title: `${responderMap[r.responder_id] || "Someone"} responded`,
          subtitle: reqTitleMap[r.request_id],
          href: `/requests/${r.request_id}/respond`,
          at: new Date(r.created_at),
          isRead: false,
        });
      });

      const { data: notifs } = await supabase
        .from("notifications")
        .select("id, title, message, created_at, type, metadata, related_user_id, is_read")
        .eq("user_id", userId)
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(30);
      (notifs || []).forEach((n: any) => {
        activityItems.push({
          id: `notif-${n.id}`,
          kind: "notification",
          iconType: getIconType(n.type),
          title: n.title,
          subtitle: n.message,
          href: getNotifLink(n.type, n.metadata, n.related_user_id),
          at: new Date(n.created_at),
          isRead: !!n.is_read,
        });
      });

      activityItems.sort((a, b) => b.at.getTime() - a.at.getTime());
      setActivity(activityItems.slice(0, 30));

      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  const newItems = activity.filter((a) => !a.isRead);
  const earlierItems = activity.filter((a) => a.isRead);

  return (
    <>
      <Helmet>
        <title>Dashboard | Antelog</title>
        <meta name="description" content="Your recommendations, requests, and network activity." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      <style>{`
        .activity-scroll::-webkit-scrollbar { width: 8px; }
        .activity-scroll::-webkit-scrollbar-track { background: transparent; }
        .activity-scroll::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 4px; }
        .activity-scroll::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground) / 0.4); }
      `}</style>

      <div className="mx-auto flex w-full max-w-[1240px] flex-col px-6 py-10 lg:px-10 lg:py-12" style={{ minHeight: "100vh" }}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-1 flex-col space-y-10">
            <div className="flex-1 space-y-10">
            {/* Welcome header */}
            <header className="space-y-2">
              <h1 className="text-[26px] font-medium tracking-tight text-foreground">
                Welcome back, {firstName}.
              </h1>
              <p className="text-[14px] text-muted-foreground">
                {networkCount === 0
                  ? "You have no connections yet. Import your contacts to get started."
                  : openRequestCount === 0
                  ? `You have ${networkCount} ${networkCount === 1 ? "person" : "people"} in your network. Ask them something.`
                  : `You have ${openRequestCount} open ${openRequestCount === 1 ? "request" : "requests"} and ${networkCount} ${networkCount === 1 ? "person" : "people"} in your network.`}
              </p>
            </header>

            {/* Black summary bar */}
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
                Get recommendations from people you trust
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
              </span>
            </Link>

            {/* Stat cards */}
            <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_1fr]">
              <Link
                to="/friends"
                className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-background p-5 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-border bg-background text-muted-foreground">
                    <Users className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                      Your Network
                    </span>
                    <span className="text-[28px] font-normal leading-tight text-foreground">{networkCount}</span>
                  </span>
                </div>
                {latestConnection && (
                  <div className="text-[12px] text-muted-foreground">
                    <span className="text-foreground">{latestConnection.name}</span>
                    {" · "}connected {formatRelative(latestConnection.at)}
                  </div>
                )}
              </Link>
              <StatCardSmall icon={MessageSquare} label="New Responses" value={newResponses} to="/requests?status=open" />
              <StatCardSmall icon={Inbox} label="Open Requests" value={openRequestCount} to="/requests?status=open" />
            </div>

            {/* Two-column body */}
            <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
              {/* Left: Recent activity */}
              <section className="space-y-5">
                <h2 className="text-[15px] font-medium text-foreground">Recent activity</h2>
                {activity.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    Nothing yet. When your network responds to a request, it'll show up here.
                  </p>
                ) : (
                  <div
                    className="activity-scroll space-y-6 overflow-y-auto pr-1"
                    style={{ maxHeight: 440 }}
                  >
                    {newItems.length > 0 && (
                      <ActivityGroup label="NEW" items={newItems} />
                    )}
                    {earlierItems.length > 0 && (
                      <ActivityGroup label="EARLIER" items={earlierItems} />
                    )}
                  </div>
                )}
              </section>

              {/* Right column */}
              <div className="space-y-6">
                {openRequests.length > 0 && (
                  <section className="rounded-lg bg-foreground p-6 text-background">
                    <h2 className="text-[15px] font-medium">Continue where you left off</h2>
                    <ul className="mt-4 divide-y divide-background/10">
                      {openRequests.map((r) => (
                        <li key={r.id}>
                          <Link
                            to={`/requests/${r.id}/respond`}
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
                    <Link
                      to="/requests"
                      className="mt-4 inline-flex items-center gap-1 text-[12px] text-background/80 hover:text-background"
                    >
                      View all requests
                      <ArrowRight className="h-3 w-3" strokeWidth={1.5} />
                    </Link>
                  </section>
                )}

                {/* Requests waiting on you */}
                <section className="space-y-3 rounded-lg border border-border bg-background p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-medium text-foreground">
                      Requests waiting on you
                    </h2>
                    <Link to="/requests" className="text-[12px] text-muted-foreground hover:text-foreground">
                      View all →
                    </Link>
                  </div>
                  {pendingRequests.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">
                      When someone in your network asks a question you can answer, it'll show up here.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {pendingRequests.map((r) => (
                        <li key={r.id}>
                          <Link
                            to={`/requests/${r.id}/respond`}
                            className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                          >
                            <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">{r.title}</span>
                            <span className="flex shrink-0 items-center gap-3 text-[12px] text-muted-foreground">
                              <span>{r.asker_name} · {r.response_count} {r.response_count === 1 ? "response" : "responses"}</span>
                              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Your recent lists */}
                <section className="space-y-3 rounded-lg border border-border bg-background p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-medium text-foreground">
                      Your recent lists
                    </h2>
                    <Link to="/lists" className="text-[12px] text-muted-foreground hover:text-foreground">
                      All {listCount} →
                    </Link>
                  </div>
                  {recentLists.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-[13px] text-muted-foreground">
                        Lists are your saved recommendations — best cafes, gear you trust, places to stay.
                      </p>
                      <p className="text-[13px] text-muted-foreground">
                        <Link to="/lists/new" className="underline underline-offset-2 hover:text-foreground">
                          Save your first recommendations →
                        </Link>
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {recentLists.map((l) => (
                        <li key={l.id}>
                          <Link
                            to={`/lists/${l.id}`}
                            className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                          >
                            <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">{l.title}</span>
                            <span className="flex shrink-0 items-center gap-3 text-[12px] text-muted-foreground">
                              <span>{formatShortDate(l.updated_at)}</span>
                              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
            </div>

            <footer className="flex flex-col items-start justify-between gap-2 border-t border-border pt-6 text-[12px] text-muted-foreground sm:flex-row sm:items-center">
              <span>© 2026 Antelog · People powered</span>
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

function ActivityGroup({ label, items }: { label: string; items: ActivityItem[] }) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id}>
            <Link
              to={a.href}
              className="-mx-2 flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
                <ActivityIcon type={a.iconType} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-foreground">{a.title}</span>
                {a.subtitle && (
                  <span className="block truncate text-[13px] text-muted-foreground">{a.subtitle}</span>
                )}
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {formatRelative(a.at)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityIcon({ type }: { type: ActivityItem["iconType"] }) {
  const cls = "h-3.5 w-3.5";
  switch (type) {
    case "friend_accepted":
      return <UserCheck className={cls} strokeWidth={1.5} />;
    case "contact_joined":
      return <UserPlus className={cls} strokeWidth={1.5} />;
    case "vote":
      return <Star className={cls} strokeWidth={1.5} />;
    case "response":
      return <MessageSquare className={cls} strokeWidth={1.5} />;
    default:
      return <Inbox className={cls} strokeWidth={1.5} />;
  }
}

function StatCardSmall({
  icon: Icon,
  label,
  value,
  to,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 rounded-lg bg-muted/50 p-5 transition-colors hover:bg-muted"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-background text-muted-foreground">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
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

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default Dashboard;
