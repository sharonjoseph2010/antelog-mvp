import { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar/Sidebar";

interface AppShellProps {
  children: ReactNode;
  onLogout?: () => Promise<void> | void;
}

/**
 * Authenticated app shell. Renders a persistent left sidebar at >=1024px
 * and the route content on the right. Mobile drawer arrives in Phase 2.
 */
export function AppShell({ children, onLogout }: AppShellProps) {
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Desktop sidebar */}
      <div className="hidden w-[232px] shrink-0 border-r border-border lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar onLogout={onLogout} />
        </div>
      </div>

      {/* Main content area */}
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}