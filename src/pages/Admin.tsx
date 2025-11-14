import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { AdminDeduplication } from "@/components/AdminDeduplication";
import { Trash2, Search, Users } from "lucide-react";

type PendingProfile = {
  id: string;
  full_name: string | null;
  handle: string;
  student_id_number: string | null;
  id_card_image_url: string | null;
};

type UserProfile = {
  id: string;
  full_name: string | null;
  handle: string;
  phone_number: string | null;
  user_type: string;
  verification_status: string;
  created_at: string;
  email?: string;
};

const Admin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingProfile[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const loadUsers = async () => {
    setUsersLoading(true);
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, handle, phone_number, user_type, verification_status, created_at")
      .order("created_at", { ascending: false });

    if (profilesError) {
      toast.error("Failed to load users");
      setUsersLoading(false);
      return;
    }

    // Map profiles to user format (email will show handle as we can't access auth.users from client)
    const usersData = (profilesData || []).map(profile => ({
      ...profile,
      email: `${profile.handle}@antelog.app` // Placeholder since we can't fetch from auth.users client-side
    }));

    setUsers(usersData);
    setUsersLoading(false);
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
        await loadUsers();
      }

      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [navigate]);

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

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("admin_delete_user", {
        user_id_to_delete: userToDelete.id
      });

      if (error) throw error;

      toast.success(`User ${userToDelete.full_name || userToDelete.handle} deleted successfully`);
      setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(
      u =>
        u.full_name?.toLowerCase().includes(query) ||
        u.handle.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  const pendingCount = items.length;
  const totalUsers = users.length;

  return (
    <>
      <Helmet>
        <title>Admin — Pending verifications | Antelog</title>
        <meta name="description" content="Review and approve pending student verifications." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen bg-background px-4 py-10">
        <section className="max-w-7xl mx-auto space-y-6">
          <header>
            <h1 className="text-3xl font-bold">Admin Panel</h1>
            <p className="text-muted-foreground">Manage users and verifications</p>
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
              <Tabs defaultValue="users" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="users" className="gap-2">
                    <Users className="h-4 w-4" />
                    User Management
                    <Badge variant="secondary">{totalUsers}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="verifications" className="gap-2">
                    Pending Verifications
                    {pendingCount > 0 && <Badge variant="destructive">{pendingCount}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="tools">Admin Tools</TabsTrigger>
                </TabsList>

                <TabsContent value="users" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>All Users</CardTitle>
                      <CardDescription>
                        Manage all registered users. Search by name, email, or handle.
                      </CardDescription>
                      <div className="flex items-center gap-2 pt-4">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search users..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="max-w-sm"
                        />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {usersLoading ? (
                        <p className="text-center text-muted-foreground py-8">Loading users...</p>
                      ) : (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Handle</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Registered</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredUsers.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                    No users found
                                  </TableCell>
                                </TableRow>
                              ) : (
                                filteredUsers.map((user) => (
                                  <TableRow key={user.id}>
                                    <TableCell className="font-medium">
                                      {user.full_name || "(No name)"}
                                    </TableCell>
                                    <TableCell className="text-sm">{user.email}</TableCell>
                                    <TableCell className="text-sm">@{user.handle}</TableCell>
                                    <TableCell className="text-sm">{user.phone_number || "—"}</TableCell>
                                    <TableCell>
                                      <Badge variant={user.user_type === "verified" ? "default" : "secondary"}>
                                        {user.user_type}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant={
                                          user.verification_status === "verified"
                                            ? "default"
                                            : user.verification_status === "rejected"
                                            ? "destructive"
                                            : "secondary"
                                        }
                                      >
                                        {user.verification_status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {new Date(user.created_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => {
                                          setUserToDelete(user);
                                          setDeleteDialogOpen(true);
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="verifications" className="space-y-4">
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
                </TabsContent>

                <TabsContent value="tools">
                  <AdminDeduplication />
                </TabsContent>
              </Tabs>
            </>
          )}
        </section>
      </main>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold">{userToDelete?.full_name || userToDelete?.handle}</span>{" "}
              and all their data including lists, requests, contacts, and friendships.
              <br />
              <br />
              <span className="text-destructive font-medium">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Permanently Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Admin;
