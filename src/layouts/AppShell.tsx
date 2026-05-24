import { ReactNode } from "react";
import { TopNav } from "@/components/nav/TopNav";

interface AppShellProps {
  children: ReactNode;
  onLogout?: () => Promise<void> | void;
}

/**
 * Authenticated app shell with a horizontal top nav and a right-side
 * account drawer (triggered by the avatar button in the top nav).
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <TopNav />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}