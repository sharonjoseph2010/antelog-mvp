import { Helmet } from "react-helmet-async";

const Waitlist = () => {
  return (
    <>
      <Helmet>
        <title>Join the Waitlist — Antelog</title>
        <meta
          name="description"
          content="Be among the first to experience the new social platform for students."
        />
      </Helmet>

      <main className="min-h-screen bg-background">
        <section className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Join the Waitlist
          </h1>
          <p className="mt-4 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Be among the first to experience the new social platform for students.
          </p>
          <div className="mt-8 p-6 border rounded-lg bg-card text-card-foreground max-w-md mx-auto">
            <p className="text-muted-foreground">Form coming soon...</p>
          </div>
        </section>
      </main>
    </>
  );
};

export default Waitlist;
