import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Verify from "./pages/Verify";
import AuthCallback from "./pages/AuthCallback";
import ProfileSetup from "./pages/ProfileSetup";
import Admin from "./pages/Admin";
import Dashboard from "./pages/Dashboard";
import Lists from "./pages/Lists";
import ListsNew from "./pages/ListsNew";
import ListDetail from "./pages/ListDetail";
import ListEdit from "./pages/ListEdit";
import Friends from "./pages/Friends";
import ContactsImport from "./pages/ContactsImport";
import ContactsImportHub from "./pages/ContactsImportHub";
import ContactsOverview from "./pages/ContactsOverview";
import ExtendedNetwork from "./pages/ExtendedNetwork";
import Groups from "./pages/Groups";
import GroupsNew from "./pages/GroupsNew";
import GroupDetail from "./pages/GroupDetail";
import Requests from "./pages/Requests";
import RequestsNew from "./pages/RequestsNew";
import RequestRespond from "./pages/RequestRespond";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { ProtectedRoute, AdminRoute, InternalRoute, VerifiedRoute } from "@/components/routes/RouteGuards";
import Directory from "./pages/Directory";
import GuestSignup from "./pages/GuestSignup";
const queryClient = new QueryClient();

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userType, setUserType] = useState<'verified' | 'guest' | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    console.log("[Auth] Initializing auth listener...");
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[Auth] onAuthStateChange:", event, { hasSession: !!session, userId: session?.user?.id });
      setSession(session);
      setUser(session?.user ?? null);
      
      // Fetch user type when session changes
      if (session?.user) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('user_type')
            .eq('id', session.user.id)
            .single();
          
          setUserType(profile?.user_type || 'guest');
        } catch (error) {
          console.error("[Auth] Error fetching user type:", error);
          setUserType('guest');
        }
      } else {
        setUserType(null);
      }
    });

    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      console.log("[Auth] getSession result:", { hasSession: !!session, userId: session?.user?.id });
      setSession(session);
      setUser(session?.user ?? null);
      
      // Fetch user type for initial session
      if (session?.user) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('user_type')
            .eq('id', session.user.id)
            .single();
          
          setUserType(profile?.user_type || 'guest');
        } catch (error) {
          console.error("[Auth] Error fetching user type:", error);
          setUserType('guest');
        }
      } else {
        setUserType(null);
      }
      
      setInitializing(false);
    };
    
    initializeAuth();

    return () => {
      console.log("[Auth] Unsubscribing auth listener");
      subscription.unsubscribe();
    };
  }, []);

  const isAuthenticated = !!user?.id;
  const isAdmin = user?.email === "sharonjoseph2010@gmail.com";

  const handleLogout = async () => {
    try {
      console.log("[Auth] Logging out...");
      await supabase.auth.signOut({ scope: "local" });
      await supabase.auth.signOut().catch((e) => {
        console.warn("[Auth] Global signOut warning:", e?.message ?? e);
      });
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("sb-") || key.startsWith("supabase.auth.token")) {
          localStorage.removeItem(key);
        }
      }
    } catch (e) {
      console.error("[Auth] Logout error:", e);
    } finally {
      setSession(null);
      setUser(null);
      setUserType(null);
      console.log("[Auth] Logout complete; session cleared");
    }
  };

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Header 
              isAuthenticated={isAuthenticated} 
              isAdmin={isAdmin} 
              userType={userType}
              onLogout={handleLogout} 
            />
            <Routes>
              <Route path="/" element={initializing ? <div className="min-h-screen flex items-center justify-center">Loading...</div> : (isAuthenticated ? <Navigate to="/dashboard" replace /> : <Index />)} />
              <Route path="/signup" element={<Signup />} />
            <Route path="/guest-signup" element={<GuestSignup />} />
            <Route path="/directory" element={<Directory />} />
            <Route path="/login" element={<Login />} />

              <Route
                path="/dashboard"
                element={
                  <VerifiedRoute isAuthenticated={isAuthenticated} userType={userType}>
                    <Dashboard />
                  </VerifiedRoute>
                }
              />

              <Route
                path="/lists"
                element={
                  <VerifiedRoute isAuthenticated={isAuthenticated} userType={userType}>
                    <Lists />
                  </VerifiedRoute>
                }
              />

              <Route
                path="/lists/:id/edit"
                element={
                  <VerifiedRoute isAuthenticated={isAuthenticated} userType={userType}>
                    <ListEdit />
                  </VerifiedRoute>
                }
              />

              <Route
                path="/lists/:id"
                element={
                  <VerifiedRoute isAuthenticated={isAuthenticated} userType={userType}>
                    <ListDetail />
                  </VerifiedRoute>
                }
              />

              <Route
                path="/lists/new"
                element={
                  <VerifiedRoute isAuthenticated={isAuthenticated} userType={userType}>
                    <ListsNew />
                  </VerifiedRoute>
                }
              />

              <Route
                path="/friends"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <Friends />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/contacts"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <ContactsOverview />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/contacts/import"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <ContactsImportHub />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/contacts/legacy"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <ContactsImport />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/network/extended"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <ExtendedNetwork />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/groups"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <Groups />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/groups/new"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <GroupsNew />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/groups/:id"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <GroupDetail />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/requests"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <Requests />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/requests/new"
                element={
                  <VerifiedRoute isAuthenticated={isAuthenticated} userType={userType}>
                    <RequestsNew />
                  </VerifiedRoute>
                }
              />

              <Route
                path="/requests/:id/respond"
                element={
                  <VerifiedRoute isAuthenticated={isAuthenticated} userType={userType}>
                    <RequestRespond />
                  </VerifiedRoute>
                }
              />

              <Route
                path="/admin"
                element={
                  <AdminRoute isAuthenticated={isAuthenticated} isAdmin={isAdmin}>
                    <Admin />
                  </AdminRoute>
                }
              />

              <Route
                path="/profile-setup"
                element={
                  <InternalRoute isAuthenticated={isAuthenticated}>
                    <ProfileSetup />
                  </InternalRoute>
                }
              />

              <Route
                path="/verify"
                element={
                  <InternalRoute isAuthenticated={isAuthenticated}>
                    <Verify />
                  </InternalRoute>
                }
              />

              <Route path="/auth/callback" element={<AuthCallback />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <Footer isAuthenticated={isAuthenticated} />
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
};

export default App;
