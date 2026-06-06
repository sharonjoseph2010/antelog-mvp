import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SidebarItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Plain count (e.g. "6") — muted, no background */
  count?: number | null;
  /** Alert count (e.g. unread) — filled pill */
  alert?: number | null;
  /** Small unread indicator dot (uses info color) */
  dot?: boolean;
  end?: boolean;
  onNavigate?: () => void;
}

export function SidebarItem({ to, icon: Icon, label, count, alert, dot, end, onNavigate }: SidebarItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] transition-colors",
          "text-foreground/70 hover:bg-muted hover:text-foreground",
          isActive && "bg-muted text-foreground font-medium"
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              "h-4 w-4 shrink-0 transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
            )}
            strokeWidth={1.5}
          />
          <span className="flex-1 truncate">{label}</span>
          {dot && (
            <span
              aria-label="New"
              className="inline-block h-[6px] w-[6px] rounded-full"
              style={{ backgroundColor: "hsl(var(--info-fg))" }}
            />
          )}
          {alert != null && alert > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background">
              {alert > 99 ? "99+" : alert}
            </span>
          )}
          {count != null && count > 0 && alert == null && (
            <span className="text-[11px] text-muted-foreground">{count}</span>
          )}
        </>
      )}
    </NavLink>
  );
}

export function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1.5 pt-0 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </div>
  );
}

export function SidebarDivider() {
  return <div className="my-2.5 h-px bg-border" />;
}