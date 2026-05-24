import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface ForYouRequest {
  request_id: string;
  title: string;
  category: string;
  location: string | null;
  created_at: string;
  expires_at: string;
  creator_label: string | null;
  contributor_label: string | null;
}

export default function ForYou() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ForYouRequest[]>([]);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login");
        return;
      }
      const { data, error } = await supabase.rpc("get_for_you_requests", { p_limit: 20 });
      if (error) throw error;
      setItems((data || []) as ForYouRequest[]);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't load For You");
    } finally {
      setLoading(false);
    }
  };

  const dismiss = async (
    requestId: string,
    action: "dismiss" | "snooze" | "not_relevant",
    snoozeDays = 7,
  ) => {
    const { error } = await supabase.rpc("dismiss_anonymous_impression", {
      p_request_id: requestId,
      p_action: action,
      p_snooze_days: snoozeDays,
    });
    if (error) {
      toast.error("Couldn't update");
      return;
    }
    setItems((prev) => prev.filter((r) => r.request_id !== requestId));
  };

  return (
    <>
      <Helmet>
        <title>For You — Antelog</title>
        <meta
          name="description"
          content="A quiet, finite list of requests where your expertise might help."
        />
      </Helmet>

      <div className="container max-w-2xl py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">For You</h1>
          <p className="text-sm text-muted-foreground">
            A small, finite set of open questions where your background might help.
            You appear anonymously here. This is not a feed.
          </p>
        </header>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nothing relevant right now. Check back later — this list stays quiet by design.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {items.map((r) => (
              <li key={r.request_id}>
                <Card
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/requests/${r.request_id}/respond`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/requests/${r.request_id}/respond`);
                    }
                  }}
                  className="border-muted cursor-pointer transition-colors hover:bg-muted/40 hover:border-foreground/20 focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base font-medium leading-snug">
                        {r.title}
                      </CardTitle>
                      <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            aria-label="Manage this request"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => dismiss(r.request_id, "snooze", 7)}>
                            Snooze 7 days
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => dismiss(r.request_id, "dismiss")}>
                            Dismiss
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => dismiss(r.request_id, "not_relevant")}>
                            Not relevant
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="font-normal">
                        {r.category}
                      </Badge>
                      {r.location && <span>{r.location}</span>}
                      <span>
                        opened {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </span>
                      {r.contributor_label && (
                        <span className="ml-auto">You appear as {r.contributor_label}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground pt-4">
          Antelog routes a small number of relevant questions here. No counts, no trends,
          no infinite scroll.
        </p>
      </div>
    </>
  );
}
