import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  isAuthenticated: boolean;
  isAdmin: boolean;
  onLogout: () => Promise<void>;
}

const Header = ({ isAuthenticated, isAdmin, onLogout }: HeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="border-b bg-background">
      <nav className="container mx-auto flex h-14 items-center justify-between px-4" aria-label="Main navigation">
        <Link to={isAuthenticated ? "/dashboard" : "/"} className="font-bold text-2xl md:text-3xl" aria-label="Antelog home">
          Antelog
        </Link>
        {isAuthenticated ? (
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="hover:underline">
              Dashboard
            </Link>
            <Link to="/lists" className="hover:underline">
              My Lists
            </Link>
            <Link to="/friends" className="hover:underline">
              Friends
            </Link>
            <Link to="/contacts" className="hover:underline">
              Contacts
            </Link>
            {isAdmin && (
              <Link to="/admin" className="hover:underline">
                Admin
              </Link>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await onLogout();
                const to = "/";
                navigate(to, { replace: true });
              }}
              aria-label="Log out"
            >
              Logout
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link to="/login" className="hover:underline">
              Sign In
            </Link>
            <Button asChild size="sm">
              <Link to="/signup">Sign Up</Link>
            </Button>
          </div>
        )}
      </nav>
    </header>
  );
};

export default Header;
