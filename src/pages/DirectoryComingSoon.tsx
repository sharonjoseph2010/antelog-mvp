import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const DirectoryComingSoon = () => {
  return (
    <>
      <Helmet>
        <title>Master Directory — Coming soon · Antelog</title>
        <meta name="description" content="The Master Directory is coming soon to Antelog." />
      </Helmet>
      <main className="min-h-[60vh] flex items-center justify-center px-6 py-16">
        <div className="max-w-md text-center">
          <p className="mb-3 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Master Directory
          </p>
          <h1 className="mb-3 text-2xl font-semibold tracking-tight">Coming soon</h1>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            The Master Directory is being polished for beta. It will be available shortly.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </main>
    </>
  );
};

export default DirectoryComingSoon;