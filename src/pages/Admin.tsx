import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { AdminDeduplication } from "@/components/AdminDeduplication";

type PendingProfile = {
  id: string;
  full_name: string | null;
  handle: string;
  student_id_number: string | null;
  id_card_image_url: string | null;
};

const Admin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingProfile[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);

  const loadPending = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, handle, student_id_number, id_card_image_url")
      .eq("verification_status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Failed to load pending verifications");
      return;
    }

    setItems((data as any) || []);

    // Generate signed URLs for images
    const entries = await Promise.all(
      (data || []).map(async (p: PendingProfile) => {
        if (!p.id_card_image_url) return [p.id, ""] as const;
        const { data: signed } = await supabase
          .storage
          .from("id-cards")
          .createSignedUrl(p.id_card_image_url, 60 * 10); // 10 minutes
        return [p.id, signed?.signedUrl || ""] as const;
      })
    );
    setImageUrls(Object.fromEntries(entries));
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      // If not logged in, send to login
      if (!session?.user) {
        navigate("/login", { replace: true });
        return;
      }

      // Check if user has admin role using the new role-based system
      const { data: userRole } = await supabase
        .rpc('get_current_user_role');

      const hasAdminRole = userRole === 'admin';
      setIsAdmin(hasAdminRole);

      if (hasAdminRole) {
        await loadPending();
      }

      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [navigate, loadPending]);

  const updateStatus = async (profileId: string, status: "verified" | "rejected") => {
    const { error } = await supabase
      .from("profiles")
      .update({ verification_status: status })
      .eq("id", profileId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(status === "verified" ? "Profile approved" : "Profile rejected");
    setItems((prev) => prev.filter((p) => p.id !== profileId));
  };

  return (
    <>
      <Helmet>
        <title>Admin — Pending verifications | Antelog</title>
        <meta name="description" content="Review and approve pending student verifications." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background px-4 py-10">
        <section className="max-w-5xl mx-auto space-y-6">
          <header>
            <h1 className="text-3xl font-bold">Admin — Pending verifications</h1>
            <p className="text-muted-foreground">Only accessible to admins.</p>
          </header>

          {!isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Access denied</CardTitle>
                <CardDescription>You don’t have permission to view this page.</CardDescription>
              </CardHeader>
            </Card>
          )}

          {isAdmin && (
            <>
              <AdminDeduplication />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {loading && (
                <Card className="sm:col-span-2 lg:col-span-3">
                  <CardHeader>
                    <CardTitle>Loading…</CardTitle>
                    <CardDescription>Please wait while we fetch pending profiles.</CardDescription>
                  </CardHeader>
                </Card>
              )}

              {!loading && items.length === 0 && (
                <Card className="sm:col-span-2 lg:col-span-3">
                  <CardHeader>
                    <CardTitle>No pending verifications</CardTitle>
                    <CardDescription>All caught up!</CardDescription>
                  </CardHeader>
                </Card>
              )}

              {!loading && items.map((p) => (
                <Card key={p.id} className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-xl">{p.full_name || "(No name)"}</CardTitle>
                    <CardDescription>@{p.handle}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {imageUrls[p.id] ? (
                      <img
                        src={imageUrls[p.id]}
                        alt={`ID card for ${p.full_name || p.handle}`}
                        className="w-full rounded-md border"
                        loading="lazy"
                      />
                    ) : (
                      <div className="text-sm text-muted-foreground border rounded-md p-3">
                        No ID image uploaded
                      </div>
                    )}
                    <div className="text-sm">
                      <div className="text-muted-foreground">Student ID</div>
                      <div className="font-medium">{p.student_id_number || "—"}</div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={() => updateStatus(p.id, "verified")}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => updateStatus(p.id, "rejected")}>Reject</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            </>
          )}
        </section>
      </main>
    </>
  );
};

export default Admin;
