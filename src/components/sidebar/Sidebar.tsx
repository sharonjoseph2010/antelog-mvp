import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Contact,
  LayoutGrid,
  List,
  MessageCircleQuestion,
  Moon,
  Settings,
  Sparkles,
  Sun,
  Users,
  UsersRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { SidebarDivider, SidebarItem, SidebarSectionLabel } from "./SidebarItem";
import { OnboardingCard } from "./OnboardingCard";
import { UserMenu } from "./UserMenu";

interface SidebarProps {
  /** Called when a nav item is clicked (used by mobile drawer to auto-close) */
  onNavigate?: () => void;
  onLogout?: () => Promise<void> | void;
}

interface SidebarCounts {
  requestsAlert: number;
  lists: number;
  network: number;
  notifications: number;
}

interface ProfileSummary {
  id: string;
  fullName: string;
  handle: string;
  createdAt: string | null;
}

export function Sidebar({ onNavigate, onLogout }: SidebarProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [counts, setCounts] = useState<SidebarCounts>({
    requestsAlert: 0,
    lists: 0,
    network: 0,
    notifications: 0,
  });
  const [onboardingDismissed, setOnboardingDismissed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const [{ data: prof }, listCount, friendCount, openReqRes, unreadRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, handle, created_at").eq("id", user.id).maybeSingle(),
        supabase.from("lists").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
        supabase
          .from("friendships")
          .select("id", { count: "exact", head: true })
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
        supabase.from("requests").select("id").eq("creator_id", user.id).eq("status", "open"),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_read", false),
      ]);

      // Count responses on user's open requests in last 7d as "alert"
      let requestsAlert = 0;
      const openIds = (openReqRes.data || []).map((r) => r.id);
      if (openIds.length > 0) {
        const since = new Date(Date.now() - 7 * 86400000).toISOString();
        const { count } = await supabase
          .from("request_responses")
          .select("id", { count: "exact", head: true })
          .in("request_id", openIds)
          .gte("created_at", since);
        requestsAlert = count || 0;
      }

      if (cancelled) return;

      const fullName = (prof?.full_name as string) || (user.email ?? "");
      const handle = (prof?.handle as string) || "";
      const createdAt = (prof?.created_at as string) || user.created_at || null;

      setProfile({ id: user.id, fullName, handle, createdAt });
      setCounts({
        requestsAlert,
        lists: listCount.count || 0,
        network: friendCount.count || 0,
        notifications: unreadRes.count || 0,
      });

      // Onboarding visibility
      const dismissedKey = `antelog:onboarding_dismissed:${user.id}`;
      const dismissed = localStorage.getItem(dismissedKey) === "true";
      const days = createdAt
        ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
        : 999;
      setOnboardingDismissed(dismissed || days >= 7);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissOnboarding = () => {
    if (profile) {
      localStorage.setItem(`antelog:onboarding_dismissed:${profile.id}`, "true");
    }
    setOnboardingDismissed(true);
  };

  const isDark = (resolvedTheme || theme) === "dark";

  return (
    <aside
      className="flex h-full w-full flex-col bg-background"
      aria-label="Primary navigation"
    >
      {/* Logo */}
      <div className="px-4 pb-3 pt-[22px]">
        <Link
          to="/dashboard"
          onClick={onNavigate}
          className="text-[17px] font-semibold tracking-tight text-foreground"
        >
          Antelog
        </Link>
      </div>

      {/* Scrollable nav */}
      <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-3">
        <SidebarSectionLabel>General</SidebarSectionLabel>
        <nav className="flex flex-col gap-0.5">
          <SidebarItem to="/dashboard" icon={LayoutGrid} label="Dashboard" onNavigate={onNavigate} />
          <SidebarItem to="/for-you" icon={Sparkles} label="For You" onNavigate={onNavigate} />
          <SidebarItem
            to="/requests"
            icon={MessageCircleQuestion}
            label="Requests"
            alert={counts.requestsAlert}
            onNavigate={onNavigate}
          />
          <SidebarItem to="/lists" icon={List} label="My Lists" count={counts.lists} onNavigate={onNavigate} />
          <SidebarItem to="/friends" icon={Users} label="Network" count={counts.network} onNavigate={onNavigate} />
        </nav>

        <SidebarDivider />

        <SidebarSectionLabel>Public</SidebarSectionLabel>
        <nav className="flex flex-col gap-0.5">
          <SidebarItem to="/directory" icon={BookOpen} label="Master Directory" onNavigate={onNavigate} />
        </nav>

        <SidebarDivider />

        <SidebarSectionLabel>Groups</SidebarSectionLabel>
        <nav className="flex flex-col gap-0.5">
          <SidebarItem to="/groups" icon={UsersRound} label="My Groups" onNavigate={onNavigate} />
        </nav>

        <div className="mt-3" />

        <SidebarSectionLabel>Tools</SidebarSectionLabel>
        <nav className="flex flex-col gap-0.5">
          <SidebarItem to="/contacts" icon={Contact} label="Contacts" onNavigate={onNavigate} />
          <SidebarItem to="/profile" icon={Settings} label="Settings" onNavigate={onNavigate} />
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Notifications + theme */}
        <nav className="flex flex-col gap-0.5 pt-4">
          <SidebarItem
            to="/dashboard"
            icon={Bell}
            label="Notifications"
            alert={counts.notifications}
            onNavigate={onNavigate}
          />
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="group flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          >
            {isDark ? (
              <Sun className="h-4 w-4 text-muted-foreground group-hover:text-foreground" strokeWidth={1.5} />
            ) : (
              <Moon className="h-4 w-4 text-muted-foreground group-hover:text-foreground" strokeWidth={1.5} />
            )}
            <span className="flex-1 text-left">Theme</span>
          </button>
        </nav>

        {!onboardingDismissed && (
          <div className="pt-3">
            <OnboardingCard onDismiss={dismissOnboarding} />
          </div>
        )}
      </div>

      <div className="border-t border-border px-2 py-2">
        <UserMenu
          fullName={profile?.fullName || ""}
          handle={profile?.handle || ""}
          onLogout={onLogout}
        />
      </div>
    </aside>
  );
}