import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Bell, Moon, Sun, Home, Users, Inbox, BookOpen, User as UserIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { RightDrawer } from "./RightDrawer";
import { useFypUnread } from "@/hooks/useFypUnread";

export function TopNav() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [initial, setInitial] = useState("?");
  const [unread, setUnread] = useState(0);
  const fypUnread = useFypUnread();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const [{ data: prof }, { count }] = await Promise.all([
        supabase.from("profiles").select("full_name, handle").eq("id", user.id).maybeSingle(),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_read", false),
      ]);
      if (cancelled) return;
      const base = (prof?.full_name as string) || (prof?.handle as string) || user.email || "?";
      setInitial(base.trim().charAt(0).toUpperCase());
      setUnread(count || 0);
    })();
    return () => { cancelled = true; };
  }, []);

  const isDark = mounted && (resolvedTheme || theme) === "dark";

  const navLinkCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      "relative text-[13px] transition-colors",
      isActive
        ? "font-medium text-foreground after:absolute after:left-0 after:right-0 after:-bottom-[15px] after:h-[1.5px] after:bg-foreground"
        : "text-muted-foreground hover:text-foreground"
    );

  return (
    <>
      <header className="sticky top-0 z-30 hidden border-b border-border bg-background md:block">
        <div className="flex items-center justify-between px-7 py-[14px]">
          <div className="flex items-baseline gap-6">
            <Link
              to="/dashboard"
              className="text-[20px] font-semibold tracking-[-0.02em] text-foreground leading-none"
            >
              Antelog
            </Link>
            <NavLink
              to="/directory"
              className={({ isActive }) =>
                cn(
                  "text-[13px] font-medium text-foreground hover:opacity-80",
                  isActive && "underline underline-offset-[15px] decoration-[1.5px]"
                )
              }
            >
              Master Directory
            </NavLink>
            <span className="self-center h-[14px] w-px bg-border" />
            <nav className="flex items-baseline gap-5">
              <NavLink to="/dashboard" className={navLinkCls} end>Dashboard</NavLink>
              <NavLink to="/network" className={navLinkCls}>Network</NavLink>
              <NavLink to="/requests" className={navLinkCls}>Requests</NavLink>
              <NavLink to="/lists" className={navLinkCls}>My Lists</NavLink>
              <NavLink to="/for-you" className={navLinkCls}>
                <span className="relative inline-flex items-center">
                  For You
                  {fypUnread && (
                    <span
                      aria-label="New requests"
                      className="ml-1.5 inline-block h-[6px] w-[6px] rounded-full"
                      style={{ backgroundColor: "hsl(var(--info-fg))" }}
                    />
                  )}
                </span>
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/notifications"
              aria-label="Notifications"
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground"
            >
              <Bell className="h-[17px] w-[17px]" strokeWidth={1.5} />
              {unread > 0 && (
                <span className="absolute right-[7px] top-[6px] h-[7px] w-[7px] rounded-full border-[1.5px] border-background bg-primary" />
              )}
            </Link>
            <button
              type="button"
              aria-label="Toggle theme"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground"
            >
              {isDark ? (
                <Sun className="h-[17px] w-[17px]" strokeWidth={1.5} />
              ) : (
                <Moon className="h-[17px] w-[17px]" strokeWidth={1.5} />
              )}
            </button>
            <button
              type="button"
              aria-label="Open account menu"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted text-[12px] font-medium text-foreground transition-colors hover:bg-muted/70"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full">
                {initial}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-border bg-background md:hidden">
        <MobileTab to="/dashboard" icon={Home} label="Home" />
        <MobileTab to="/network" icon={Users} label="Network" />
        <MobileTab to="/requests" icon={Inbox} label="Requests" />
        <MobileTab to="/directory" icon={BookOpen} label="Directory" />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex flex-col items-center justify-center gap-1 py-2 text-[10px] text-muted-foreground hover:text-foreground"
          aria-label="You"
        >
          <UserIcon className="h-5 w-5" strokeWidth={1.5} />
          <span>You</span>
        </button>
      </nav>
      {/* Spacer so content isn't hidden behind the bottom tab bar on mobile */}
      <div className="h-14 md:hidden" aria-hidden />

      <RightDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}

function MobileTab({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof Home;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center justify-center gap-1 py-2 text-[10px] transition-colors",
          isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )
      }
    >
      <Icon className="h-5 w-5" strokeWidth={1.5} />
      <span>{label}</span>
    </NavLink>
  );
}