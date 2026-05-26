import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RequesterProfile {
  id: string;
  full_name: string | null;
  handle: string;
}

type RequestStatus = "pending" | "accepted" | "declined" | "none" | "loading";

const FriendRequestPage = () => {
  const { userId: requesterId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [me, setMe] = useState<string | null>(null);
  const [requester, setRequester] = useState<RequesterProfile | null>(null);
  const [status, setStatus] = useState<RequestStatus>("loading");
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    (async () => {
      if (!requesterId) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login");
        return;
      }
      setMe(user.id);

      const { data: prof } = await supabase
        .from("profiles")
        .select("id, full_name, handle")
        .eq("id", requesterId)
        .maybeSingle();
      setRequester((prof as RequesterProfile) || null);

      // Already friends?
      const { data: existingFriendship } = await supabase
        .from("friendships")
        .select("id")
        .or(
          `and(user1_id.eq.${user.id},user2_id.eq.${requesterId}),and(user1_id.eq.${requesterId},user2_id.eq.${user.id})`
        )
        .maybeSingle();
      if (existingFriendship) {
        setStatus("accepted");
        return;
      }

      const { data: req } = await supabase
        .from("friend_requests")
        .select("status")
        .eq("requester_id", requesterId)
        .eq("addressee_id", user.id)
        .maybeSingle();

      if (!req) setStatus("none");
      else setStatus((req.status as RequestStatus) || "pending");
    })();
  }, [requesterId, navigate]);

  const accept = async () => {
    if (!me || !requesterId) return;
    setActioning(true);
    try {
      const { error: fErr } = await supabase
        .from("friendships")
        .insert({ user1_id: requesterId, user2_id: me });
      if (fErr && !`${fErr.message}`.toLowerCase().includes("duplicate")) throw fErr;

      await supabase
        .from("friend_requests")
        .update({ status: "accepted", updated_at: new Date().toISOString() })
        .eq("requester_id", requesterId)
        .eq("addressee_id", me);

      const { data: meProf } = await supabase
        .from("profiles").select("full_name, handle").eq("id", me).maybeSingle();
      const displayName = meProf?.full_name || (meProf?.handle ? `@${meProf.handle}` : "Someone");
      await supabase.from("notifications").insert({
        user_id: requesterId,
        type: "friend_request_accepted",
        title: `${displayName} accepted your connection request`,
        message: "You are now connected on Antelog.",
        related_user_id: me,
      });

      setStatus("accepted");
      toast({ title: "Connection accepted" });
    } catch (e: any) {
      toast({ title: "Could not accept", description: e?.message, variant: "destructive" });
    } finally {
      setActioning(false);
    }
  };

  const decline = async () => {
    if (!me || !requesterId) return;
    setActioning(true);
    try {
      await supabase
        .from("friend_requests")
        .update({ status: "declined", updated_at: new Date().toISOString() })
        .eq("requester_id", requesterId)
        .eq("addressee_id", me);
      setStatus("declined");
      toast({ title: "Request declined" });
    } catch (e: any) {
      toast({ title: "Could not decline", description: e?.message, variant: "destructive" });
    } finally {
      setActioning(false);
    }
  };

  const name = requester?.full_name || (requester?.handle ? `@${requester.handle}` : "This person");

  return (
    <>
      <Helmet>
        <title>Connection request — Antelog</title>
      </Helmet>
      <div className="mx-auto w-full max-w-[560px] px-6 py-12">
        <h1 className="text-[26px] font-medium tracking-tight text-foreground">Connection request</h1>

        {status === "loading" ? (
          <p className="mt-8 text-[13px] text-muted-foreground">Loading…</p>
        ) : !requester ? (
          <p className="mt-8 text-[13px] text-muted-foreground">This profile could not be found.</p>
        ) : (
          <div className="mt-8 rounded-lg border border-border/70 p-6">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted text-[16px] font-medium text-foreground">
                {(requester.full_name || requester.handle || "?").trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="text-[16px] font-medium text-foreground">{requester.full_name || `@${requester.handle}`}</div>
                {requester.handle && requester.full_name && (
                  <div className="text-[12px] text-muted-foreground">@{requester.handle}</div>
                )}
              </div>
            </div>

            {status === "pending" && (
              <>
                <p className="mt-6 text-[14px] text-foreground">
                  {name} wants to add you to their network on Antelog.
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={actioning}
                    onClick={accept}
                    className="rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {actioning ? "Working…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    disabled={actioning}
                    onClick={decline}
                    className="rounded-md border border-border/70 px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              </>
            )}

            {status === "accepted" && (
              <>
                <p className="mt-6 text-[14px] text-foreground">
                  You and {name} are now connected.
                </p>
                <div className="mt-6 flex gap-3">
                  <Link
                    to="/network"
                    className="rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background hover:opacity-90"
                  >
                    View your network
                  </Link>
                  <Link
                    to={`/profile/${requester.id}`}
                    className="rounded-md border border-border/70 px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted"
                  >
                    View profile
                  </Link>
                </div>
              </>
            )}

            {status === "declined" && (
              <p className="mt-6 text-[14px] text-muted-foreground">You declined this request.</p>
            )}

            {status === "none" && (
              <p className="mt-6 text-[14px] text-muted-foreground">
                No pending request from this person.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default FriendRequestPage;