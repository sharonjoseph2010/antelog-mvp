import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "lucide-react";

interface Notif {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  related_user_id: string | null;
  metadata: any;
}

function getLink(n: Notif): string {
  const meta = n.metadata || {};
  switch (n.type) {
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
      return n.related_user_id ? `/friend-request/${n.related_user_id}` : "/friends";
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

const Notifications = () => {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, message, is_read, created_at, related_user_id, metadata")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      setItems((data as Notif[]) || []);
      setLoading(false);
      if (data && data.some((n: any) => !n.is_read)) {
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", user.id)
          .eq("is_read", false);
      }
    })();
  }, []);

  return (
    <>
      <Helmet>
        <title>Notifications | Antelog</title>
      </Helmet>
      <div className="mx-auto w-full max-w-[820px] px-6 py-10 lg:py-12">
        <h1 className="text-[26px] font-medium tracking-tight text-foreground">Notifications</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">All activity from your network.</p>
        <div className="mt-8">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    to={getLink(n)}
                    className="group flex items-start justify-between gap-4 py-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] text-foreground">{n.title}</div>
                      {n.message && (
                        <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{n.message}</div>
                      )}
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                    <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
};

export default Notifications;
