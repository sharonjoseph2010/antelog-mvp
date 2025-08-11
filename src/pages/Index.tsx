import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Helmet } from "react-helmet-async";


const Index = () => {
  


  return (
    <>
      <Helmet>
        <title>Antelog — Trusted Lists</title>
        <meta name="description" content="Discover and share trusted, verified lists. Create your account to join Antelog." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>
      <main className="min-h-screen flex items-center justify-center bg-background">
        <section className="text-center space-y-6">
          <h1 className="text-4xl font-bold">Discover trusted lists</h1>
          <p className="text-xl text-muted-foreground">A people‑powered directory of verified recommendations.</p>
          <div className="flex items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">Create account</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </section>
      </main>
    </>
  );
};

export default Index;
