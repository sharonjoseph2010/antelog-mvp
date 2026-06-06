import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface ProtectedRouteProps {
  isAuthenticated: boolean;
  children: ReactNode;
}

interface AdminRouteProps extends ProtectedRouteProps {
  isAdmin: boolean;
  // True while the admin role is still being resolved from the DB. Gate the
  // non-admin redirect on this so a legitimate admin isn't bounced mid-check.
  isAdminLoading?: boolean;
}

interface VerifiedRouteProps extends ProtectedRouteProps {
  userType?: 'verified' | 'guest' | null;
}

interface GuestRouteProps extends ProtectedRouteProps {
  userType?: 'verified' | 'guest' | null;
}

// Gate that blocks rendering until we know if the user has completed
// the onboarding questionnaire. New users get redirected to /welcome.
const QuestionnaireGate = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const [status, setStatus] = useState<"loading" | "ok" | "needs_welcome">("loading");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (mounted) setStatus("ok"); // ProtectedRoute handles unauth above
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("questionnaire_completed")
          .eq("id", session.user.id)
          .maybeSingle();
        if (!mounted) return;
        if (error) {
          console.warn("[QuestionnaireGate] profile fetch error", error);
          setStatus("ok");
          return;
        }
        // Treat missing profile as "ok" — profile-setup flow handles it.
        if (data && data.questionnaire_completed === false) {
          setStatus("needs_welcome");
        } else {
          setStatus("ok");
        }
      } catch (e) {
        console.warn("[QuestionnaireGate] error", e);
        if (mounted) setStatus("ok");
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (status === "needs_welcome" && location.pathname !== "/welcome") {
    return <Navigate to="/welcome" replace />;
  }
  return <>{children}</>;
};

export const ProtectedRoute = ({ isAuthenticated, children }: ProtectedRouteProps) => {
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <QuestionnaireGate>{children}</QuestionnaireGate>;
};

export const AdminRoute = ({ isAuthenticated, isAdmin, isAdminLoading, children }: AdminRouteProps) => {
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (isAdminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

// Only allow verified users to access social features
export const VerifiedRoute = ({ isAuthenticated, userType, children }: VerifiedRouteProps) => {
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (userType === 'guest') {
    return <Navigate to="/directory" replace />;
  }
  return <QuestionnaireGate>{children}</QuestionnaireGate>;
};

// Guest users can only access directory
export const GuestRoute = ({ isAuthenticated, userType, children }: GuestRouteProps) => {
  if (!isAuthenticated) {
    return <Navigate to="/guest-signup" replace />;
  }
  if (userType === 'verified') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

// Gates the onboarding routes (/profile-setup, /verify) on the user's ACTUAL
// server-side profile state rather than a spoofable `location.state.internal`
// flag (#14). A user whose profile is complete and verified has no business on
// these pages and is sent to the dashboard.
export const InternalRoute = ({ isAuthenticated, children }: ProtectedRouteProps) => {
  const [status, setStatus] = useState<"loading" | "ok" | "deny">("loading");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        if (mounted) setStatus("deny");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("full_name, handle, verification_status")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!mounted) return;
      const incomplete = !data || !data.full_name || !data.handle;
      const unverified = data?.verification_status !== "verified";
      setStatus(incomplete || unverified ? "ok" : "deny");
    })();
    return () => { mounted = false; };
  }, []);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (status === "deny") {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};
