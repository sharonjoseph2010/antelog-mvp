import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

interface ProtectedRouteProps {
  isAuthenticated: boolean;
  children: ReactNode;
}

interface AdminRouteProps extends ProtectedRouteProps {
  isAdmin: boolean;
}

interface InternalRouteProps extends ProtectedRouteProps {}

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

// Only allow access when navigated from an internal flow
export const InternalRoute = ({ isAuthenticated, children }: InternalRouteProps) => {
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
