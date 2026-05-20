import { ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";

interface AppShellProps {
  children: ReactNode;
  onLogout?: () => Promise<void> | void;
}

/**
 * Authenticated app shell. Persistent left sidebar at >=1024px;
 * mobile top bar + slide-in drawer below 1024px.
 */
export function AppShell({ children, onLogout }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [initial, setInitial] = useState("?");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, handle")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const base = (prof?.full_name as string) || (prof?.handle as string) || user.email || "?";
      setInitial(base.trim().charAt(0).toUpperCase());
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Desktop sidebar */}
      <div className="hidden w-[232px] shrink-0 border-r border-border lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar onLogout={onLogout} />
        </div>
      </div>

      {/* Mobile drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-[260px] p-0 sm:max-w-[260px] lg:hidden"
        >
          <Sidebar
            onNavigate={() => setDrawerOpen(false)}
            onLogout={onLogout}
          />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <Menu className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <Link
            to="/dashboard"
            className="text-[15px] font-semibold tracking-tight text-foreground"
          >
            Antelog
          </Link>
          <div className="flex items-center gap-1">
            <Link
              to="/dashboard"
              aria-label="Notifications"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground"
            >
              <Bell className="h-5 w-5" strokeWidth={1.5} />
            </Link>
            <Link
              to="/profile"
              aria-label="Profile"
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-[12px] font-medium text-background"
            >
              {initial}
            </Link>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}