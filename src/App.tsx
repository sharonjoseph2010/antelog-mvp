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
import { supabase } from "@/integrations/supabase/client";
import { ProtectedRoute, AdminRoute, InternalRoute } from "@/components/routes/RouteGuards";
const queryClient = new QueryClient();

const App = () => {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const isAuthenticated = !!userEmail;
  const isAdmin = userEmail === "sharonjoseph2010@gmail.com";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserEmail(null);
  };

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            {isAuthenticated && (
              <Header isAuthenticated={isAuthenticated} isAdmin={isAdmin} onLogout={handleLogout} />
            )}
            <Routes>
              <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Index />} />
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
                path="/lists/new"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <ListsNew />
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
