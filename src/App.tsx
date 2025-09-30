import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
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
import ForYou from "./pages/ForYou";

const queryClient = new QueryClient();

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userType, setUserType] = useState<'verified' | 'guest' | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Simplified auth logic
  useEffect(() => {
    console.log('INIT: App starting, setting up auth...');
    
    let mounted = true;
    
    const initAuth = async () => {
      try {
        console.log('INIT: Getting current session...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        console.log('INIT: Session check complete:', { 
          hasSession: !!session, 
          userId: session?.user?.id,
          error: error?.message 
        });
        
        if (error) {
          console.error('INIT: Session error:', error);
          setInitializing(false);
          return;
        }
        
        if (session?.user) {
          console.log('INIT: User found, setting session...');
          setSession(session);
          setUser(session.user);
          setUserType('verified'); // Default for now
        } else {
          console.log('INIT: No session found');
          setSession(null);
          setUser(null);
          setUserType(null);
        }
        
        console.log('INIT: Setting initializing to false');
        setInitializing(false);
        
      } catch (error) {
        console.error('INIT: Fatal error:', error);
        if (mounted) {
          setInitializing(false);
        }
      }
    };
    
    // Set up auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('AUTH: State change:', event, 'Has session:', !!session);
      
      if (!mounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      setUserType(session?.user ? 'verified' : null);
      
      if (!initializing) {
        console.log('AUTH: Auth change after init complete');
      }
    });
    
    // Initialize
    initAuth();
    
    return () => {
      console.log('CLEANUP: Unmounting auth setup');
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (initializing) {
    console.log('DEBUG: App still initializing... Current states:', {
      hasSession: !!session,
      hasUser: !!user,
      userType,
      timestamp: new Date().toISOString()
    });
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse">Loading...</div>
          <div className="mt-2 text-sm text-muted-foreground">
            Initializing authentication...
          </div>
        </div>
      </div>
    );
  }

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppContent 
                session={session} 
                setSession={setSession}
                user={user} 
                setUser={setUser}
                userType={userType} 
                setUserType={setUserType}
                initializing={initializing}
                setInitializing={setInitializing}
              />
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
};

const AppContent = ({ 
  session, setSession, user, setUser, userType, setUserType, initializing, setInitializing 
}: {
  session: Session | null;
  setSession: (session: Session | null) => void;
  user: User | null;
  setUser: (user: User | null) => void;
  userType: 'verified' | 'guest' | null;
  setUserType: (type: 'verified' | 'guest' | null) => void;
  initializing: boolean;
  setInitializing: (init: boolean) => void;
}) => {
  const navigate = useNavigate();

  // Handle navigation after authentication state is set
  useEffect(() => {
    console.log("[Auth] Navigation effect triggered:", { initializing, hasSession: !!session?.user, pathname: window.location.pathname });
    
    if (initializing) {
      console.log("[Auth] Still initializing, skipping navigation");
      return;
    }
    
    if (!session?.user) {
      console.log("[Auth] No user session, skipping navigation");
      return;
    }

    const handlePostAuthNavigation = async () => {
      const userId = session.user.id;
      console.log("[Auth] Starting post-auth navigation for user:", userId);
      
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("full_name, handle, verification_status")
          .eq("id", userId)
          .maybeSingle();

        if (error) {
          console.error("[Auth] Profile fetch error:", error);
          if (window.location.pathname !== "/profile-setup") {
            console.log("[Auth] Navigating to profile setup due to error");
            navigate("/profile-setup", { replace: true });
          }
          return;
        }

        console.log("[Auth] Profile data:", profile);

        // No profile or missing essentials -> setup
        if (!profile || !profile.full_name || !profile.handle) {
          if (window.location.pathname !== "/profile-setup") {
            console.log("[Auth] Navigating to profile setup - incomplete profile");
            navigate("/profile-setup", { replace: true });
          }
          return;
        }

        if (profile.verification_status === "verified") {
          if (window.location.pathname !== "/dashboard") {
            console.log("[Auth] Navigating to dashboard - verified user");
            navigate("/dashboard", { replace: true });
          }
          return;
        }

        // Otherwise pending/rejected -> verify
        if (window.location.pathname !== "/verify") {
          console.log("[Auth] Navigating to verify - pending/rejected status");
          navigate("/verify", { replace: true });
        }
      } catch (error) {
        console.error("[Auth] Navigation error:", error);
        if (window.location.pathname !== "/profile-setup") {
          console.log("[Auth] Navigating to profile setup due to navigation error");
          navigate("/profile-setup", { replace: true });
        }
      }
    };

    // Only navigate if we're on login/signup pages after successful auth
    if (["/login", "/signup", "/"].includes(window.location.pathname)) {
      console.log("[Auth] Current path requires post-auth navigation");
      handlePostAuthNavigation();
    } else {
      console.log("[Auth] Current path doesn't require post-auth navigation");
    }
  }, [session, initializing, navigate]);

  const isAuthenticated = !!user?.id;
  const isAdmin = user?.email === "sharonjoseph2010@gmail.com";

  console.log('DEBUG: AppContent render - States:', {
    initializing,
    hasSession: !!session,
    hasUser: !!user,
    userType,
    isAuthenticated,
    isAdmin,
    currentPath: window.location.pathname,
    timestamp: new Date().toISOString()
  });

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
    <>
      <Header 
        isAuthenticated={isAuthenticated} 
        isAdmin={isAdmin} 
        userType={userType}
        onLogout={handleLogout} 
      />
      <Routes>
        <Route path="/" element={initializing ? <div className="min-h-screen flex items-center justify-center">Loading...</div> : <Index />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/guest-signup" element={<GuestSignup />} />
        <Route path="/directory" element={
          <ProtectedRoute isAuthenticated={isAuthenticated}>
            <Directory />
          </ProtectedRoute>
        } />
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
          path="/for-you"
          element={
            <VerifiedRoute isAuthenticated={isAuthenticated} userType={userType}>
              <ForYou />
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
    </>
  );
};

export default App;
