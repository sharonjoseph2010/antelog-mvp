import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t bg-background">
      <nav className="container mx-auto px-4 py-6" aria-label="Footer navigation">
        <ul className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
          <li>
            <Link to="/" className="hover:underline">
              Home
            </Link>
          </li>
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
          <li>
            <Link to="/verify" className="hover:underline">
              Verify
            </Link>
          </li>
        </ul>
      </nav>
    </footer>
  );
};

export default Footer;
