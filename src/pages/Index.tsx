import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";

const Index = () => {
  const metaDescription =
    "Antelog is where verified people share real recommendations — with the people they know, and the people they don't.";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Antelog",
    url: window.location.origin,
    description: metaDescription,
  };

  return (
    <>
      <Helmet>
        <title>Some things the internet just can't tell you — Antelog</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={window.location.href} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <main className="min-h-screen bg-background text-foreground">
        {/* Hero */}
        <section className="mx-auto max-w-[760px] px-5 pt-12 pb-11 text-center sm:px-6 md:pt-16">
          <p className="mb-4 text-[11px] uppercase tracking-[0.06em] text-muted-foreground sm:tracking-[0.1em]">
            Recommendations · text only · network powered
          </p>
          <h1 className="mx-auto mb-4 max-w-[580px] text-[28px] font-bold leading-[1.15] sm:text-[32px] md:text-[40px]">
            Some things the internet just can't tell you.
          </h1>
          <p className="mx-auto mb-6 max-w-[500px] text-[16px] leading-relaxed text-muted-foreground sm:text-[18px]">
            For everything else, there's your network. Antelog is where verified people share real recommendations — with the people they know, and the people they don't.
          </p>
          <div className="inline-flex flex-wrap justify-center gap-2.5">
            <Button asChild size="lg">
              <Link to="/waitlist">Join Waitlist</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/directory">Browse the Directory</Link>
            </Button>
          </div>
        </section>

        {/* Two paths */}
        <section className="mx-auto max-w-[1120px] px-5 pb-12 sm:px-6">
          <div className="grid grid-cols-1 gap-3.5 min-[900px]:grid-cols-2">
            <div className="rounded-lg bg-muted p-6">
              <p className="mb-2.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Your network
              </p>
              <h3 className="mb-2.5 text-[22px] font-medium">
                Ask the people who'd actually know.
              </h3>
              <p className="text-[15px] leading-[1.55] text-muted-foreground">
                Send a niche question to your friends and their extended network. Get answers from people who've been there, tried that, done it. Every recommendation traceable to a real person.
              </p>
            </div>
            <div className="rounded-lg bg-muted p-6">
              <p className="mb-2.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Master Directory
              </p>
              <h3 className="mb-2.5 text-[22px] font-medium">
                Browse what verified people use.
              </h3>
              <p className="text-[15px] leading-[1.55] text-muted-foreground">
                A growing library of community-ranked lists across categories — cafes, gear, services, doctors, anything. Free to read. Subscribe to vote and contribute.
              </p>
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section className="mx-auto max-w-[1120px] border-t border-border px-5 py-11 sm:px-6">
          <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Real people, verified once",
                body: "One human, one account. Aadhaar or PAN. The verification is what keeps the answers honest.",
              },
              {
                title: "Quiet by design",
                body: "Text only. No infinite feed. No follower counts. No likes. Just recommendations, plainly.",
              },
              {
                title: "Trust, traceable",
                body: "See exactly how every recommendation reached you — who asked, who passed it on, who answered.",
              },
            ].map((p) => (
              <div key={p.title}>
                <h4 className="mb-1.5 text-base font-medium">{p.title}</h4>
                <p className="text-sm leading-[1.55] text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-[1120px] border-t border-border px-5 py-11 sm:px-6">
          <h3 className="mb-7 text-center text-[22px] font-medium">How Antelog works</h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                n: "01",
                title: "Get verified",
                body: "One verified account. That's how we keep real people in and everything else out.",
              },
              {
                n: "02",
                title: "Build your network",
                body: "Your contacts on Antelog are your 1st network. Their friends are your extended. That's where the answers come from.",
              },
              {
                n: "03",
                title: "Ask, share, browse",
                body: "Send requests, share your own lists, look up the Directory. Everything text, nothing performative.",
              },
            ].map((s) => (
              <div key={s.n}>
                <p className="mb-1.5 text-[11px] tracking-[0.04em] text-muted-foreground">{s.n}</p>
                <p className="mb-1.5 text-base font-medium">{s.title}</p>
                <p className="text-sm leading-[1.55] text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="border-t border-border px-5 py-12 text-center sm:px-6">
          <h3 className="mx-auto mb-[18px] max-w-[460px] text-[26px] font-medium leading-[1.3]">
            Your network knows more than you think.
          </h3>
          <Button asChild size="lg">
            <Link to="/waitlist">Join Waitlist</Link>
          </Button>
        </section>
      </main>
    </>
  );
};

export default Index;
