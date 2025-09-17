import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Users, ShieldCheck } from "lucide-react";

const Index = () => {
  const isStealthMode = import.meta.env.VITE_STEALTH_MODE === "true";
  
  const handleScrollToSearch = () => {
    const container = document.getElementById("site-search");
    container?.scrollIntoView({ behavior: "smooth", block: "start" });
    const input = document.getElementById("site-search-input") as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background");
      window.setTimeout(() => {
        input.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background");
      }, 1500);
    }
  };

  const content = {
    stealth: {
      title: "A new social platform for students",
      description: "Connect, share, and discover with your network. Built by students, for students.",
      metaDescription: "A new social platform for students. Join the waitlist for early access.",
      buttonText: "Join Waitlist"
    },
    public: {
      title: "Trust-powered recommendations",
      description: "Discover verified lists from real people. No ads, no influencers, just trusted recommendations from your network.",
      metaDescription: "Discover verified lists from real people. No ads, no influencers—just trusted recommendations from your network.",
      buttonText: "Search Master Directory"
    }
  };

  const currentContent = isStealthMode ? content.stealth : content.public;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Antelog",
    url: window.location.origin,
    description: currentContent.metaDescription,
  };

  return (
    <>
      <Helmet>
        <title>{currentContent.title} — Antelog</title>
        <meta
          name="description"
          content={currentContent.metaDescription}
        />
        <link rel="canonical" href={window.location.href} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <main className="min-h-screen bg-background">
        {/* Hero */}
        <section className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            {currentContent.title}
          </h1>
          <p className="mt-4 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            {currentContent.description}
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button size="lg" onClick={handleScrollToSearch}>
              {currentContent.buttonText}
            </Button>
          </div>
          <div id="site-search" className="mt-6 max-w-xl mx-auto">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget as HTMLFormElement;
                const input = form.querySelector('input[name="q"]') as HTMLInputElement | null;
                const q = input?.value?.trim() ?? "";
                window.location.href = q ? `/signup?q=${encodeURIComponent(q)}` : "/signup";
              }}
              role="search"
              aria-label="Search lists, items, or people"
            >
              <Input
                id="site-search-input" name="q"
                type="search"
                placeholder="Search anything and everything..."
                aria-label="Search input"
                className="w-full"
              />
              <Button type="submit" variant="secondary">Search</Button>
            </form>
          </div>
        </section>

        <section id="features" className="container mx-auto px-4 py-12">
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="mb-2 text-muted-foreground">
                  <Users className="h-5 w-5" aria-hidden />
                </div>
                <CardTitle>{isStealthMode ? "Student Network" : "Trust-Based Network"}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                {isStealthMode 
                  ? "Connect with fellow students and discover what matters to your network."
                  : "Connect only with people you know. See recommendations from your contacts and their extended network."
                }
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="mb-2 text-muted-foreground">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </div>
                <CardTitle>{isStealthMode ? "Built for Students" : "Verified Lists"}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                {isStealthMode
                  ? "By students, for students. A platform designed with your needs in mind."
                  : "Text-only lists from verified users. No sponsored content, no fake reviews."
                }
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="mb-2 text-muted-foreground">
                  <Search className="h-5 w-5" aria-hidden />
                </div>
                <CardTitle>{isStealthMode ? "Coming Soon" : "Smart Discovery"}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                {isStealthMode
                  ? "Join the waitlist for early access. Launching soon for students."
                  : "Find recommendations based on your network and interests, not algorithms."
                }
              </CardContent>
            </Card>
          </div>
        </section>

        {/* How It Works */}
        <section className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-semibold">{isStealthMode ? "Join the community" : "How it works"}</h2>
            <ol className="mt-6 grid gap-4 md:grid-cols-3 list-decimal list-inside">
              <li className="p-4 rounded-md border bg-card text-card-foreground">
                {isStealthMode ? "Get verified as a student" : "Get verified"}
              </li>
              <li className="p-4 rounded-md border bg-card text-card-foreground">
                {isStealthMode ? "Connect with your network" : "Create and share lists"}
              </li>
              <li className="p-4 rounded-md border bg-card text-card-foreground">
                {isStealthMode ? "Discover and share" : "Discover from your network"}
              </li>
            </ol>
          </div>
        </section>


        {/* Final CTA */}
        <section className="container mx-auto px-4 py-16 text-center">
          <h2 className="text-3xl font-bold">
            {isStealthMode ? "Join the waitlist" : "Get Started with Antelog"}
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            {isStealthMode 
              ? "Be among the first to experience the new social platform for students."
              : "Choose how you want to join our community of curated recommendations."
            }
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
            {isStealthMode ? (
              <Button asChild size="lg" className="w-full">
                <Link to="/signup">Join Waitlist</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" size="lg" className="flex-1">
                  <Link to="/guest-signup">Browse Directory</Link>
                </Button>
                <Button asChild size="lg" className="flex-1">
                  <Link to="/signup">Get Verified</Link>
                </Button>
              </>
            )}
          </div>
          {!isStealthMode && (
            <div className="mt-4 text-sm text-muted-foreground space-y-1">
              <p><strong>Browse Directory</strong>: Free access to search all recommendations</p>
              <p><strong>Get Verified</strong>: Create lists, build network, full platform access</p>
            </div>
          )}
        </section>
      </main>
    </>
  );
};

export default Index;
