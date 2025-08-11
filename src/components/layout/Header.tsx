import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  isAuthenticated: boolean;
  isAdmin: boolean;
  onLogout: () => Promise<void>;
}

const Header = ({ isAuthenticated, isAdmin, onLogout }: HeaderProps) => {
  const navigate = useNavigate();
  if (!isAuthenticated) return null;

  return (
    <header className="border-b bg-background">
      <nav className="container mx-auto flex h-14 items-center justify-between px-4" aria-label="Main navigation">
        <Link to={isAuthenticated ? "/dashboard" : "/"} className="font-semibold" aria-label="Antelog home">
          Antelog
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="hover:underline">
            Dashboard
          </Link>
          <Link to="/lists" className="hover:underline">
            My Lists
          </Link>
          {isAdmin && (
            <Link to="/admin" className="hover:underline">
              Admin
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={async () => { await onLogout(); navigate("/", { replace: true }); }} aria-label="Log out">
            Logout
          </Button>
        </div>
      </nav>
    </header>
  );
};

export default Header;
