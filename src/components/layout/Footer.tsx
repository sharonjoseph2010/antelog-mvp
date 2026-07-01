import { Link } from "react-router-dom";

const Footer = ({ isAuthenticated }: { isAuthenticated: boolean }) => {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-8 sm:py-10">
        <p className="mx-auto max-w-[560px] text-center text-sm leading-relaxed text-muted-foreground">
          Antelog is built on the principle that the best recommendations come from real people you trust, not algorithms or advertising budgets.
        </p>

        <div className="mx-auto mt-6 flex max-w-[520px] items-start gap-3 sm:mt-7">
          <span
            aria-hidden
            className="mt-[7px] hidden h-px flex-1 bg-border sm:block"
          />
          <p className="text-center text-[13px] italic leading-[1.65] text-muted-foreground/80 sm:text-left">
            <span className="mr-1.5 align-[1px] text-[10px] not-italic uppercase tracking-[0.14em] text-muted-foreground/70">
              PS
            </span>
            In a world optimized for attention, Antelog is optimized for trust. This is a text-only platform leaning heavily on utility. The simple black and white design is by intent — to make it as accessible as possible.
          </p>
          <span
            aria-hidden
            className="mt-[7px] hidden h-px flex-1 bg-border sm:block"
          />
        </div>

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
