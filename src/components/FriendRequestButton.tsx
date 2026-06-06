import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  currentUserId: string;
  targetUserId: string;
  size?: "sm" | "default" | "lg";
  variant?: "outline" | "default" | "secondary";
  className?: string;
}

type State = "loading" | "none" | "pending" | "accepted";

export const FriendRequestButton = ({
  currentUserId,
  targetUserId,
  size = "sm",
  variant = "outline",
  className,
}: Props) => {
  const [state, setState] = useState<State>("loading");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
      setState("none");
      return;
    }
    const { data } = await supabase
      .from("friend_requests")
      .select("id, status")
      .or(
        `and(requester_id.eq.${currentUserId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${currentUserId})`
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return setState("none");
    if (data.status === "pending") return setState("pending");
    if (data.status === "accepted") return setState("accepted");
    setState("none"); // declined → allow retry
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, targetUserId]);

  const handleClick = async () => {
    if (submitting || state !== "none") return;
    setSubmitting(true);
    try {
      // If a declined row exists, update it instead of inserting (avoids unique conflicts if any)
      const { data: existing } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("requester_id", currentUserId)
        .eq("addressee_id", targetUserId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("friend_requests")
          .update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("friend_requests").insert({
          requester_id: currentUserId,
          addressee_id: targetUserId,
          status: "pending",
        });
        if (error) throw error;
      }

      // Look up requester's name for the notification
      const { data: me } = await supabase
        .from("profiles")
        .select("full_name, handle")
        .eq("id", currentUserId)
        .maybeSingle();
      const displayName = me?.full_name || (me?.handle ? `@${me.handle}` : "Someone");

      // Direct client INSERT into notifications is denied by RLS (#1/D4).
      await supabase.rpc("create_notification" as any, {
        p_user_id: targetUserId,
        p_type: "friend_request",
        p_title: `${displayName} wants to add you to their network`,
        p_message: "You have a new connection request on Antelog.",
        p_metadata: { requester_id: currentUserId },
      });

      setState("pending");
      toast({ title: "Request sent" });
    } catch (e: any) {
      toast({
        title: "Could not send request",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "loading" || state === "accepted" || currentUserId === targetUserId) {
    return null;
  }

  if (state === "pending") {
    return (
      <Button size={size} variant="outline" disabled className={className}>
        Request sent
      </Button>
    );
  }

  return (
    <Button size={size} variant={variant} onClick={handleClick} disabled={submitting} className={className}>
      {submitting ? "Sending..." : "+ Add to Network"}
    </Button>
  );
};

export default FriendRequestButton;