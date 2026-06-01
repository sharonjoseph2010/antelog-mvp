import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Inbox,
  MessageSquare,
  Plus,
  Target,
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
      return "/friends";
    case "contact_joined":
    case "network_addition":
    case "friend_suggestion":
      return "/contacts";
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
  const [contactsCount, setContactsCount] = useState(0);

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

      // Imported contacts count
      const { count: importedCount } = await supabase
        .from("contact_imports")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      setContactsCount(importedCount || 0);

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

      <div style={{ backgroundColor: "var(--color-background-tertiary)", minHeight: "100vh" }}>
      <div className="mx-auto flex w-full max-w-[1240px] flex-col px-6 py-10 lg:px-10 lg:py-12">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-1 flex-col space-y-10">
            <div className="flex-1 space-y-10">
            {(() => {
              const isNewUser = openRequestCount === 0 && activity.length === 0;
              return isNewUser ? (
                <NewUserLayout
                  firstName={firstName}
                  contactsCount={contactsCount}
                  networkCount={networkCount}
                  listCount={listCount}
                  latestConnection={latestConnection}
                />
              ) : (
                <ReturningLayout
                  firstName={firstName}
                  openRequestCount={openRequestCount}
                  newResponses={newResponses}
                  pendingRequests={pendingRequests}
                  networkCount={networkCount}
                  latestConnection={latestConnection}
                  recentLists={recentLists}
                  listCount={listCount}
                  newItems={newItems}
                  earlierItems={earlierItems}
                />
              );
            })()}
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

function ActionButtons() {
  return (
    <div className="grid gap-3 md:grid-cols-[1.35fr_1fr]">
      <Link
        to="/requests/new"
        className="group flex items-start gap-4 rounded-lg p-5 transition-opacity hover:opacity-90 dark:border-[0.5px] dark:border-white/[0.14]"
        style={{ backgroundColor: "#0A0A0A", color: "#FFFFFF" }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px]" style={{ border: "1px solid rgba(255,255,255,0.2)", color: "#FFFFFF" }}>
          <Plus className="h-5 w-5" strokeWidth={1.5} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[15px] font-medium">
            Create a request
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
          </span>
          <span className="mt-1 block text-[12px]" style={{ color: "rgba(255,255,255,0.72)" }}>
            Ask your circle for the best of anything — answers from people you trust.
          </span>
        </span>
      </Link>
      <Link
        to="/directory"
        className="group flex items-start gap-4 rounded-lg border border-border bg-background p-5 text-foreground transition-colors hover:bg-muted/40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-border text-muted-foreground">
          <BookOpen className="h-5 w-5" strokeWidth={1.5} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[15px] font-medium">
            Master Directory
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
          </span>
          <span className="mt-1 block text-[12px] text-muted-foreground">
            Verified lists ranked by real people. No ads, no influencers.
          </span>
        </span>
      </Link>
    </div>
  );
}

