import { Link } from "react-router-dom";

const Footer = ({ isAuthenticated }: { isAuthenticated: boolean }) => {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-6">
        <p className="text-center text-sm text-muted-foreground">
          Antelog is built on the principle that the best recommendations come from real people you trust, not algorithms or advertising budgets.
        </p>
        {isAuthenticated && (
          <nav className="mt-4" aria-label="Footer navigation">
            <ul className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
              <li>
                <Link to="/dashboard" className="hover:underline">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link to="/lists" className="hover:underline">
                  Lists
                </Link>
              </li>
            </ul>
          </nav>
        )}
      </div>
    </footer>
  );
};

export default Footer;
