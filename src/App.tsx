import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
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
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { ProtectedRoute, AdminRoute, InternalRoute } from "@/components/routes/RouteGuards";
const queryClient = new QueryClient();

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    console.log("[Auth] Initializing auth listener...");
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[Auth] onAuthStateChange:", event, { hasSession: !!session, userId: session?.user?.id });
      setSession(session);
      setUser(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("[Auth] getSession result:", { hasSession: !!session, userId: session?.user?.id });
      setSession(session);
      setUser(session?.user ?? null);
      setInitializing(false);
    });

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
      console.log("[Auth] Logout complete; session cleared");
    }
  };

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Header isAuthenticated={isAuthenticated} isAdmin={isAdmin} onLogout={handleLogout} />
            <Routes>
              <Route path="/" element={initializing ? <div className="min-h-screen flex items-center justify-center">Loading...</div> : (isAuthenticated ? <Navigate to="/dashboard" replace /> : <Index />)} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/login" element={<Login />} />

              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/lists"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <Lists />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/lists/:id/edit"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <ListEdit />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/lists/:id"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <ListDetail />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/lists/new"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <ListsNew />
                  </ProtectedRoute>
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
                path="/contacts/import"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <ContactsImport />
                  </ProtectedRoute>
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
      </QueryClientProvider>
    </HelmetProvider>
  );
};

export default App;
