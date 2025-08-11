import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Users, ShieldCheck } from "lucide-react";

const Index = () => {
  const handleScrollToSearch = () => {
    const el = document.getElementById("site-search");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Antelog",
    url: window.location.origin,
    description:
      "Trust-powered recommendations. Discover verified lists from real people.",
  };

  return (
    <>
      <Helmet>
        <title>Trust-powered recommendations — Antelog</title>
        <meta
          name="description"
          content="Discover verified lists from real people. No ads, no influencers—just trusted recommendations from your network."
        />
        <link rel="canonical" href={window.location.href} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <main className="min-h-screen bg-background">
        {/* Hero */}
        <section className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Trust-powered recommendations
          </h1>
          <p className="mt-4 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Discover verified lists from real people. No ads, no influencers, just
            trusted recommendations from your network.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button size="lg" onClick={handleScrollToSearch}>
              Search Master Directory
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
                name="q"
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
                <CardTitle>Trust-Based Network</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Connect only with people you know. See recommendations from your
                contacts and their extended network.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="mb-2 text-muted-foreground">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </div>
                <CardTitle>Verified Lists</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Text-only lists from verified users. No sponsored content, no fake
                reviews.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="mb-2 text-muted-foreground">
                  <Search className="h-5 w-5" aria-hidden />
                </div>
                <CardTitle>Smart Discovery</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Find recommendations based on your network and interests, not
                algorithms.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* How It Works */}
        <section className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-semibold">How it works</h2>
            <ol className="mt-6 grid gap-4 md:grid-cols-3 list-decimal list-inside">
              <li className="p-4 rounded-md border bg-card text-card-foreground">
                Get verified
              </li>
              <li className="p-4 rounded-md border bg-card text-card-foreground">
                Create and share lists
              </li>
              <li className="p-4 rounded-md border bg-card text-card-foreground">
                Discover from your network
              </li>
            </ol>
          </div>
        </section>


        {/* Final CTA */}
        <section className="container mx-auto px-4 py-16 text-center">
          <h2 className="text-3xl font-bold">Join the trusted community</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Only verified members can create and share lists.
          </p>
          <div className="mt-6">
            <Button asChild size="lg">
              <Link to="/signup">Get Started</Link>
            </Button>
          </div>
        </section>
      </main>
    </>
  );
};

export default Index;
