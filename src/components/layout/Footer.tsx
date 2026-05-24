import { Link } from "react-router-dom";

const Footer = ({ isAuthenticated }: { isAuthenticated: boolean }) => {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-6">
        <p className="text-center text-sm text-muted-foreground whitespace-pre-wrap">
          {"Antelog is built on the principle that the best recommendations come from real people you trust, not algorithms or advertising budgets.\n\nPS: In a world optimized for attention, Antelog is optimized for trust. This is a text only platform leaning heavily on utility. The simple black and white design is by intent to make it as accessible as possible. "}
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