function TrioCard({
  to,
  icon: Icon,
  label,
  meta,
  info,
  dot,
  dormant,
  description,
  variant,
}: {
  to?: string;
  icon: LucideIcon;
  label: string;
  meta?: string;
  info?: boolean;
  dot?: boolean;
  dormant?: boolean;
  description?: string;
  variant?: "recede" | "forward";
}) {
  const base =
    "relative flex h-full flex-col justify-between gap-4 rounded-lg p-5 transition-colors";
  const recede = variant === "recede";
  const forward = variant === "forward";
  const cardStyle: React.CSSProperties = recede
    ? { backgroundColor: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)" }
    : forward
    ? { backgroundColor: "var(--color-background-primary)", border: "0.5px solid var(--color-border-primary)" }
    : { backgroundColor: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)" };
  const iconBorder = "0.5px solid var(--color-border-secondary)";
  const iconCls = dormant ? "text-muted-foreground/60" : "text-foreground";
  const content = (
    <>
      <div className="flex items-start justify-between">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-[8px] ${iconCls}`}
          style={{ border: iconBorder }}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </span>
        {dot && (
          <span
            aria-label="New"
            className="inline-block h-[7px] w-[7px] rounded-full"
            style={{ backgroundColor: "var(--color-text-primary)" }}
          />
        )}
      </div>
      <div className="space-y-1">
        <div className={`text-[13px] font-medium ${dormant ? "text-muted-foreground" : "text-foreground"}`}>
          {label}
        </div>
        {meta && <div className="text-[12px] text-muted-foreground">{meta}</div>}
        {description && (
          <div className="text-[12px] text-muted-foreground">{description}</div>
        )}
      </div>
    </>
  );
  if (!to) {
    return <div className={`${base} cursor-default`} style={cardStyle}>{content}</div>;
  }
  return (
    <Link to={to} className={`${base} hover:opacity-95`} style={cardStyle}>
      {content}
    </Link>
  );
}

function RequestTrio({
  openRequestCount,
  newResponses,
  pendingCount,
  pendingFromName,
  pendingHasNew,
  forYouCount,
}: {
  openRequestCount: number;
  newResponses: number;
  pendingCount: number;
  pendingFromName?: string;
  pendingHasNew: boolean;
  forYouCount: number;
}) {
  return (
    <div className="grid items-stretch gap-3 md:grid-cols-3">
      <TrioCard
        to="/requests?filter=mine"
        icon={ArrowUpRight}
        label="You asked"
        variant="recede"
        meta={`${openRequestCount} open · ${newResponses > 0 ? `${newResponses} new ${newResponses === 1 ? "reply" : "replies"}` : "no new replies"}`}
      />
      <TrioCard
        to="/requests?filter=incoming"
        icon={Inbox}
        label="Asked of you"
        variant="forward"
        dot={pendingHasNew}
        meta={
          pendingCount > 0
            ? `${pendingFromName ?? "Someone"} · ${pendingCount} waiting on your answer`
            : "Nothing waiting on you"
        }
      />
      <TrioCard
        to="/for-you"
        icon={Target}
        label="For you"
        variant="forward"
        dot={forYouCount > 0}
        meta={`${forYouCount} match your interests`}
      />
    </div>
  );
}

function DormantTrio() {
  return (
    <div className="grid items-stretch gap-3 md:grid-cols-3">
      <TrioCard
        icon={ArrowUpRight}
        label="You asked"
        dormant
        variant="recede"
        description="Requests you create show up here."
      />
      <TrioCard
        icon={Inbox}
        label="Asked of you"
        dormant
        variant="forward"
        description="When someone in your network asks you, it lands here."
      />
      <TrioCard
        to="/profile"
        icon={Target}
        label="For you"
        variant="forward"
        description="Add your interests to get matched with requests you can answer →"
      />
    </div>
  );
}

function NetworkCard({
  networkCount,
  latestConnection,
  showAdd,
}: {
  networkCount: number;
  latestConnection: { name: string; at: Date } | null;
  showAdd?: boolean;
}) {
  return (
    <section
      className="space-y-3 rounded-lg p-5"
      style={{ backgroundColor: "var(--color-text-primary)", border: "none" }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-medium" style={{ color: "var(--color-background-primary)" }}>
          Your network
        </h2>
        <Link
          to="/network"
          className="text-[12px] hover:opacity-80"
          style={{ color: "rgba(255,255,255,0.7)" }}
        >
          {networkCount} →
        </Link>
      </div>
      {latestConnection ? (
        <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>
          Most recent: <span style={{ color: "var(--color-background-primary)" }}>{latestConnection.name}</span>
          {" · "}{formatRelative(latestConnection.at)}
        </p>
      ) : (
        <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>No connections yet.</p>
      )}
      {showAdd && (
        <Link
          to="/contacts"
          className="inline-block text-[12px] underline underline-offset-2 hover:opacity-80"
          style={{ color: "var(--color-background-primary)" }}
        >
          + Add more contacts
        </Link>
      )}
    </section>
  );
}

function RecentListsCard({
  recentLists,
  listCount,
}: {
  recentLists: RecentList[];
  listCount: number;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-background p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-foreground">Your recent lists</h2>
        <Link to="/lists" className="text-[12px] text-muted-foreground hover:text-foreground">
          All {listCount} →
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {recentLists.slice(0, 3).map((l) => (
          <li key={l.id}>
            <Link
              to={`/lists/${l.id}`}
              className="group flex items-center justify-between gap-3 py-2.5 transition-colors hover:opacity-80"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{l.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatShortDate(l.updated_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GetStartedCard({
  contactsCount,
  networkCount,
}: {
  contactsCount: number;
  networkCount: number;
}) {
  const contactsDone = contactsCount > 0 || networkCount > 0;
  const requestDone = false; // new-user gate already ensures 0 requests
  const answersDone = false;
  const doneCount = [contactsDone, requestDone, answersDone].filter(Boolean).length;

  const steps: Array<{
    state: "done" | "active" | "pending";
    icon: LucideIcon;
    title: string;
    meta: string;
    to?: string;
  }> = [
    {
      state: contactsDone ? "done" : "active",
      icon: contactsDone ? Check : Users,
      title: "Add your contacts",
      meta: contactsDone ? `Done — ${Math.max(contactsCount, networkCount)} connected` : "Import to find people you know",
      to: "/contacts",
    },
    {
      state: contactsDone ? "active" : "pending",
      icon: Plus,
      title: "Create your first request",
      meta: "Ask your circle anything",
      to: contactsDone ? "/requests/new" : undefined,
    },
    {
      state: "pending",
      icon: MessageSquare,
      title: "Get your first answers",
      meta: "They'll show up here as they come in",
    },
  ];

  return (
    <section className="rounded-lg border border-border bg-background p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-foreground">Get started</h2>
        <span className="text-[12px] text-muted-foreground">{doneCount} of 3 done</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => {
          const inner = (
            <div className="flex h-full items-start gap-3 rounded-lg border border-border bg-background p-4">
              <span
                className={
                  s.state === "done"
                    ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--success-fg,142_70%_38%))] text-background"
                    : s.state === "active"
                    ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
                    : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground"
                }
              >
                <s.icon className="h-4 w-4" strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <div className={`text-[13px] font-medium ${s.state === "pending" ? "text-muted-foreground" : "text-foreground"}`}>
                  {s.title}
                </div>
                <div className="mt-0.5 text-[12px] text-muted-foreground">{s.meta}</div>
              </div>
            </div>
          );
          return s.to ? (
            <Link key={i} to={s.to} className="block transition-opacity hover:opacity-80">
              {inner}
            </Link>
          ) : (
            <div key={i}>{inner}</div>
          );
        })}
      </div>
    </section>
  );
}

function NewUserLayout({
  firstName,
  contactsCount,
  networkCount,
  listCount,
  latestConnection,
}: {
  firstName: string;
  contactsCount: number;
  networkCount: number;
  listCount: number;
  latestConnection: { name: string; at: Date } | null;
}) {
  return (
    <>
      <header className="space-y-2">
        <h1 className="text-[26px] font-medium tracking-tight text-foreground">
          Welcome to Antelog, {firstName}.
        </h1>
        <p className="text-[14px] text-muted-foreground">
          Two things to do here: ask your circle for recommendations, and browse lists from verified people.
        </p>
      </header>

      <ActionButtons />

      <GetStartedCard contactsCount={contactsCount} networkCount={networkCount} />

      <div className="space-y-3">
        <p className="text-[12px] uppercase tracking-wider text-muted-foreground">
          What you'll see here as you go
        </p>
        <DormantTrio />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section
          className="space-y-3 rounded-lg p-5"
          style={{ backgroundColor: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)" }}
        >
          <h2 className="text-[13px] font-medium text-foreground">Recent activity</h2>
          <div className="text-[13px] text-muted-foreground">
            Send your first request and activity will start showing up here.
          </div>
        </section>
        <div className="space-y-3">
          <NetworkCard networkCount={networkCount} latestConnection={latestConnection} showAdd />
          {listCount > 0 ? (
            <RecentListsCard recentLists={[]} listCount={listCount} />
          ) : (
            <section className="rounded-lg border border-dashed border-border bg-background p-5 text-[13px] text-muted-foreground">
              Your lists will appear here once you make one.
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function ReturningLayout({
  firstName,
  openRequestCount,
  newResponses,
  pendingRequests,
  networkCount,
  latestConnection,
  recentLists,
  listCount,
  newItems,
  earlierItems,
}: {
  firstName: string;
  openRequestCount: number;
  newResponses: number;
  pendingRequests: PendingRequest[];
  networkCount: number;
  latestConnection: { name: string; at: Date } | null;
  recentLists: RecentList[];
  listCount: number;
  newItems: ActivityItem[];
  earlierItems: ActivityItem[];
}) {
  const pendingTotal = pendingRequests.reduce((sum, r) => sum + 1, 0);
  return (
    <>
      <header className="space-y-2">
        <h1 className="text-[26px] font-medium tracking-tight text-foreground">
          Welcome back, {firstName}.
        </h1>
        <p className="text-[14px] text-muted-foreground">
          {openRequestCount} open {openRequestCount === 1 ? "request" : "requests"} · {networkCount} {networkCount === 1 ? "person" : "people"} in your network.
        </p>
      </header>

      <ActionButtons />

      <RequestTrio
        openRequestCount={openRequestCount}
        newResponses={newResponses}
        pendingCount={pendingTotal}
        pendingFromName={pendingRequests[0]?.asker_name}
        pendingHasNew={pendingTotal > 0}
        forYouCount={0}
      />

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section
          className="space-y-5 rounded-lg p-5"
          style={{ backgroundColor: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)" }}
        >
          <h2 className="text-[13px] font-medium text-foreground">Recent activity</h2>
          {newItems.length === 0 && earlierItems.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Nothing yet. When your network responds to a request, it'll show up here.
            </p>
          ) : (
            <div className="activity-scroll space-y-6 overflow-y-auto pr-1" style={{ maxHeight: 440 }}>
              {newItems.length > 0 && <ActivityGroup label="NEW" items={newItems} />}
              {earlierItems.length > 0 && <ActivityGroup label="EARLIER" items={earlierItems} />}
            </div>
          )}
        </section>
        <div className="space-y-3">
          <NetworkCard networkCount={networkCount} latestConnection={latestConnection} />
          {recentLists.length > 0 ? (
            <RecentListsCard recentLists={recentLists} listCount={listCount} />
          ) : (
            <section className="rounded-lg border border-dashed border-border bg-background p-5 text-[13px] text-muted-foreground">
              Your lists will appear here once you make one.
            </section>
          )}
        </div>
      </div>
    </>
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
