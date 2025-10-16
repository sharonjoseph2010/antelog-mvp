import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

interface ProtectedRouteProps {
  isAuthenticated: boolean;
  children: ReactNode;
}

interface AdminRouteProps extends ProtectedRouteProps {
  isAdmin: boolean;
}

interface VerifiedRouteProps extends ProtectedRouteProps {
  userType?: 'verified' | 'guest' | null;
}

interface GuestRouteProps extends ProtectedRouteProps {
  userType?: 'verified' | 'guest' | null;
}

export const ProtectedRoute = ({ isAuthenticated, children }: ProtectedRouteProps) => {
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
};

export const AdminRoute = ({ isAuthenticated, isAdmin, children }: AdminRouteProps) => {
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
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
  return <>{children}</>;
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

// Only allow access when navigated from an internal flow
export const InternalRoute = ({ isAuthenticated, children }: ProtectedRouteProps) => {
  const location = useLocation() as any;
  const internal = location?.state?.internal === true;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!internal) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};
