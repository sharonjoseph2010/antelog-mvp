import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  isAuthenticated: boolean;
  isAdmin: boolean;
  userType?: 'verified' | 'guest' | null;
  onLogout: () => Promise<void>;
}

const Header = ({ isAuthenticated, isAdmin, userType, onLogout }: HeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="border-b bg-background">
      <nav className="container mx-auto flex h-14 items-center justify-between px-4" aria-label="Main navigation">
        <Link to={isAuthenticated ? "/dashboard" : "/"} className="font-bold text-2xl md:text-3xl" aria-label="Antelog home">
          Antelog
        </Link>
        
        <div className="flex items-center gap-4">
          {/* Directory is always accessible */}
          <Link to="/directory" className="hover:underline">
            Directory
          </Link>
          
          {isAuthenticated && userType === 'verified' ? (
            <>
              <Link to="/dashboard" className="hover:underline">Dashboard</Link>
              <Link to="/lists" className="hover:underline">My Lists</Link>
              <Link to="/friends" className="hover:underline">Friends</Link>
              <Link to="/groups" className="hover:underline">Groups</Link>
              <Link to="/requests" className="hover:underline">Requests</Link>
              <Link to="/contacts" className="hover:underline">Contacts</Link>
              {isAdmin && <Link to="/admin" className="hover:underline">Admin</Link>}
              <Button variant="outline" size="sm" onClick={async () => {
                await onLogout();
                navigate("/", { replace: true });
              }}>
                Logout
              </Button>
            </>
          ) : isAuthenticated && userType === 'guest' ? (
            <>
              <Link to="/signup">
                <Button variant="outline" size="sm">Upgrade to Verified</Button>
              </Link>
              <Button variant="outline" size="sm" onClick={async () => {
                await onLogout();
                navigate("/", { replace: true });
              }}>
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/guest-signup" className="hover:underline">Browse Directory</Link>
              <Link to="/login" className="hover:underline">Sign In</Link>
              <Button asChild size="sm">
                <Link to="/signup">Get Verified</Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
};

export default Header;