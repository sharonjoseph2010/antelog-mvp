import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookUser, List as ListIcon, LogOut, Settings, Share2, User, UsersRound, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface RightDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProfileSummary {
  id: string;
  fullName: string;
  handle: string;
  listCount: number;
  networkCount: number;
}

export function RightDrawer({ open, onOpenChange }: RightDrawerProps) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const [{ data: prof }, listRes, friendRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, handle").eq("id", user.id).maybeSingle(),
        supabase.from("lists").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
        supabase
          .from("friendships")
          .select("id", { count: "exact", head: true })
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
      ]);
      if (cancelled) return;
      setProfile({
        id: user.id,
        fullName: (prof?.full_name as string) || user.email || "",
        handle: (prof?.handle as string) || "",
        listCount: listRes.count || 0,
        networkCount: friendRes.count || 0,
      });
    })();
    return () => { cancelled = true; };
  }, [open]);

  const close = () => onOpenChange(false);
  const go = (path: string) => { close(); navigate(path); };

  const openLogoutDialog = () => setShowLogoutDialog(true);

  const confirmLogout = async () => {
    setShowLogoutDialog(false);
    close();
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  };

  const cancelLogout = () => setShowLogoutDialog(false);

  const initial = (profile?.fullName || profile?.handle || "?").trim().charAt(0).toUpperCase();

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-[320px] [&>button]:hidden"
      >
        <div className="flex h-full flex-col bg-background p-[18px] pt-[22px]">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-1">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[13px] font-medium text-foreground">
                {initial}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium text-foreground">
                  {profile?.fullName || "—"}
                </div>
                <div className="truncate text-[12px] text-muted-foreground">
                  @{profile?.handle || "—"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <Divider />

          <SectionLabel>Your stuff</SectionLabel>
          <nav className="flex flex-col gap-0.5">
            <Item icon={ListIcon} label="My Lists" count={profile?.listCount} onClick={() => go("/lists")} />
            <Item icon={Share2} label="Network" count={profile?.networkCount} onClick={() => go("/network")} />
            <Item icon={UsersRound} label="My Groups" onClick={() => go("/groups")} />
            <Item icon={BookUser} label="Contacts" onClick={() => go("/contacts")} />
          </nav>

          <Divider />

          <SectionLabel>Account</SectionLabel>
          <nav className="flex flex-col gap-0.5">
            <Item icon={User} label="Profile" onClick={() => go("/profile")} />
            <Item icon={Settings} label="Settings" onClick={() => go("/settings")} />
          </nav>

          <div className="flex-1" />

          <Divider />

          <nav className="flex flex-col gap-0.5">
            <Item icon={LogOut} label="Log out" onClick={openLogoutDialog} danger />
          </nav>
        </div>
      </SheetContent>
    </Sheet>

    <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Log out?</AlertDialogTitle>
          <AlertDialogDescription>
            You'll need to sign in again to see your network and requests.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelLogout}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmLogout}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Log out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Item({
  icon: Icon,
  label,
  count,
  onClick,
  danger,
}: {
  icon: typeof ListIcon;
  label: string;
  count?: number;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-2 py-[9px] text-left text-[13px] transition-colors hover:bg-muted",
        danger ? "text-destructive" : "text-foreground"
      )}
    >
      <Icon
        className="h-[17px] w-[17px] shrink-0 text-muted-foreground"
        strokeWidth={1.5}
      />
      <span className="flex-1 truncate">{label}</span>
      {count != null && count > 0 && (
        <span className="text-[11px] text-muted-foreground">{count}</span>
      )}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-3.5 mx-1 h-px bg-border" />;
}