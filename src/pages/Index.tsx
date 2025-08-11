import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Helmet } from "react-helmet-async";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>Antelog — Trusted Lists</title>
        <meta name="description" content="Discover and share trusted, verified lists. Sign up with your SRFTI email to join Antelog." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen flex items-center justify-center bg-background">
        <section className="text-center space-y-6">
          <h1 className="text-4xl font-bold">Welcome to Antelog</h1>
          <p className="text-xl text-muted-foreground">A people‑powered directory of verified recommendations.</p>
          <div>
            <Button asChild size="lg">
              <Link to="/signup">Sign up with SRFTI email</Link>
            </Button>
          </div>
        </section>
      </main>
    </>
  );
};

export default Index;
