import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, GitMerge, Mail, Network as NetworkIcon, Plus, Search, Send, Trash2, Upload, Users, UsersRound, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/* TYPOGRAPHY SYSTEM — Antelog defaults
 * Page title (h1):   26px / 500 / -0.01em letter-spacing
 * Page subtitle:     14px / 400 / muted-foreground / line-height 1.5
 * Section header:    11px / 500 / 0.1em letter-spacing / uppercase / muted
 * Body text:         13-14px / 400 / foreground
 * Meta text:         11-12px / 400 / muted-foreground
 * Button text:       12-13px / 500
 */

type TabKey = "friends" | "to_add" | "to_invite" | "groups";

interface FriendRow {
  friendshipId: string;
  userId: string;
  fullName: string;
  handle: string;
  connectedAt: string;
}

interface ToAddRow {
  contactId: string;
  userId: string;
  fullName: string;
  handle: string;
  joinedAt: string;
  pending?: boolean;
}

interface ToInviteRow {
  contactId: string;
  name: string;
  phone: string | null;
}

interface Group {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
}

const Network = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [userHandle, setUserHandle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("friends");
  const [search, setSearch] = useState("");

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [toAdd, setToAdd] = useState<ToAddRow[]>([]);
  const [toInvite, setToInvite] = useState<ToInviteRow[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [hasAnyContacts, setHasAnyContacts] = useState(true);

  const [removing, setRemoving] = useState<FriendRow | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: prof } = await supabase
        .from("profiles")
        .select("handle")
        .eq("id", user.id)
        .maybeSingle();
      setUserHandle(prof?.handle || "");
      await loadAll(user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setGroupsLoading(true);
      try {
        const { data: groupsData } = await supabase
          .from("groups")
          .select("*")
          .eq("creator_id", userId)
          .order("created_at", { ascending: false });
        if (groupsData && groupsData.length > 0) {
          const groupIds = groupsData.map((g: any) => g.id);
          const { data: memberCounts } = await supabase
            .from("group_members")
            .select("group_id")
            .in("group_id", groupIds);
          const countsByGroup = (memberCounts || []).reduce((acc: Record<string, number>, member: any) => {
            acc[member.group_id] = (acc[member.group_id] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          const groupsWithCounts = groupsData.map((group: any) => ({
            ...group,
            member_count: countsByGroup[group.id] || 0,
          }));
          setGroups(groupsWithCounts);
        } else {
          setGroups([]);
        }
      } catch (err) {
        console.error("[Network] groups fetch error", err);
      } finally {
        setGroupsLoading(false);
      }
    })();
  }, [userId]);

  const loadAll = async (uid: string) => {
    setLoading(true);
    try {
      // Contacts the user has imported
      const { data: contacts } = await supabase
        .from("contact_imports")
        .select("id, contact_name, contact_phone, is_matched, matched_user_id")
        .eq("user_id", uid)
        .order("contact_name");

      setHasAnyContacts((contacts?.length ?? 0) > 0);

      // Friendships
      const { data: f1 } = await supabase
        .from("friendships")
        .select("id, user1_id, user2_id, created_at")
        .or(`user1_id.eq.${uid},user2_id.eq.${uid}`);

      const friendIds = (f1 || []).map((f) =>
        f.user1_id === uid ? f.user2_id : f.user1_id
      );

      let profilesById = new Map<string, { full_name: string | null; handle: string; created_at: string }>();
      const matchedUserIds = (contacts || [])
        .filter((c) => c.is_matched && c.matched_user_id)
        .map((c) => c.matched_user_id as string);
      const allProfileIds = Array.from(new Set([...friendIds, ...matchedUserIds]));
      if (allProfileIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, handle, created_at")
          .in("id", allProfileIds);
        for (const p of profs || []) {
          profilesById.set(p.id, {
            full_name: p.full_name,
            handle: p.handle,
            created_at: p.created_at,
          });
        }
      }

      const friendSet = new Set(friendIds);

      const friendRows: FriendRow[] = (f1 || []).map((f) => {
        const otherId = f.user1_id === uid ? f.user2_id : f.user1_id;
        const p = profilesById.get(otherId);
        return {
          friendshipId: f.id,
          userId: otherId,
          fullName: p?.full_name || "Unknown",
          handle: p?.handle || "",
          connectedAt: f.created_at,
        };
      });
      friendRows.sort((a, b) => +new Date(b.connectedAt) - +new Date(a.connectedAt));
      setFriends(friendRows);

      // To add: matched contacts not in friendships
      const toAddRows: ToAddRow[] = [];
      for (const c of contacts || []) {
        if (!c.is_matched || !c.matched_user_id) continue;
        if (c.matched_user_id === uid) continue;
        if (friendSet.has(c.matched_user_id)) continue;
        const p = profilesById.get(c.matched_user_id);
        toAddRows.push({
          contactId: c.id,
          userId: c.matched_user_id,
          fullName: p?.full_name || c.contact_name,
          handle: p?.handle || "",
          joinedAt: p?.created_at || "",
        });
      }
      // Check existing pending friend_requests so we don't double-send
      if (toAddRows.length > 0) {
        const targetIds = toAddRows.map((r) => r.userId);
        const { data: reqs } = await supabase
          .from("friend_requests")
          .select("requester_id, addressee_id, status")
          .or(
            `and(requester_id.eq.${uid},addressee_id.in.(${targetIds.join(",")})),and(addressee_id.eq.${uid},requester_id.in.(${targetIds.join(",")}))`
          );
        const pending = new Set<string>();
        for (const r of reqs || []) {
          if (r.status === "pending") {
            pending.add(r.requester_id === uid ? r.addressee_id : r.requester_id);
          }
        }
        for (const row of toAddRows) {
          if (pending.has(row.userId)) row.pending = true;
        }
      }
      setToAdd(toAddRows);

      // To invite: unmatched contacts
      const toInviteRows: ToInviteRow[] = (contacts || [])
        .filter((c) => !c.is_matched || !c.matched_user_id)
        .map((c) => ({
          contactId: c.id,
          name: c.contact_name,
          phone: c.contact_phone,
        }));
      setToInvite(toInviteRows);
    } catch (err) {
      console.error("[Network] loadAll error", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredFriends = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) => f.fullName.toLowerCase().includes(q) || f.handle.toLowerCase().includes(q)
    );
  }, [friends, search]);

  const filteredToAdd = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = toAdd.filter((r) => !dismissed.has(r.contactId));
    if (!q) return list;
    return list.filter(
      (r) => r.fullName.toLowerCase().includes(q) || r.handle.toLowerCase().includes(q)
    );
  }, [toAdd, search, dismissed]);

  const filteredToInvite = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return toInvite;
    return toInvite.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || (r.phone || "").toLowerCase().includes(q)
    );
  }, [toInvite, search]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, search]);

  const confirmRemove = async () => {
    if (!removing) return;
    const target = removing;
    setRemoving(null);
    const { error } = await supabase.from("friendships").delete().eq("id", target.friendshipId);
    if (error) {
      toast({ title: "Could not remove", description: error.message, variant: "destructive" });
      return;
    }
    setFriends((prev) => prev.filter((f) => f.friendshipId !== target.friendshipId));
    toast({ title: "Removed from your network" });
  };

  const handleConnect = async (row: ToAddRow) => {
    if (!userId) return;
    setToAdd((prev) =>
      prev.map((r) => (r.contactId === row.contactId ? { ...r, pending: true } : r))
    );
    try {
      const { data: existing } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("requester_id", userId)
        .eq("addressee_id", row.userId)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("friend_requests")
          .update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        const { error } = await supabase.from("friend_requests").insert({
          requester_id: userId,
          addressee_id: row.userId,
          status: "pending",
        });
        if (error) throw error;
      }
      // Notification (best-effort)
      const { data: me } = await supabase
        .from("profiles")
        .select("full_name, handle")
        .eq("id", userId)
        .maybeSingle();
      const displayName = me?.full_name || (me?.handle ? `@${me.handle}` : "Someone");
      await supabase.from("notifications").insert({
        user_id: row.userId,
        type: "friend_request",
        title: `${displayName} wants to add you to their network`,
        message: "You have a new connection request on Antelog.",
        related_user_id: userId,
        metadata: { requester_id: userId },
      });
      toast({ title: "Request sent" });
    } catch (e: any) {
      setToAdd((prev) =>
        prev.map((r) => (r.contactId === row.contactId ? { ...r, pending: false } : r))
      );
      toast({
        title: "Could not send request",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDismiss = (contactId: string) => {
    setDismissed((prev) => new Set(prev).add(contactId));
  };

  const buildInviteUrl = (row: ToInviteRow) => {
    const inviteLink = userHandle
      ? `https://antelog.com/invite/${userHandle}`
      : "https://antelog.com";
    const msg = `Hey ${row.name}, I'm on Antelog — a network of verified people sharing real recommendations. Join me: ${inviteLink}`;
    const phoneDigits = (row.phone || "").replace(/[^\d]/g, "");
    const base = phoneDigits ? `https://wa.me/${phoneDigits}` : "https://wa.me/";
    return `${base}?text=${encodeURIComponent(msg)}`;
  };

  // ------- Empty state (no contacts at all) -------
  if (!loading && !hasAnyContacts) {
    return (
      <>
        <Helmet>
        <title>Contacts — Antelog</title>
        </Helmet>
        <div className="mx-auto w-full max-w-[1240px] px-6 py-10">
          <PageHeader showImport={false} onImport={() => navigate("/contacts/import")} subtitle="Build your trusted network. Import your contacts to find who's already on Antelog." />
          <ImportCards onNavigate={() => navigate("/contacts/import")} />
          <p className="mt-10 text-center text-[12px] text-muted-foreground">
            Your contacts are private. We only use them to match you with friends already on Antelog.
          </p>
        </div>
      </>
    );
  }

  const counts = {
    friends: friends.length,
    to_add: toAdd.filter((r) => !dismissed.has(r.contactId)).length,
    to_invite: toInvite.length,
    groups: groups.length,
  };

  const placeholder =
    tab === "friends"
      ? "Search your friends"
      : tab === "to_add"
      ? "Search contacts on Antelog"
      : tab === "to_invite"
      ? "Search contacts to invite"
      : "Search your groups";

  return (
    <>
      <Helmet>
        <title>Contacts — Antelog</title>
        <meta name="description" content="Manage your imported contacts and grow your network." />
      </Helmet>
      <div className="mx-auto w-full max-w-[1240px] px-6 py-10">
        <PageHeader
          showImport
          onImport={() => navigate("/contacts/import")}
          subtitle="Manage your imported contacts and grow your network."
        />

        {/* Tabs */}
        <div className="mt-7 border-b border-border/70">
          <div className="flex items-center gap-1">
            <TabBtn active={tab === "friends"} onClick={() => setTab("friends")} label="1st network" count={counts.friends} icon={Users} />
            <TabBtn active={tab === "to_add"} onClick={() => setTab("to_add")} label="2nd network" count={counts.to_add} icon={GitMerge} />
            <TabBtn active={tab === "to_invite"} onClick={() => setTab("to_invite")} label="3rd+ network" count={counts.to_invite} icon={NetworkIcon} />
            <TabBtn active={tab === "groups"} onClick={() => setTab("groups")} label="Groups" count={counts.groups} icon={UsersRound} />
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-md bg-muted px-3 py-[10px] pl-[38px] text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Tab contents */}
        <div className="mt-6">
          {loading && tab !== "groups" ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">Loading…</p>
          ) : tab === "friends" ? (
            <FriendsList rows={filteredFriends} onRemove={(row) => setRemoving(row)} />
          ) : tab === "to_add" ? (
            <ToAddList
              total={counts.to_add}
              rows={filteredToAdd}
              onConnect={handleConnect}
              onDismiss={handleDismiss}
            />
          ) : tab === "to_invite" ? (
            <ToInviteList rows={filteredToInvite} buildInviteUrl={buildInviteUrl} />
          ) : (
            <GroupsList groups={filteredGroups} loading={groupsLoading} />
          )}
        </div>
      </div>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.fullName} from your network?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll no longer see each other's requests or recommendations as part of your 1st network.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

function PageHeader({
  showImport,
  onImport,
  subtitle,
}: {
  showImport: boolean;
  onImport: () => void;
  subtitle: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <h1
          className="text-foreground"
          style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em" }}
        >
          Contacts
        </h1>
        <p
          className="mt-2 text-muted-foreground"
          style={{ fontSize: 14, lineHeight: 1.5 }}
        >
          {subtitle}
        </p>
      </div>
      {showImport && (
        <button
          type="button"
          onClick={onImport}
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border/70 bg-transparent px-4 py-[10px] text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Upload className="h-[14px] w-[14px]" strokeWidth={1.5} />
          Import contacts
        </button>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  count,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon: React.ElementType;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2.5 px-4 py-3 text-[13px] transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
      style={active ? { fontWeight: 500 } : undefined}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
          active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="h-[15px] w-[15px]" strokeWidth={1.5} />
      </span>
      <span>{label}</span>
      <span
        className={cn(
          "rounded-full px-[7px] py-[1px] text-[11px]",
          active ? "bg-muted text-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {count}
      </span>
      {active && (
        <span
          className="absolute inset-x-3 -bottom-px h-[1.5px] bg-foreground"
          aria-hidden
        />
      )}
    </button>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[12px] font-medium text-foreground">
      {initial}
    </span>
  );
}

function FriendsList({
  rows,
  onRemove,
}: {
  rows: FriendRow[];
  onRemove: (row: FriendRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyTab message="No friends yet. Connect with contacts already on Antelog from the “To add” tab." />
    );
  }
  return (
    <ul className="divide-y divide-border/60">
      {rows.map((row) => (
        <li key={row.friendshipId} className="flex items-center gap-3 py-3">
          <Avatar name={row.fullName} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[14px] font-medium text-foreground">{row.fullName}</span>
              {row.handle && (
                <span className="text-[12px] text-muted-foreground">@{row.handle}</span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Connected since{" "}
              {new Date(row.connectedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>
          <Link
            to={`/profile/${row.userId}`}
            className="rounded-md border border-border/70 px-3 py-[6px] text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            View profile
          </Link>
          <button
            type="button"
            onClick={() => onRemove(row)}
            aria-label={`Remove ${row.fullName}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.5} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ToAddList({
  total,
  rows,
  onConnect,
  onDismiss,
}: {
  total: number;
  rows: ToAddRow[];
  onConnect: (row: ToAddRow) => void;
  onDismiss: (contactId: string) => void;
}) {
  if (total === 0) {
    return <EmptyTab message="No contacts waiting to be added. New matches will appear here as your contacts join Antelog." />;
  }
  return (
    <>
      <p className="mb-3 text-[11px] text-muted-foreground">
        {total} contact{total === 1 ? "" : "s"} joined Antelog but haven't connected with you yet
      </p>
      {rows.length === 0 ? (
        <EmptyTab message="No results match your search." />
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((row) => (
            <li key={row.contactId} className="flex items-center gap-3 py-3">
              <Avatar name={row.fullName} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-foreground">{row.fullName}</span>
                  {row.handle && (
                    <span className="text-[12px] text-muted-foreground">@{row.handle}</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {row.joinedAt
                    ? `Joined ${new Date(row.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · `
                    : ""}
                  in your contacts
                </div>
              </div>
              <button
                type="button"
                onClick={() => onConnect(row)}
                disabled={row.pending}
                className="rounded-md bg-foreground px-[14px] py-[6px] text-[12px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {row.pending ? "Request sent" : "Connect"}
              </button>
              <button
                type="button"
                onClick={() => onDismiss(row.contactId)}
                aria-label="Dismiss"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-[15px] w-[15px]" strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ToInviteList({
  rows,
  buildInviteUrl,
}: {
  rows: ToInviteRow[];
  buildInviteUrl: (row: ToInviteRow) => string;
}) {
  if (rows.length === 0) {
    return <EmptyTab message="No contacts to invite — everyone in your contacts is already on Antelog." />;
  }
  return (
    <>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Contacts who haven't joined yet. Send them an invite.
      </p>
      <ul className="divide-y divide-border/60">
        {rows.map((row) => (
          <li key={row.contactId} className="flex items-center gap-3 py-3">
            <Avatar name={row.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium text-foreground">{row.name}</div>
              <div className="text-[11px] text-muted-foreground">{row.phone || "No phone number"}</div>
            </div>
            <a
              href={buildInviteUrl(row)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-3 py-[6px] text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Send className="h-[13px] w-[13px]" strokeWidth={1.5} />
              Invite
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function GroupsList({
  groups,
  loading,
}: {
  groups: Group[];
  loading: boolean;
}) {
  if (loading) {
    return <EmptyTab message="Loading groups…" />;
  }
  if (groups.length === 0) {
    return <EmptyTab message="No groups yet. Create your first group to organize your friends." />;
  }
  return (
    <>
      <ul className="divide-y divide-border/60">
        {groups.map((group) => (
          <li key={group.id} className="flex items-center gap-3 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[12px] font-medium text-foreground">
              {(group.name || "?").trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link
                  to={`/groups/${group.id}`}
                  className="truncate text-[14px] font-medium text-foreground hover:underline"
                >
                  {group.name}
                </Link>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {group.member_count} member{group.member_count === 1 ? "" : "s"} · Created {new Date(group.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-md bg-muted px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[12px] text-muted-foreground">
            Create, edit, or manage your groups in the dedicated Groups page.
          </span>
          <Link
            to="/groups"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-foreground transition-colors hover:text-muted-foreground"
          >
            Go to Groups <ArrowRight className="h-3 w-3" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="py-10 text-center text-[13px] text-muted-foreground">{message}</div>
  );
}

function ImportCards({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-3">
      <ImportCard
        icon={<Mail className="h-5 w-5" strokeWidth={1.5} />}
        title="Google Contacts"
        description="Import directly from your Google account."
        primary
        actionLabel="Connect Google"
        helper="Most popular · easiest option"
        onClick={onNavigate}
      />
      <ImportCard
        icon={<Upload className="h-5 w-5" strokeWidth={1.5} />}
        title="Upload file"
        description="Import from a CSV or vCard (.vcf) file."
        actionLabel="Choose file"
        helper="Works on iPhone and Android"
        onClick={onNavigate}
      />
      <ImportCard
        icon={<Plus className="h-5 w-5" strokeWidth={1.5} />}
        title="Add manually"
        description="Enter contacts one by one."
        actionLabel="Add contact"
        helper="For 1–5 contacts"
        onClick={onNavigate}
      />
    </div>
  );
}

function ImportCard({
  icon,
  title,
  description,
  actionLabel,
  helper,
  primary,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  helper: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border/70 p-5">
      <div className="text-foreground">{icon}</div>
      <div className="mt-3 text-[14px] font-medium text-foreground">{title}</div>
      <p className="mt-1 text-[12px] text-muted-foreground">{description}</p>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "mt-4 rounded-md px-3 py-[8px] text-[12px] font-medium transition-colors",
          primary
            ? "bg-foreground text-background hover:opacity-90"
            : "border border-border/70 text-foreground hover:bg-muted"
        )}
      >
        {actionLabel}
      </button>
      <p className="mt-2 text-[11px] text-muted-foreground">{helper}</p>
    </div>
  );
}

export default Network;
